import "server-only";
import type { Order, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canTransition, type OrderStatusValue } from "@/lib/domain/status";

/**
 * The order status service: the single place in the codebase allowed to
 * write `orders.status`. Every status change — from placeOrder,
 * confirmCompatibility, the Stripe webhook, or an admin's manual update —
 * goes through advanceOrderStatus() so the transition is always validated
 * against /lib/domain/status and always recorded in OrderStatusHistory.
 */

export class InvalidStatusTransitionError extends Error {
  constructor(
    public readonly orderId: bigint,
    public readonly from: OrderStatusValue,
    public readonly to: OrderStatusValue,
  ) {
    super(`Order ${orderId}: cannot transition from "${from}" to "${to}"`);
    this.name = "InvalidStatusTransitionError";
  }
}

type SideEffect = (order: Order) => Promise<void>;

/**
 * Side effects keyed by the status an order just moved INTO. Populated by
 * registerStatusSideEffect() — the payment-link creation (TASK-026) and
 * the order-lifecycle emails (TASK-042/043) plug in here once those tasks
 * exist. Kept as a plain in-memory registry (not persisted, not queued):
 * this is a lightweight hook point, not a job queue.
 */
const sideEffects: Record<OrderStatusValue, SideEffect[]> = {
  pending_review: [],
  awaiting_payment: [],
  payment_received: [],
  block_received: [],
  in_progress: [],
  ready_shipped_back: [],
  completed: [],
};

/** Registers a side effect to run after an order successfully enters `status`. */
export function registerStatusSideEffect(status: OrderStatusValue, effect: SideEffect): void {
  sideEffects[status].push(effect);
}

/**
 * Advances an order to a new status.
 *
 * In one Prisma transaction: re-reads the order's CURRENT status (never
 * trusts a status the caller might have read earlier), validates the
 * transition with /lib/domain/status, updates the order (status plus any
 * `extra` fields that belong with this transition, e.g. stripePaymentStatus
 * or returnTrackingNo), and appends a history row.
 *
 * After the transaction commits, runs every side effect registered for
 * `to`. A side effect failure is logged and never rolls back the status
 * change or blocks the others — the status transition is the source of
 * truth; a failed payment-link or email send is a separate, retryable
 * problem (see TASK-026's regeneratePaymentLink for the payment-link case).
 *
 * Throws InvalidStatusTransitionError if the transition isn't allowed by
 * /lib/domain/status, and whatever Prisma throws if `orderId` doesn't exist.
 */
export async function advanceOrderStatus(
  orderId: bigint,
  to: OrderStatusValue,
  changedBy: string,
  extra?: Omit<Prisma.OrderUpdateInput, "status">,
): Promise<Order> {
  const updatedOrder = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const from = current.status as OrderStatusValue;

    if (!canTransition(from, to)) {
      throw new InvalidStatusTransitionError(orderId, from, to);
    }

    const order = await tx.order.update({
      where: { id: orderId },
      data: { ...extra, status: to },
    });

    await tx.orderStatusHistory.create({
      data: { orderId, status: to, changedBy },
    });

    return order;
  });

  for (const effect of sideEffects[to]) {
    try {
      await effect(updatedOrder);
    } catch (error) {
      console.error(
        `[order-status] side effect for status "${to}" failed for order ${orderId}:`,
        error,
      );
    }
  }

  return updatedOrder;
}
