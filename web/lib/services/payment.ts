import "server-only";
import type { Order } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createPaymentLink } from "@/lib/stripe";
import { registerStatusSideEffect } from "@/lib/services/order-status";
import { sendOrderEmail } from "@/lib/email/send";

/**
 * Thrown when ensurePaymentLink() is asked to create a link for an order
 * that isn't actually eligible for one. Never thrown for "a link already
 * exists" (that's the normal, expected reuse case, not an error).
 */
export class PaymentLinkIneligibleError extends Error {
  constructor(
    public readonly orderId: bigint,
    reason: string,
  ) {
    super(`Order ${orderId} is not eligible for a payment link: ${reason}`);
    this.name = "PaymentLinkIneligibleError";
  }
}

/**
 * Creates (or reuses) the Stripe Payment Link for one order and saves
 * stripePaymentLinkId/paymentLinkUrl onto it.
 *
 * Eligibility is enforced here, never trusted from a caller:
 * - the order must currently be in `awaiting_payment` — an order that has
 *   since moved on (payment_received or later) must never get a fresh
 *   link generated against it, and a pending_review order has no price
 *   snapshot to build one from yet
 * - the order must have a full price snapshot (servicePriceCents AND
 *   returnShippingFeeCents both set) — the two fields TASK-025's
 *   PayableOrder type requires
 *
 * If the order already has a stripePaymentLinkId, this is a no-op that
 * returns the order unchanged — the acceptance criteria for TASK-026 is
 * explicit that an existing link is reused, never duplicated. Passing
 * `force: true` (used only by regeneratePaymentLink, an explicit admin
 * action) skips that check and always asks Stripe for a fresh link.
 */
export async function ensurePaymentLink(order: Order, options?: { force?: boolean }): Promise<Order> {
  if (order.status !== "awaiting_payment") {
    throw new PaymentLinkIneligibleError(
      order.id,
      `status is "${order.status}", not "awaiting_payment"`,
    );
  }
  if (order.servicePriceCents == null || order.returnShippingFeeCents == null) {
    throw new PaymentLinkIneligibleError(order.id, "missing a price snapshot");
  }

  if (order.stripePaymentLinkId && !options?.force) {
    return order;
  }

  const link = await createPaymentLink({
    id: order.id,
    trackingToken: order.trackingToken,
    servicePriceCents: order.servicePriceCents,
    returnShippingFeeCents: order.returnShippingFeeCents,
  });

  return prisma.order.update({
    where: { id: order.id },
    data: { stripePaymentLinkId: link.id, paymentLinkUrl: link.url },
  });
}

/**
 * Registered as the awaiting_payment side effect in TASK-011's order
 * status service: whenever an order transitions INTO awaiting_payment —
 * today, only from placeOrder's matched path (TASK-022); later also from
 * TASK-036's confirmCompatibility — this runs automatically right after
 * the status change commits, and creates the order's payment link.
 *
 * Also sends email #2 (TASK-043), but only AFTER ensurePaymentLink has
 * actually saved a paymentLinkUrl -- using the order it returns, not the
 * one this side effect was called with, since that one still has the
 * pre-link fields. sendOrderEmail re-reads the order from the DB itself
 * and never throws, so this is safe to call unconditionally here; if
 * ensurePaymentLink throws first, the email call below is simply never
 * reached (no email, no link -- consistent, and retryable together via
 * regeneratePaymentLink).
 *
 * A thrown error here is caught and logged by advanceOrderStatus itself
 * (see lib/services/order-status.ts) and never rolls back the
 * already-committed status change. The order is simply left with no
 * stripePaymentLinkId; an admin can retry once the underlying Stripe
 * problem is fixed via regeneratePaymentLink (lib/actions/payment.ts).
 *
 * IMPORTANT — registration only takes effect once this module has
 * actually been imported somewhere (registerStatusSideEffect() below
 * runs at module load time, not automatically). Every code path that
 * calls advanceOrderStatus(..., "awaiting_payment", ...) must import
 * this module too, even if only for its side effect
 * (`import "@/lib/services/payment"`). Today that's
 * lib/actions/place-order.ts; TASK-036's confirmCompatibility will need
 * the same import when it's written.
 */
registerStatusSideEffect("awaiting_payment", async (order) => {
  const updated = await ensurePaymentLink(order);
  await sendOrderEmail(updated.id, "payment_link");
});
