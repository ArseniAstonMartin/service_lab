"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { EntrySource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { quote } from "@/lib/domain/quote";
import { advanceOrderStatus } from "@/lib/services/order-status";
// Side-effect-only import: TASK-026's lib/services/payment.ts registers
// itself as the awaiting_payment side effect at module load time. This
// is the second (and last, for now) caller that ever moves an order
// into awaiting_payment — see the docblock on payment.ts's
// registerStatusSideEffect() call for the full rule this import
// satisfies.
import "@/lib/services/payment";

const RETURN_SHIPPING_FEE_KEY = "return_shipping_fee_cents";

const confirmCompatibilitySchema = z
  .object({
    orderId: z.string().min(1),
    // Deduplicated so a repeated checkbox id in the payload never hits
    // CompatibilityService's composite primary key twice in one
    // createMany below.
    supportedServiceIds: z
      .array(z.string().min(1))
      .min(1)
      .transform((ids) => Array.from(new Set(ids))),
    selectedServiceId: z.string().min(1),
  })
  .refine((value) => value.supportedServiceIds.includes(value.selectedServiceId), {
    message: "selectedServiceId must be one of supportedServiceIds",
    path: ["selectedServiceId"],
  });

export type ConfirmCompatibilityInput = z.infer<typeof confirmCompatibilitySchema>;

/**
 * The admin's compatibility-confirmation action (TASK-036) — the only
 * path by which a pending_review order reaches awaiting_payment.
 *
 * Deliberately admin-only, unlike lib/actions/compatibility.ts's
 * checkCompatibility (the public, wizard-side lookup): confirming here
 * both unblocks THIS order and durably teaches the compatibility
 * database about this vehicle/category/part-number combination, so the
 * next customer with the same part number auto-matches instead of
 * landing back in this queue (PRD 5.2's acceptance criteria).
 */
export async function confirmCompatibility(
  input: ConfirmCompatibilityInput,
): Promise<{ status: "awaiting_payment" }> {
  const admin = await requireAdmin();
  const parsed = confirmCompatibilitySchema.parse(input);

  let orderId: bigint;
  try {
    orderId = BigInt(parsed.orderId);
  } catch {
    throw new Error("Invalid orderId");
  }

  const supportedServiceIds = parsed.supportedServiceIds.map((id) => {
    try {
      return BigInt(id);
    } catch {
      throw new Error(`Invalid service id "${id}"`);
    }
  });
  const selectedServiceId = BigInt(parsed.selectedServiceId);

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

    // The only legal source into this action — matches the acceptance
    // criteria ("rejects orders not in pending_review") and mirrors the
    // symmetric restriction lib/actions/order-status.ts's
    // updateOrderStatus already enforces from the other side of this
    // same transition.
    if (order.status !== "pending_review") {
      throw new Error(
        `Order ${orderId} is not pending_review (currently "${order.status}"); ` +
          "compatibility can only be confirmed for orders awaiting review.",
      );
    }

    // supportedServiceIds must all belong to the order's own module
    // category — never trust that the client's checkbox list actually
    // matches the category it was rendered for.
    const categoryServices = await tx.service.findMany({
      where: { id: { in: supportedServiceIds }, categoryId: order.categoryId },
    });
    if (categoryServices.length !== supportedServiceIds.length) {
      throw new Error(
        "One or more supportedServiceIds do not belong to this order's module category.",
      );
    }

    const selectedService = categoryServices.find((service) => service.id === selectedServiceId);
    if (!selectedService) {
      // Guarded by the zod refine above too, but re-checked against the
      // just-validated category service list rather than trusting the
      // raw input a second time.
      throw new Error("selectedServiceId must be one of the supported service ids.");
    }

    // Upsert the CompatibilityEntry for this exact vehicle/category/part
    // number, sourced as admin_confirmed — the durable side effect that
    // makes the next identical part number auto-match (checkCompatibility
    // does an exact vehicleId+categoryId+partNumber lookup, same as here).
    const entry = await tx.compatibilityEntry.upsert({
      where: {
        vehicleId_categoryId_partNumber: {
          vehicleId: order.vehicleId,
          categoryId: order.categoryId,
          partNumber: order.partNumberEntered,
        },
      },
      create: {
        vehicleId: order.vehicleId,
        categoryId: order.categoryId,
        partNumber: order.partNumberEntered,
        source: EntrySource.admin_confirmed,
      },
      // An entry might already exist here (e.g. imported with zero
      // linked services, or a prior admin confirmation for a related
      // order) — re-confirming always re-marks it admin_confirmed and
      // replaces its service links below, rather than leaving stale
      // import data mixed in.
      update: { source: EntrySource.admin_confirmed },
    });

    await tx.compatibilityService.deleteMany({ where: { entryId: entry.id } });
    await tx.compatibilityService.createMany({
      data: supportedServiceIds.map((serviceId) => ({ entryId: entry.id, serviceId })),
    });

    const priceTier = await tx.priceTier.findUniqueOrThrow({
      where: { tierCode: selectedService.tierCode },
    });
    const feeSetting = await tx.appSetting.findUnique({
      where: { key: RETURN_SHIPPING_FEE_KEY },
    });
    const returnFeeCents = feeSetting ? Number.parseInt(feeSetting.value, 10) : 0;
    const priced = quote(priceTier.amountCents, returnFeeCents);

    await tx.order.update({
      where: { id: orderId },
      data: {
        matchedEntryId: entry.id,
        serviceId: selectedService.id,
        servicePriceCents: priced.servicePriceCents,
        returnShippingFeeCents: priced.returnShippingFeeCents,
        totalAmountCents: priced.totalCents,
      },
    });
  });

  // A separate transition, exactly like placeOrder's matched path
  // (lib/actions/place-order.ts): the price snapshot above is committed
  // first, then advanceOrderStatus does its own transaction to move the
  // status and append the history row, and its awaiting_payment side
  // effect (lib/services/payment.ts) creates the Stripe payment link.
  const changedBy = (admin.email ?? "admin").slice(0, 50);
  await advanceOrderStatus(orderId, "awaiting_payment", changedBy);

  revalidatePath("/admin/review-queue");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${parsed.orderId}`);

  return { status: "awaiting_payment" };
}
