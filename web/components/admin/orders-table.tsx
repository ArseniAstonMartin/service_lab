"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { formatCents } from "@/lib/format";
import type { OrderStatusValue } from "@/lib/domain/status";

export type OrderRow = {
  id: string;
  vehicleLabel: string;
  categoryName: string;
  serviceName: string | null;
  customerEmail: string;
  status: OrderStatusValue;
  totalAmountCents: number | null;
  createdAt: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * The orders table for /admin/orders. A Client Component only because
 * clicking anywhere on a row navigates to /admin/orders/[id]
 * (TASK-031 -- not built yet, so this currently 404s, the same
 * incremental pattern used throughout the wizard); the order-number
 * cell is also a real <Link> of its own, so cmd/ctrl-click-to-open-in-
 * a-new-tab and screen readers both still work without relying on the
 * row's onClick.
 */
export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();

  if (orders.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No orders match these filters.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Vehicle</TableHead>
            <TableHead>Module</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Placed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow
              key={order.id}
              className="cursor-pointer"
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/admin/orders/${order.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(`/admin/orders/${order.id}`);
                }
              }}
            >
              <TableCell>
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="font-medium hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  #{order.id}
                </Link>
              </TableCell>
              <TableCell>{order.vehicleLabel}</TableCell>
              <TableCell>{order.categoryName}</TableCell>
              <TableCell>{order.serviceName ?? "—"}</TableCell>
              <TableCell className="max-w-[16rem] truncate">{order.customerEmail}</TableCell>
              <TableCell>
                <OrderStatusBadge status={order.status} />
              </TableCell>
              <TableCell className="text-right">
                {order.totalAmountCents != null ? formatCents(order.totalAmountCents) : "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {dateFormatter.format(new Date(order.createdAt))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
