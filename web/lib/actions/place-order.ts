"use server";

import "server-only";
import { z } from "zod";
import type { OrderStatus, PhotoType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePartNumber } from "@/lib/domain/part-number";
import { decideMatch, type MatchResult } from "@/lib/domain/compatibility";
import { NO_PART_NUMBER_SENTINEL, NO_RETURN_ADDRESS_SENTINEL } from "@/lib/domain/coverage";
import { lookupCompatibility, servicesFromEntry } from "@/lib/services/compatibility-lookup";
import { quote } from "@/lib/domain/quote";
import { generateTrackingToken } from "@/lib/domain/token";
import { isVercelBlobUrl } from "@/lib/blob";
import { sendOrderEmail } from "@/lib/email/send";
import { postWebhook } from "@/lib/webhook";
import { advanceOrderStatus } from "@/lib/services/order-status";
// Side-effect-only import: TASK-026's lib/services/payment.ts registers
// itself as the awaiting_payment side effect at module load time, and
// that registration only takes effect once this module has been
// imported somewhere. This is the only current caller that moves an
// order into awaiting_payment, so it must import it. See the docblock
// on payment.ts's registerStatusSideEffect() call for the full rule.
import "@/lib/services/payment";

const RETURN_SHIPPING_FEE_KEY = "return_shipping_fee_cents";

// Webhook endpoint for the n8n workflow that acts on a new ECU/module
// order (notifications, etc.) -- same fixed, non-secret-URL reasoning
// as lib/actions/book-mobile-service.ts's N8N_BOOKING_WEBHOOK_URL.
const N8N_ECU_WEBHOOK_URL = "https://bestkeyservice.app.n8n.cloud/webhook/ecu-booked";

