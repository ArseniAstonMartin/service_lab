/**
 * UI-facing constants for order statuses: human-readable labels and Tailwind
 * color classes for status badges. Kept separate from /lib/domain, which
 * must stay framework-free — this file is fine to import from client and
 * server components alike.
 */
import type { OrderStatusValue } from "@/lib/domain/status";

export const STATUS_LABELS: Record<OrderStatusValue, string> = {
  pending_review: "Pending Review",
  awaiting_payment: "Awaiting Payment",
  payment_received: "Payment Received",
  block_received: "Module Received",
  in_progress: "In Progress",
  ready_shipped_back: "Ready / Shipped Back",
  completed: "Completed",
};

/**
 * Tailwind background/text/border classes for the shadcn Badge component,
 * chosen so the sequence reads as a progression: neutral → blue → green →
 * purple → amber → teal → gray (done).
 */
export const STATUS_COLORS: Record<OrderStatusValue, string> = {
  pending_review: "bg-slate-100 text-slate-800 border-slate-200",
  awaiting_payment: "bg-blue-100 text-blue-800 border-blue-200",
  payment_received: "bg-green-100 text-green-800 border-green-200",
  block_received: "bg-purple-100 text-purple-800 border-purple-200",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200",
  ready_shipped_back: "bg-teal-100 text-teal-800 border-teal-200",
  completed: "bg-gray-100 text-gray-800 border-gray-200",
};
