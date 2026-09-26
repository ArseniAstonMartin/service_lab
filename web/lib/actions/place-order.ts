"use server";

import { z } from "zod";
import type { OrderStatus, PhotoType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePartNumber } from "@/lib/domain/part-number";
import { decideMatch } from "@/lib/domain/compatibility";
import { quote } from "@/lib/domain/quote";
import { generateTrackingToken } from "@/lib/domain/token";
import { isVercelBlobUrl } from "@/lib/blob";
import { advanceOrderStatus } from "@/lib/services/order-status";

const RETURN_SHIPPING_FEE_KEY = "return_shipping_fee_cents";

const placeOrderSchema = z.object({
  vehicle: z.object({
    make: z.string().min(1),
    model: z.string().min(1),
    year: z.number().int(),
  }),
  categoryId: z.string().min(1),
  partNumber: z.string().min(1),
  stickerPhotoUrl: z.string().min(1),
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
    street: z.string().trim().min(1),
    city: z.string().trim().min(1),
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/),
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

  if (!isVercelBlobUrl(parsed.stickerPhotoUrl)) {
    throw new Error("stickerPhotoUrl must be a Vercel Blob URL");
  }

  let categoryId: bigint;
  try {
    categoryId = BigInt(parsed.categoryId);
  } catch {
    throw new Error("Invalid categoryId");
  }

  const normalizedPartNumber = normalizePartNumber(parsed.partNumber);

  const vehicle = await prisma.vehicle.findUnique({
    where: {
      make_model_year: {
        make: parsed.vehicle.make,
        model: parsed.vehicle.model,
        year: parsed.vehicle.year,
      },
    },
  });
  // Order.vehicleId is required: the wizard only ever offers real
  // vehicles (TASK-016), so this shouldn't normally happen, but there is
  // no vehicle to attach the order to if it does.
  if (!vehicle) {
    throw new Error("Vehicle not found");
  }

  const entry = await prisma.compatibilityEntry.findUnique({
    where: {
      vehicleId_categoryId_partNumber: {
        vehicleId: vehicle.id,
        categoryId,
        partNumber: normalizedPartNumber,
      },
    },
    include: {
      services: {
        include: { service: { include: { priceTier: true } } },
      },
    },
  });

  const entrySummary = entry ? { id: entry.id.toString() } : null;
  const entryServices = (entry?.services ?? []).map((link) => ({
    id: link.service.id.toString(),
    name: link.service.name,
    priceCents: link.service.priceTier.amountCents,
  }));

  // The single source of truth for whether this is a match — exactly
  // TASK-010's decideMatch(), the same rule checkCompatibility applies.
  // The client's own (TASK-018) match result plays no part in this
  // decision.
  const matchResult = decideMatch(entrySummary, entryServices);

  // Fields that differ between the two paths; filled in below.
  let matchedEntryId: bigint | null = null;
  let serviceId: bigint | null = null;
  let servicePriceCents: number | null = null;
  let returnShippingFeeCents: number | null = null;
  let totalAmountCents: number | null = null;
  const textAnswers: Record<string, string> = {};
  const photoAnswersToStore: Record<string, string> = {};

  if (matchResult.matched) {
    const selected = matchResult.services.find((service) => service.id === parsed.serviceId);
    if (!selected) {
      throw new Error("serviceId must be one of the services confirmed for this part number");
    }

    matchedEntryId = BigInt(matchResult.entryId as string);
    serviceId = BigInt(selected.id);

    const feeSetting = await prisma.appSetting.findUnique({
      where: { key: RETURN_SHIPPING_FEE_KEY },
    });
    const feeAmount = feeSetting ? Number.parseInt(feeSetting.value, 10) : 0;
    const priced = quote(selected.priceCents, feeAmount);
    servicePriceCents = priced.servicePriceCents;
    returnShippingFeeCents = priced.returnShippingFeeCents;
    totalAmountCents = priced.totalCents;

    // Re-validate required answers/photos against the LIVE question set
    // for this service (not just whatever the client happened to submit
    // — a stale or hand-crafted payload could omit a required field).
    const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
    const ownQuestions = await prisma.questionDefinition.findMany({
      where: { questionSetCode: service.questionSetCode },
    });
    const followUpQuestions =
      service.questionSetCode === "FOLLOW_UP"
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
        vehicleId: vehicle.id,
        categoryId,
        partNumberEntered: normalizedPartNumber,
        matchedEntryId,
        serviceId,
        description: parsed.description,
        customerName: parsed.contact.name,
        customerEmail: parsed.contact.email,
        customerPhone: parsed.contact.phone,
        returnAddressStreet: parsed.contact.street,
        returnAddressCity: parsed.contact.city,
        returnAddressState: parsed.contact.state,
        returnAddressZip: parsed.contact.zip,
        servicePriceCents,
        returnShippingFeeCents,
        totalAmountCents,
        idempotencyKey: parsed.idempotencyKey,
      },
    });

    await tx.orderPhoto.create({
      data: { orderId: created.id, photoType: "sticker", blobUrl: parsed.stickerPhotoUrl },
    });

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

  if (matchResult.matched) {
    const advanced = await advanceOrderStatus(order.id, "awaiting_payment", "system");
    return {
      orderNumber: advanced.id.toString(),
      trackingToken: advanced.trackingToken,
      status: advanced.status,
    };
  }

  return {
    orderNumber: order.id.toString(),
    trackingToken: order.trackingToken,
    status: order.status,
  };
}
