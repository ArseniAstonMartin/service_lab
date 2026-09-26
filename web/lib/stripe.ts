import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

/**
 * Server-only Stripe client (TASK-025). Test mode vs. live mode is
 * selected ONLY by which key is configured — STRIPE_SECRET_KEY starts
 * with sk_test_... or sk_live_... — nothing in this file branches on an
 * environment flag or NODE_ENV. `apiVersion` is left unset deliberately:
 * pinning a literal version string here would have to be kept in sync
 * with whatever `stripe` package version ends up installed, and the SDK
 * already defaults to its own pinned version when none is given.
 */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY);

/**
 * The subset of an Order this module needs to build a Payment Link.
 * Deliberately not `import type { Order } from "@prisma/client"` — this
 * function only cares about 4 fields, and typing it against the full
 * Prisma model would let a caller pass an order with null price
 * snapshots (a not-yet-matched, pending-review order) without a
 * compile error. TASK-026 (the caller) is responsible for only ever
 * calling this once those fields are known to be set.
 */
export type PayableOrder = {
  id: bigint;
  trackingToken: string;
  servicePriceCents: number;
  returnShippingFeeCents: number;
};

/**
 * Creates a Stripe Payment Link for one order: two USD line items (the
 * service price and the return shipping fee, both built from the
 * order's own cent snapshots — never recomputed or re-quoted here),
 * `metadata.orderId`/`metadata.trackingToken` for the webhook (TASK-027)
 * to match the payment back to this order, and `after_completion`
 * redirecting the customer to their tracking page.
 *
 * This function only calls the Stripe API and returns whatever it
 * returns — it does not read or write the database itself (TASK-026
 * is what saves the resulting id/url onto the order) and does not
 * decide whether this order is eligible for a payment link (TASK-026
 * enforces "only in awaiting_payment, only with a price snapshot").
 */
export async function createPaymentLink(order: PayableOrder): Promise<Stripe.PaymentLink> {
  return stripe.paymentLinks.create({
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `ECU Service Lab — Order #${order.id.toString()} service`,
          },
          unit_amount: order.servicePriceCents,
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Return shipping",
          },
          unit_amount: order.returnShippingFeeCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      orderId: order.id.toString(),
      trackingToken: order.trackingToken,
    },
    after_completion: {
      type: "redirect",
      redirect: {
        url: `${env.NEXT_PUBLIC_SITE_URL}/track/${order.trackingToken}`,
      },
    },
  });
}
