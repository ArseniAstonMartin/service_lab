import { STATUS_LABELS } from "@/lib/constants";
import type { OrderStatusValue } from "@/lib/domain/status";

export type StatusHistoryItem = {
  id: string;
  status: OrderStatusValue;
  changedAt: string;
  changedBy: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * The status history timeline for the order detail page (TASK-031).
 * Plain server-rendered list -- oldest first, so it reads top-to-bottom
 * as the order's actual life story -- with STATUS_LABELS reused from
 * lib/constants.ts rather than re-deriving display text here.
 */
export function OrderStatusTimeline({ history }: { history: StatusHistoryItem[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">No status history yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {history.map((entry) => (
        <li key={entry.id} className="flex items-start gap-3 text-sm">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
          <div>
            <div className="font-medium">{STATUS_LABELS[entry.status]}</div>
            <div className="text-muted-foreground">
              {dateFormatter.format(new Date(entry.changedAt))} · {entry.changedBy}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
