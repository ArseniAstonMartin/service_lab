import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { advanceOrderStatus, InvalidStatusTransitionError } from "@/lib/services/order-status";

/**
 * Stripe webhook endpoint. Must run on the Node.js runtime (not Edge):
 * stripe.webhooks.constructEvent needs Node's crypto for signature
 * verification, which the Edge runtime doesn't provide the same way.
 */
export const runtime = "nodejs";

/**
 * Verifies and processes incoming Stripe webhook events.
 *
 * Signature verification requires the exact raw request body (any JSON
 * re-serialization would change the bytes stripe.webhooks.constructEvent
 * hashes against), so this reads `await request.text()` rather than
 * `request.json()` -- Next.js Route Handlers don't parse the body for
 * you unless you ask, so this is safe as-is.
 *
 * Idempotency: the event id is inserted into StripeEvent BEFORE any
 * processing happens, per the acceptance criteria. A duplicate delivery
 * (Stripe retries an event whenever the endpoint doesn't ack fast enough,
 * or after a 5xx) then hits StripeEvent's unique `id` primary key and is
 * acknowledged with 200 and no side effects, rather than reprocessed.
 *
 * Judgment call, worth flagging: because the event is marked processed
 * BEFORE advanceOrderStatus runs, a genuine failure inside
 * advanceOrderStatus (e.g. the order doesn't exist, or the DB is briefly
 * unreachable) can't be recovered by a Stripe retry -- the retry would
 * just see the event already recorded and skip it. This route therefore
 * always acknowledges with 200 once the event is recorded (logging any
 * processing failure instead of surfacing it as a 5xx that would trigger
 * a now-useless retry); a stuck order is meant to be fixed manually
 * (e.g. by an admin re-running the relevant action), not by Stripe's
 * retry mechanism, once the event has been recorded as seen.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("[stripe webhook] signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await prisma.stripeEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Already processed this exact event id -- ack, do nothing else.
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw error;
  }

  if (event.type === "checkout.session.completed") {
    await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
  }
  // Every other event type is acknowledged and ignored -- this webhook
  // endpoint is only ever configured (TASK-046) to send
  // checkout.session.completed, but Stripe's dashboard can always be
  // reconfigured to send more, and an unrecognized type must never fail
  // the webhook.

  return NextResponse.json({ received: true });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    console.error(
      `[stripe webhook] checkout.session.completed ${session.id} has no metadata.orderId`,
    );
    return;
  }

  let id: bigint;
  try {
    id = BigInt(orderId);
  } catch {
    console.error(
      `[stripe webhook] checkout.session.completed ${session.id} has an invalid metadata.orderId "${orderId}"`,
    );
    return;
  }

  try {
    // changedBy: "system" -- this transition is never triggered by an
    // admin, matching the "system" changedBy already used for the
    // automatic pending_review -> awaiting_payment move in placeOrder
    // (TASK-022).
    await advanceOrderStatus(id, "payment_received", "system", {
      stripePaymentStatus: session.payment_status,
    });
  } catch (error) {
    if (error instanceof InvalidStatusTransitionError) {
      // The order isn't in awaiting_payment any more -- a duplicate or
      // out-of-order webhook delivery, or the order was advanced some
      // other way in the meantime. Not a failure of this webhook.
      console.warn(`[stripe webhook] ignoring ${session.id}: ${error.message}`);
    } else {
      console.error(
        `[stripe webhook] failed to advance order ${id} to payment_received:`,
        error,
      );
    }
    // Deliberately does not rethrow -- see the docblock above on POST()
    // for why this endpoint still acknowledges with 200 either way.
  }
}
