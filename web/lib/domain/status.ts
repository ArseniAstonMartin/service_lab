/**
 * Order status transitions.
 *
 * Pure domain logic — no Prisma, Next.js or Stripe imports. The literal
 * union below mirrors the Prisma `OrderStatus` enum (schema.prisma) but is
 * declared independently so this module has zero framework dependency.
 * Keep the two in sync by hand if the enum ever changes.
 */

export type OrderStatusValue =
  | "pending_review"
  | "awaiting_payment"
  | "payment_received"
  | "block_received"
  | "in_progress"
  | "ready_shipped_back"
  | "completed";

export const ORDER_STATUSES: readonly OrderStatusValue[] = [
  "pending_review",
  "awaiting_payment",
  "payment_received",
  "block_received",
  "in_progress",
  "ready_shipped_back",
  "completed",
];

/**
 * The allowed-transitions map: for each status, the statuses it may move
 * to next. The core flow is linear (PRD section 5):
 *
 *   pending_review → awaiting_payment → payment_received → block_received
 *     → in_progress → ready_shipped_back → completed
 *
 * `pending_review → awaiting_payment` is only ever taken by the
 * confirm-compatibility action (TASK-036), never by the generic manual
 * status-update UI (TASK-032) — that is an application-layer restriction
 * enforced where the transition is triggered, not a domain-level rule, so
 * it is not encoded here. `completed` is terminal (no outgoing edges).
 */
const TRANSITIONS: Record<OrderStatusValue, readonly OrderStatusValue[]> = {
  pending_review: ["awaiting_payment"],
  awaiting_payment: ["payment_received"],
  payment_received: ["block_received"],
  block_received: ["in_progress"],
  in_progress: ["ready_shipped_back"],
  ready_shipped_back: ["completed"],
  completed: [],
};

/** Whether moving from `from` directly to `to` is a legal transition. */
export function canTransition(from: OrderStatusValue, to: OrderStatusValue): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The statuses reachable directly from `from` (empty for `completed`). */
export function nextStatuses(from: OrderStatusValue): OrderStatusValue[] {
  return [...TRANSITIONS[from]];
}
