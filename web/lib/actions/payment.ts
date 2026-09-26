"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { ensurePaymentLink, PaymentLinkIneligibleError } from "@/lib/services/payment";

const regeneratePaymentLinkSchema = z.object({
  orderId: z.string().min(1),
});

/**
 * Admin-only retry path for TASK-031's "Regenerate payment link" button:
 * used when Stripe failed the first time (the awaiting_payment side
 * effect logged an error and left the order with no
 * stripePaymentLinkId), or when an admin explicitly wants a fresh link.
 *
 * Unlike the automatic awaiting_payment side effect (ensurePaymentLink
 * called with no options, which reuses an existing link and never
 * duplicates one), this always passes `force: true` — an explicit admin
 * action asking to regenerate is a deliberate override, not an
 * accidental duplicate the system produced on its own.
 *
 * Still refuses orders that are not in awaiting_payment or have no price
 * snapshot (PaymentLinkIneligibleError, via ensurePaymentLink itself) —
 * an admin can't use this to create a payment link for an order that
 * hasn't been matched and quoted yet.
 */
export async function regeneratePaymentLink(orderId: string): Promise<{ paymentLinkUrl: string }> {
  await requireAdmin();

  const parsed = regeneratePaymentLinkSchema.parse({ orderId });

  let id: bigint;
  try {
    id = BigInt(parsed.orderId);
  } catch {
    throw new Error("Invalid orderId");
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    throw new Error("Order not found");
  }

  try {
    const updated = await ensurePaymentLink(order, { force: true });
    if (!updated.paymentLinkUrl) {
      // Should not happen — ensurePaymentLink always sets this on
      // success — but the return type promises a URL, so fail loudly
      // rather than returning an empty string.
      throw new Error("Stripe did not return a payment link URL");
    }
    return { paymentLinkUrl: updated.paymentLinkUrl };
  } catch (error) {
    if (error instanceof PaymentLinkIneligibleError) {
      throw error;
    }
    // A real Stripe API failure (network, invalid key, rate limit, ...).
    // Never leak the raw Stripe error message to the client — log it
    // server-side and surface a generic, actionable message instead.
    console.error(`[regeneratePaymentLink] Stripe call failed for order ${id}:`, error);
    throw new Error("Failed to create a Stripe payment link. Please try again.");
  }
}
