"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STATUS_LABELS } from "@/lib/constants";
import { nextStatuses, type OrderStatusValue } from "@/lib/domain/status";
import { updateOrderStatus } from "@/lib/actions/order-status";

/**
 * The manual status-update control for the order detail page (TASK-032).
 *
 * `pending_review -> awaiting_payment` is never offered here even though
 * lib/domain/status.ts's canTransition() allows it at the domain level --
 * that specific pair is reserved for the review queue's confirmCompatibility
 * action (TASK-036), which also snapshots a matched entry and a price
 * quote. Filtering it out client-side, in addition to the Server Action's
 * own check, means a pending_review order simply shows no move-forward
 * options at all here, which is the correct UI: there is nothing else this
 * generic control is allowed to do for that order.
 */
export function UpdateStatusControl({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: OrderStatusValue;
}) {
  const options = currentStatus === "pending_review" ? [] : nextStatuses(currentStatus);

  const [selected, setSelected] = useState<OrderStatusValue | "">("");
  const [returnTrackingNo, setReturnTrackingNo] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {currentStatus === "pending_review"
          ? "Confirm compatibility in the review queue to move this order forward."
          : "This order has no further status changes available."}
      </p>
    );
  }

  function handleConfirm() {
    if (!selected) return;
    startTransition(async () => {
      try {
        await updateOrderStatus({
          orderId,
          newStatus: selected,
          returnTrackingNo:
            selected === "ready_shipped_back" ? returnTrackingNo || undefined : undefined,
        });
        toast.success(`Order moved to ${STATUS_LABELS[selected]}.`);
        setConfirmOpen(false);
        setSelected("");
        setReturnTrackingNo("");
        router.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update status.";
        toast.error(message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={selected}
        onValueChange={(value) => setSelected(value as OrderStatusValue)}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Move to…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected === "ready_shipped_back" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="return-tracking-no" className="text-xs text-muted-foreground">
            Return tracking number (optional)
          </Label>
          <Input
            id="return-tracking-no"
            value={returnTrackingNo}
            onChange={(event) => setReturnTrackingNo(event.target.value)}
            placeholder="e.g. 1Z999AA10123456784"
            className="w-56"
          />
        </div>
      ) : null}

      <Button
        type="button"
        size="sm"
        className="w-fit"
        disabled={!selected}
        onClick={() => setConfirmOpen(true)}
      >
        Update status
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm status change</DialogTitle>
            <DialogDescription>
              Move order #{orderId} to &ldquo;{selected ? STATUS_LABELS[selected] : ""}&rdquo;?
              This is recorded in the order&apos;s status history and cannot be undone from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={isPending}>
              {isPending ? "Updating…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
