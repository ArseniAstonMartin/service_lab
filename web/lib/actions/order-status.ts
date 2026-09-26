"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { advanceOrderStatus } from "@/lib/services/order-status";
import { nextStatuses, ORDER_STATUSES, type OrderStatusValue } from "@/lib/domain/status";

// ORDER_STATUSES is a `readonly OrderStatusValue[]`, not the fixed-length
// tuple z.enum() wants; it's safe to assert here since the array's actual
// contents are exactly OrderStatusValue's literal members (see
// lib/domain/status.ts), and casting avoids hand-duplicating that list.
const orderStatusSchema = z.enum(
  ORDER_STATUSES as unknown as [OrderStatusValue, ...OrderStatusValue[]],
);

const updateOrderStatusSchema = z.object({
  orderId: z.string().min(1),
  newStatus: orderStatusSchema,
  returnTrackingNo: z.string().trim().max(100).optional(),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

/**
 * Admin manual status update (TASK-032) -- the generic "move this order
 * forward" action behind the order detail page's status Select.
 *
 * requireAdmin() first: this is a Server Action, an independently
 * reachable endpoint that the dashboard layout's page-level guard does
 * not cover (see lib/supabase/require-admin.ts).
 *
 * pending_review -> awaiting_payment is a legal transition at the domain
 * level (lib/domain/status.ts's TRANSITIONS map), but it is reserved for
 * TASK-036's confirmCompatibility action -- the only path that also
 * snapshots a matched compatibility entry and a price quote alongside the
 * status change. This action refuses that specific pair outright, and the
 * calling UI (components/admin/update-status-control.tsx) never offers it
 * as an option in the first place; both checks exist so a stale/tampered
 * request can't reach it either.
 *
 * `returnTrackingNo` is only ever applied when the target status is
 * ready_shipped_back, and it's optional there too -- an admin can move
 * an order to that status now and add the tracking number in a later
 * update once it's known.
 */
export async function updateOrderStatus(
  input: UpdateOrderStatusInput,
): Promise<{ status: OrderStatusValue }> {
  const admin = await requireAdmin();
  const parsed = updateOrderStatusSchema.parse(input);

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
  const currentStatus = order.status as OrderStatusValue;

  if (currentStatus === "pending_review" && parsed.newStatus === "awaiting_payment") {
    throw new Error(
      "Confirm compatibility in the review queue instead of using a manual status update.",
    );
  }

  if (!nextStatuses(currentStatus).includes(parsed.newStatus)) {
    throw new Error(`Cannot move an order from "${currentStatus}" to "${parsed.newStatus}".`);
  }

  const extra =
    parsed.newStatus === "ready_shipped_back" && parsed.returnTrackingNo
      ? { returnTrackingNo: parsed.returnTrackingNo }
      : undefined;

  // changed_by is @db.VarChar(50); truncate defensively rather than let an
  // unusually long admin email fail the Prisma write outright.
  const changedBy = (admin.email ?? "admin").slice(0, 50);

  const updated = await advanceOrderStatus(id, parsed.newStatus, changedBy, extra);

  revalidatePath(`/admin/orders/${parsed.orderId}`);
  revalidatePath("/admin/orders");

  return { status: updated.status as OrderStatusValue };
}
