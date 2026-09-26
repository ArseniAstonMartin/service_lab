"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ConfirmCompatibilityDialog,
  type CategoryServiceOption,
} from "@/components/admin/confirm-compatibility-dialog";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export type ReviewQueueCardProps = {
  id: string;
  partNumber: string;
  vehicleLabel: string;
  categoryName: string;
  description: string;
  stickerPhotoUrl: string | null;
  createdAt: string;
  categoryServices: CategoryServiceOption[];
};

/**
 * One pending_review order in the /admin/review-queue worklist
 * (TASK-035). Clicking the card opens TASK-037's confirm-compatibility
 * Dialog directly, rather than navigating away — the order detail page
 * (TASK-031) is still one click away from inside that dialog for
 * anything this quick-confirm flow doesn't show.
 */
export function ReviewQueueCard({
  id,
  partNumber,
  vehicleLabel,
  categoryName,
  description,
  stickerPhotoUrl,
  createdAt,
  categoryServices,
}: ReviewQueueCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        <Card className="h-full transition-colors hover:border-primary">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
              {stickerPhotoUrl ? (
                <Image
                  src={stickerPhotoUrl}
                  alt={`Sticker photo for order #${id}`}
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                  No photo
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-semibold">{partNumber}</p>
              <p className="truncate text-sm text-muted-foreground">{vehicleLabel}</p>
              <p className="truncate text-xs text-muted-foreground">{categoryName}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="line-clamp-3 text-sm">{description}</p>
            <p className="text-xs text-muted-foreground">
              Submitted {dateFormatter.format(new Date(createdAt))}
            </p>
          </CardContent>
        </Card>
      </button>

      <ConfirmCompatibilityDialog
        open={open}
        onOpenChange={setOpen}
        orderId={id}
        partNumber={partNumber}
        vehicleLabel={vehicleLabel}
        categoryName={categoryName}
        stickerPhotoUrl={stickerPhotoUrl}
        categoryServices={categoryServices}
      />
    </>
  );
}
