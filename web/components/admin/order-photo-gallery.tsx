"use client";

import Image from "next/image";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const PHOTO_TYPE_LABELS: Record<string, string> = {
  sticker: "Part number sticker",
  donor: "Donor module",
  original: "Original module",
};

export type OrderPhotoItem = {
  id: string;
  photoType: string;
  blobUrl: string;
};

/**
 * Thumbnail grid + Dialog lightbox for an order's photos (TASK-031).
 * A Client Component only because opening the lightbox is client-side
 * interaction; the photo list itself is passed in from the Server
 * Component page, already resolved from Prisma.
 */
export function OrderPhotoGallery({ photos }: { photos: OrderPhotoItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openPhoto = photos.find((photo) => photo.id === openId) ?? null;

  if (photos.length === 0) {
    return <p className="text-sm text-muted-foreground">No photos on this order.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-4">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setOpenId(photo.id)}
            className="flex flex-col items-center gap-1 rounded-md border p-2 text-left hover:bg-accent"
          >
            <div className="relative h-24 w-24 overflow-hidden rounded bg-muted">
              {/* Blob URLs are arbitrary customer uploads from any host Vercel
                  Blob issues for this project, so next/image's remote-pattern
                  allowlist can't be pinned to one exact domain ahead of time;
                  unoptimized keeps this a plain <img> under the hood instead of
                  routing through Next's image optimizer. */}
              <Image
                src={photo.blobUrl}
                alt={PHOTO_TYPE_LABELS[photo.photoType] ?? photo.photoType}
                fill
                unoptimized
                className="object-cover"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {PHOTO_TYPE_LABELS[photo.photoType] ?? photo.photoType}
            </span>
          </button>
        ))}
      </div>

      <Dialog open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>
            {openPhoto ? PHOTO_TYPE_LABELS[openPhoto.photoType] ?? openPhoto.photoType : ""}
          </DialogTitle>
          {openPhoto ? (
            <div className="relative aspect-square w-full overflow-hidden rounded">
              <Image
                src={openPhoto.blobUrl}
                alt={PHOTO_TYPE_LABELS[openPhoto.photoType] ?? openPhoto.photoType}
                fill
                unoptimized
                className="object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
