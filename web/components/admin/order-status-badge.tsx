import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/constants";
import type { OrderStatusValue } from "@/lib/domain/status";

/**
 * The one place an order status renders as a badge, so every admin
 * screen (this table, TASK-031's detail page, TASK-035's review queue)
 * looks consistent. Uses the "outline" badge variant purely so its
 * default background/text classes don't fight the STATUS_COLORS
 * override passed in via className.
 */
export function OrderStatusBadge({ status }: { status: OrderStatusValue }) {
  return (
    <Badge variant="outline" className={STATUS_COLORS[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
