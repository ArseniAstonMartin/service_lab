import "server-only";
import { registerStatusSideEffect } from "@/lib/services/order-status";
import { sendOrderEmail } from "@/lib/email/send";

/**
 * TASK-043: emails #3 (module received) and #4 (ready / shipped back),
 * registered as the block_received and ready_shipped_back side effects
 * respectively. Email #2 (payment link) is NOT registered here -- it's
 * wired into lib/services/payment.ts's existing awaiting_payment side
 * effect instead, since it must fire only after the payment link itself
 * has been created and saved, not merely on entering awaiting_payment.
 *
 * No side effect is registered for payment_received, in_progress or
 * completed -- per PRD section 9 / TASK-043's acceptance criteria, none
 * of those transitions send a customer email.
 *
 * `sendOrderEmail` re-reads the order from the DB itself, so it always
 * sees the fields (e.g. returnTrackingNo) that were just committed as
 * part of this same transition, even though the `order` passed in here
 * is the object advanceOrderStatus already had in hand.
 *
 * IMPORTANT -- same rule as lib/services/payment.ts: registration only
 * takes effect once this module has actually been imported somewhere.
 * block_received and ready_shipped_back are only ever reached via the
 * admin manual status update action (lib/actions/order-status.ts), so
 * that's the one file that needs `import "@/lib/services/order-emails"`.
 */
registerStatusSideEffect("block_received", async (order) => {
  await sendOrderEmail(order.id, "module_received");
});

registerStatusSideEffect("ready_shipped_back", async (order) => {
  await sendOrderEmail(order.id, "ready_shipped_back");
});
