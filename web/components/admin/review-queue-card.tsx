import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

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
};

/**
 * One pending_review order in the /admin/review-queue worklist (TASK-035).
 * Links through to the existing order detail page (TASK-031) for now --
 * TASK-037 will add the confirm-compatibility Dialog directly on this
 * card instead of (or alongside) that link.
 */
export function ReviewQueueCard({
  id,
  partNumber,
  vehicleLabel,
  categoryName,
  description,
  stickerPhotoUrl,
  createdAt,
}: ReviewQueueCardProps) {
  return (
    <Link href={`/admin/orders/${id}`} className="block">
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
    </Link>
  );
}
