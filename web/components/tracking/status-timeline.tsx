import { STATUS_LABELS } from "@/lib/constants";
import { ORDER_STATUSES, type OrderStatusValue } from "@/lib/domain/status";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export type PublicHistoryItem = {
  status: OrderStatusValue;
  changedAt: Date;
};

/**
 * Public tracking timeline (TASK-028): every order stage, with dates
 * taken from status history when that stage has been reached. Future
 * stages stay unlabeled. Does not render changedBy — that field can
 * hold an admin email and must not appear on the public page.
 */
export function TrackingStatusTimeline({
  currentStatus,
  history,
}: {
  currentStatus: OrderStatusValue;
  history: PublicHistoryItem[];
}) {
  const dateByStatus = new Map<OrderStatusValue, Date>();
  for (const entry of history) {
    if (!dateByStatus.has(entry.status)) {
      dateByStatus.set(entry.status, entry.changedAt);
    }
  }

  const currentIndex = ORDER_STATUSES.indexOf(currentStatus);

  return (
    <ol className="flex flex-col gap-3">
      {ORDER_STATUSES.map((status, index) => {
        const reachedAt = dateByStatus.get(status);
        const isCurrent = status === currentStatus;
        const isPast = index < currentIndex;

        return (
          <li key={status} className="flex items-start gap-3 text-sm">
            <span
              className={cn(
                "mt-1 h-2.5 w-2.5 shrink-0 rounded-full border",
                isCurrent && "border-primary bg-primary",
                isPast && "border-primary/40 bg-primary/40",
                !isCurrent && !isPast && "border-muted-foreground/30 bg-background",
              )}
              aria-hidden
            />
            <div>
              <div
                className={cn(
                  "font-medium",
                  isCurrent && "text-foreground",
                  isPast && "text-foreground",
                  !isCurrent && !isPast && "text-muted-foreground",
                )}
              >
                {STATUS_LABELS[status]}
                {isCurrent ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">Current</span>
                ) : null}
              </div>
              <div className="text-muted-foreground">
                {reachedAt ? dateFormatter.format(reachedAt) : "Not yet reached"}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