const placeOrderSchema = z.object({
  vehicle: z.object({
    make: z.string().min(1),
    model: z.string().min(1),
    year: z.number().int(),
  }),
  categoryId: z.string().min(1),
  // Both required for an ordinary part-number category; both ignored
  // (and, on the wizard side, never even shown) for a category like
  // Vehicle Diagnostics with requiresPartNumber false. Enforced below,
  // once the category itself has been looked up -- see
  // lib/actions/compatibility.ts's checkCompatibility for the same
  // shape-can't-express-this-conditional-requirement reasoning.
  partNumber: z.string(),
  stickerPhotoUrl: z.string(),
  // Present only when the wizard's own (client-side) match result was
  // matched and a service was picked on /order/service. Never trusted as
  // proof of a match on its own — see below, the server re-derives the
  // match from scratch and ignores this entirely on the pending-review
  // path.
  serviceId: z.string().min(1).nullable(),
  description: z.string().min(1),
  // questionCode -> answer / Blob URL. Only meaningful (and only
  // persisted) when the server's own match confirms a service; on the
  // pending-review path there is no question set to validate against,
  // so these are ignored entirely regardless of what the client sends.
  answers: z.record(z.string()),
  photoAnswers: z.record(z.string()),
  contact: z.object({
    name: z.string().trim().min(1),
    email: z.string().trim().email(),
    phone: z.string().trim().min(1),
    // All four required for an ordinary part-number category (a module
    // is being shipped back); ignored (and, on the wizard side, never
    // shown) for one like Vehicle Diagnostics with requiresPartNumber
    // false -- nothing is being shipped back, so there's no return
    // address to collect. Same shape-can't-express-a-conditional-
    // requirement reasoning as partNumber/stickerPhotoUrl above:
    // enforced in code, once the category's been looked up, not here.
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  }),
  // Generated once per wizard session on the client (TASK-021). A repeat
  // submit with the same key (double-click, back button, retry after a
  // dropped response) returns the already-created order instead of
  // creating a duplicate.
  idempotencyKey: z.string().min(1),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export type PlaceOrderResult = {
  orderNumber: string;
  trackingToken: string;
  status: OrderStatus;
};

/**
 * Maps a photo-type dynamic question to the Order's fixed PhotoType enum
 * (sticker/donor/original — there is no generic "other" value).
 *
 * Judgment call, same shape as TASK-020's questionSetCode gap: today the
 * only photo-type questions in the seed data (prisma/seed.ts's CLONING
 * set) are "original_photo" and "donor_photo", so those are the only two
 * mappings that exist. A future photo question with any other code has
 * nowhere to go in this schema — this throws rather than silently
 * dropping or mis-tagging the photo, so a schema gap surfaces immediately
 * instead of corrupting an order's photo type.
 */
function photoTypeForQuestionCode(questionCode: string): PhotoType {
  if (questionCode === "donor_photo") return "donor";
  if (questionCode === "original_photo") return "original";
  throw new Error(`No PhotoType mapping for photo question "${questionCode}"`);
}

/**
 * Creates an order from the completed wizard, covering both the matched
 * path (a confirmed service, quote snapshot, and an immediate move to
 * awaiting_payment) and the pending-review path (no service, no price
 * yet, an admin must confirm compatibility first — TASK-036).
 *
 * Never trusts anything the client computed earlier in the wizard: the
 * compatibility match is re-derived here from a live Prisma lookup (the
 * same rule checkCompatibility itself follows), and every required
 * question/photo for the selected service is re-validated against the
 * live QuestionDefinition rows, not just the ones the client happened to
 * render.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.parse(input);

  // Idempotency: a repeat submit with the same key returns the order
  // that was already created for it, rather than creating a second one.
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: parsed.idempotencyKey },
  });
  if (existing) {
    return {
      orderNumber: existing.id.toString(),
      trackingToken: existing.trackingToken,
      status: existing.status,
    };
  }

  let categoryId: bigint;
  try {
    categoryId = BigInt(parsed.categoryId);
  } catch {
    throw new Error("Invalid categoryId");
  }

  // Category and the ordinary vehicle/part-number lookup run in
  // parallel -- same reasoning as checkCompatibility's identical
  // Promise.all: requiresPartNumber isn't known until the category
  // query resolves, but speculatively starting the lookup whenever a
  // part number was at least submitted avoids adding a second
  // sequential round trip to every order for the common case.
  const [category, speculativeLookup] = await Promise.all([
    prisma.moduleCategory.findUnique({ where: { id: categoryId } }),
    parsed.partNumber.trim()
      ? lookupCompatibility({
          make: parsed.vehicle.make,
          model: parsed.vehicle.model,
          year: parsed.vehicle.year,
          categoryId,
          partNumber: parsed.partNumber,
        })
      : null,
  ]);
  if (!category) {
    throw new Error("Invalid categoryId");
  }

  // Same conditional-on-the-category story as partNumber/stickerPhotoUrl:
  // a real return address, format-checked, for an ordinary category (a
  // module is being shipped back); the sentinel otherwise, regardless of
  // whatever the client sent for these fields -- nothing is being
  // shipped back for Vehicle Diagnostics, so there's nothing to trust or
  // validate here.
  let returnAddress: { street: string; city: string; state: string; zip: string };
  if (category.requiresPartNumber) {
    const { street, city, state, zip } = parsed.contact;
    if (!street.trim() || !city.trim()) {
      throw new Error("A full return address is required for this category.");
    }
    const normalizedState = state.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalizedState)) {
      throw new Error("Return address state must be a 2-letter code.");
    }
    const trimmedZip = zip.trim();
    if (!/^\d{5}(-\d{4})?$/.test(trimmedZip)) {
      throw new Error("Return address ZIP must be a valid US ZIP code.");
    }
    returnAddress = { street: street.trim(), city: city.trim(), state: normalizedState, zip: trimmedZip };
  } else {
    returnAddress = { ...NO_RETURN_ADDRESS_SENTINEL };
  }

  let vehicleId: bigint;
  let normalizedPartNumber: string;
  // The single source of truth for whether this is a match — exactly
  // TASK-010's decideMatch() for an ordinary category, or the
  // equivalent "this category's one Service always matches" rule
  // checkCompatibility applies for one like Vehicle Diagnostics. The
  // client's own (TASK-018) match result plays no part in this decision
  // either way.
  let matchResult: MatchResult;

  if (category.requiresPartNumber) {
    normalizedPartNumber = normalizePartNumber(parsed.partNumber);

    // speculativeLookup is only null here if partNumber was somehow
    // empty after all.
    if (!speculativeLookup) {
      throw new Error("partNumber is required for this category");
    }
    const { vehicle, entry } = speculativeLookup;
    // Order.vehicleId is required: the wizard only ever offers real
    // vehicles (TASK-016), so this shouldn't normally happen, but there
    // is no vehicle to attach the order to if it does.
    if (!vehicle) {
      throw new Error("Vehicle not found");
    }
    vehicleId = vehicle.id;

    const entrySummary = entry ? { id: entry.id.toString() } : null;
    const entryServices = entry ? servicesFromEntry(entry) : [];
    matchResult = decideMatch(entrySummary, entryServices);

    // A photo is only required once the part number couldn't be
    // auto-matched -- that's the one case a human needs it to manually
    // verify the module. An auto-matched part number was never shown a
    // photo upload control in the wizard at all (VehicleModulePartForm
    // only reveals it after a not-matched result), so never require one.
    if (!matchResult.matched && !isVercelBlobUrl(parsed.stickerPhotoUrl)) {
      throw new Error(
        "A photo of the module's label is required when the part number can't be auto-matched.",
      );
    }
  } else {
    normalizedPartNumber = NO_PART_NUMBER_SENTINEL;

    const vehicle = await prisma.vehicle.findUnique({
      where: { make_model_year: parsed.vehicle },
    });
    if (!vehicle) {
      throw new Error("Vehicle not found");
    }
    vehicleId = vehicle.id;

    const services = await prisma.service.findMany({
      where: { categoryId },
      include: { priceTier: true },
    });
    const matched = services.length > 0;
    matchResult = {
      matched,
      entryId: null,
      services: matched
        ? services.map((service) => ({
            id: service.id.toString(),
            name: service.name,
            priceCents: service.priceTier.amountCents > 0 ? service.priceTier.amountCents : null,
          }))
        : [],
    };
  }

  // Fields that differ between the two paths; filled in below.
  let matchedEntryId: bigint | null = null;
  let serviceId: bigint | null = null;
  let servicePriceCents: number | null = null;
  let returnShippingFeeCents: number | null = null;
  let totalAmountCents: number | null = null;
  let matchedServiceName: string | null = null;
  const textAnswers: Record<string, string> = {};
  const photoAnswersToStore: Record<string, string> = {};

  if (matchResult.matched) {
    const selected = matchResult.services.find((service) => service.id === parsed.serviceId);
    if (!selected) {
      throw new Error("serviceId must be one of the confirmed services");
    }

    matchedEntryId = matchResult.entryId !== null ? BigInt(matchResult.entryId as string) : null;
    serviceId = BigInt(selected.id);
    matchedServiceName = selected.name;

    const feeSetting = await prisma.appSetting.findUnique({
      where: { key: RETURN_SHIPPING_FEE_KEY },
    });
    const feeAmount = feeSetting ? Number.parseInt(feeSetting.value, 10) : 0;
    if (selected.priceCents !== null) {
      const priced = quote(selected.priceCents, feeAmount);
      servicePriceCents = priced.servicePriceCents;
      returnShippingFeeCents = priced.returnShippingFeeCents;
      totalAmountCents = priced.totalCents;
    }

    // Re-validate required answers/photos against the LIVE question set
    // for this service (not just whatever the client happened to submit
    // — a stale or hand-crafted payload could omit a required field).
    // Same FOLLOW_UP exclusion as lib/actions/questions.ts's
    // getQuestions (which is what actually rendered the form the
    // customer filled in) -- must match exactly, or this would reject
    // an order for a required answer to a question that was never shown.
    const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
    const ownQuestions = await prisma.questionDefinition.findMany({
      where: { questionSetCode: service.questionSetCode },
    });
    const followUpQuestions =
      service.questionSetCode === "FOLLOW_UP" || !category.requiresPartNumber
        ? []
        : await prisma.questionDefinition.findMany({ where: { questionSetCode: "FOLLOW_UP" } });
    const questions = [...ownQuestions, ...followUpQuestions];

    for (const question of questions) {
      const isPhoto = question.answerType === "photo";
      const value = isPhoto
        ? parsed.photoAnswers[question.questionCode]
        : parsed.answers[question.questionCode];

      if (question.required && !value?.trim()) {
        throw new Error(`Missing required answer for question "${question.questionCode}"`);
      }
      if (!value) continue;

      if (isPhoto) {
        if (!isVercelBlobUrl(value)) {
          throw new Error(`Answer for "${question.questionCode}" must be a Vercel Blob URL`);
        }
        photoAnswersToStore[question.questionCode] = value;
      } else {
        textAnswers[question.questionCode] = value;
      }
    }
  }
  // else: pending_review path. matchedEntryId/serviceId/price fields stay
  // null, and any answers/photoAnswers the client sent are ignored — there
  // is no service yet to validate them against (see acceptance criteria:
  // "the pending-review path shows only the description").

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        trackingToken: generateTrackingToken(),
        vehicleId,
        categoryId,
        partNumberEntered: normalizedPartNumber,
        matchedEntryId,
        serviceId,
        description: parsed.description,
        customerName: parsed.contact.name,
        customerEmail: parsed.contact.email,
        customerPhone: parsed.contact.phone,
        returnAddressStreet: returnAddress.street,
        returnAddressCity: returnAddress.city,
        returnAddressState: returnAddress.state,
        returnAddressZip: returnAddress.zip,
        servicePriceCents,
        returnShippingFeeCents,
        totalAmountCents,
        idempotencyKey: parsed.idempotencyKey,
      },
    });

    // A sticker photo only ever exists when the part number wasn't
    // auto-matched (checked above) -- there's none to store for a
    // no-part-number category (Vehicle Diagnostics, never asked for
    // one) or for a successfully auto-matched part number (the wizard
    // never shows the upload control for that case either).
    if (isVercelBlobUrl(parsed.stickerPhotoUrl)) {
      await tx.orderPhoto.create({
        data: { orderId: created.id, photoType: "sticker", blobUrl: parsed.stickerPhotoUrl },
      });
    }

    for (const [questionCode, blobUrl] of Object.entries(photoAnswersToStore)) {
      await tx.orderPhoto.create({
        data: { orderId: created.id, photoType: photoTypeForQuestionCode(questionCode), blobUrl },
      });
    }

    for (const [questionCode, answerValue] of Object.entries(textAnswers)) {
      await tx.orderAnswer.create({
        data: { orderId: created.id, questionCode, answerValue },
      });
    }

    // The order's initial status (pending_review, Prisma's column
    // default) gets its own history row here, in the same transaction as
    // the order/photos/answers — the matched path's move to
    // awaiting_payment is a SEPARATE transition below, through
    // advanceOrderStatus, exactly like every other status change in this
    // app.
    await tx.orderStatusHistory.create({
      data: { orderId: created.id, status: "pending_review", changedBy: "system" },
    });

    return created;
  });

  let result: PlaceOrderResult;
  if (matchResult.matched && servicePriceCents !== null) {
    const advanced = await advanceOrderStatus(order.id, "awaiting_payment", "system");
    result = {
      orderNumber: advanced.id.toString(),
      trackingToken: advanced.trackingToken,
      status: advanced.status,
    };
  } else {
    result = {
      orderNumber: order.id.toString(),
      trackingToken: order.trackingToken,
      status: order.status,
    };
  }

  // Emails #1 (customer: order submitted) and #5 (admin: new order) —
  // TASK-042 — plus the n8n webhook notification, all sent for both
  // paths, only AFTER every DB write above has already committed (the
  // order/photos/answers transaction, plus the matched path's own
  // separate advanceOrderStatus transition). sendOrderEmail() and
  // postWebhook() never throw — a failure is logged (to EmailLog, or
  // via logServerError) and can never turn an already-successful
  // placeOrder call into a failed one.
  await Promise.all([
    sendOrderEmail(order.id, "order_submitted"),
    sendOrderEmail(order.id, "admin_new_order"),
    postWebhook("place-order-webhook", N8N_ECU_WEBHOOK_URL, {
      orderId: order.id.toString(),
      trackingToken: order.trackingToken,
      status: result.status,
      customer: {
        name: parsed.contact.name,
        email: parsed.contact.email,
        phone: parsed.contact.phone,
      },
      vehicle: parsed.vehicle,
      category: category.name,
      partNumber: normalizedPartNumber,
      matched: matchResult.matched,
      service: matchedServiceName ? { name: matchedServiceName, priceCents: servicePriceCents } : null,
      totalAmountCents,
      description: parsed.description,
      submittedAt: order.createdAt.toISOString(),
    }),
  ]);

  return result;
}
