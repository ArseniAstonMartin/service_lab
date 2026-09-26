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
 *
 * Constructed lazily (on first actual property access) rather than at
 * module scope. `new Stripe(env.STRIPE_SECRET_KEY)` at module scope
 * used to run during Next's "Collecting page data" build step for
 * every route that imports this module — including ones that only
 * import it transitively — which meant a real STRIPE_SECRET_KEY had to
 * exist just to build, even for a deploy that never handles a Stripe
 * request. This proxy defers construction (and therefore env
 * validation) to the first real call, so it still fails immediately
 * and loudly the moment Stripe is actually used without a key, but no
 * longer fails a build that never touches Stripe at request time.
 */
let client: Stripe | null = null;

function getClient(): Stripe {
  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return client;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getClient(), prop, receiver);
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
}) as Stripe;

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
 * Creates a Stripe Payment Link for one order.
 *
 * Payment Links (unlike Checkout Sessions) do NOT accept inline
 * `price_data` on their line items — `stripe.paymentLinks.create()`'s
 * `line_items[].price` must be an existing Price object's id. This was
 * originally written as if inline price_data worked here (it doesn't;
 * that only exists on Checkout Session line items), which compiled
 * fine against this sandbox's stale node_modules but failed a real
 * `next build`'s type-check against the actual `stripe` package types
 * (`Object literal may only specify known properties, and 'price_data'
 * does not exist in type 'LineItem'`) — caught while investigating a
 * failed Vercel deploy. Fixed by creating two one-off Prices first
 * (each with inline `product_data`, so no pre-existing Stripe Product
 * is needed), then referencing their ids in the Payment Link's line
 * items.
 *
 * This function only calls the Stripe API and returns whatever it
 * returns — it does not read or write the database itself (TASK-026
 * is what saves the resulting id/url onto the order) and does not
 * decide whether this order is eligible for a payment link (TASK-026
 * enforces "only in awaiting_payment, only with a price snapshot").
 */
export async function createPaymentLink(order: PayableOrder): Promise<Stripe.PaymentLink> {
  const [servicePrice, shippingPrice] = await Promise.all([
    stripe.prices.create({
      currency: "usd",
      unit_amount: order.servicePriceCents,
      product_data: {
        name: `ECU Service Lab — Order #${order.id.toString()} service`,
      },
    }),
    stripe.prices.create({
      currency: "usd",
      unit_amount: order.returnShippingFeeCents,
      product_data: {
        name: "Return shipping",
      },
    }),
  ]);

  return stripe.paymentLinks.create({
    line_items: [
      { price: servicePrice.id, quantity: 1 },
      { price: shippingPrice.id, quantity: 1 },
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
