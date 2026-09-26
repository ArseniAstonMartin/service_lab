"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirmCompatibility } from "@/lib/actions/confirm-compatibility";

export type CategoryServiceOption = {
  id: string;
  name: string;
};

/**
 * The confirm-compatibility Dialog (TASK-037) opened from a review-queue
 * card. Owns its own open/checked/selected state; the parent card just
 * renders the trigger button.
 */
export function ConfirmCompatibilityDialog({
  open,
  onOpenChange,
  orderId,
  partNumber,
  vehicleLabel,
  categoryName,
  stickerPhotoUrl,
  categoryServices,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  partNumber: string;
  vehicleLabel: string;
  categoryName: string;
  stickerPhotoUrl: string | null;
  categoryServices: CategoryServiceOption[];
}) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const checkedServices = categoryServices.filter((service) => checkedIds.has(service.id));

  function toggleService(id: string) {
    setError(null);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // Selecting a service that just got unchecked would submit a
    // selectedServiceId no longer in supportedServiceIds -- reset it
    // rather than let the Select keep a now-invalid value.
    if (selectedServiceId === id) {
      setSelectedServiceId("");
    }
  }

  function handleSubmit() {
    setError(null);

    if (checkedIds.size === 0) {
      setError("Check at least one supported service.");
      return;
    }
    if (!selectedServiceId) {
      setError("Pick which service this order is for.");
      return;
    }

    startTransition(async () => {
      try {
        await confirmCompatibility({
          orderId,
          supportedServiceIds: Array.from(checkedIds),
          selectedServiceId,
        });
        toast.success(`Order #${orderId} confirmed — moved to Awaiting Payment.`);
        onOpenChange(false);
        setCheckedIds(new Set());
        setSelectedServiceId("");
        // Re-runs every server component in the current route tree,
        // including the dashboard layout's pending-review badge count
        // and this page's own list -- both already revalidatePath'd
        // server-side by confirmCompatibility, but router.refresh() is
        // what actually makes THIS client re-fetch them now.
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to confirm compatibility.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm compatibility — Order #{orderId}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {stickerPhotoUrl ? (
            <div className="relative mx-auto h-56 w-full max-w-xs overflow-hidden rounded-md border bg-muted">
              <Image
                src={stickerPhotoUrl}
                alt={`Sticker photo for order #${orderId}`}
                fill
                unoptimized
                className="object-contain"
              />
            </div>
          ) : null}

          <div className="text-sm">
            <div>
              <span className="text-muted-foreground">Part number: </span>
              <span className="font-mono font-semibold">{partNumber}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Vehicle: </span>
              {vehicleLabel}
            </div>
            <div>
              <span className="text-muted-foreground">Module: </span>
              {categoryName}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Which services are supported for this part number?</p>
            {categoryServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No services are configured for this module category yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {categoryServices.map((service) => (
                  <label key={service.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={checkedIds.has(service.id)}
                      onChange={() => toggleService(service.id)}
                      disabled={isPending}
                    />
                    {service.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Which service is this order for?</p>
            <Select
              value={selectedServiceId}
              onValueChange={setSelectedServiceId}
              disabled={isPending || checkedServices.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a service…" />
              </SelectTrigger>
              <SelectContent>
                {checkedServices.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Link
            href={`/admin/orders/${orderId}`}
            className="block text-xs text-muted-foreground hover:underline"
          >
            View full order details →
          </Link>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Confirming…" : "Confirm compatibility"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
