"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { Loader2, Upload as UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setShippingLabel, removeShippingLabel } from "@/lib/actions/shipping-label";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/heic,image/webp";

/**
 * Admin return-label upload/replace/remove (TASK-033), shown on the
 * order detail page. Uploads straight to Vercel Blob (the "label"
 * purpose on app/api/uploads/token, admin-only, TASK-014), then hands
 * the resulting URL to setShippingLabel to persist it.
 *
 * Not built on top of the wizard's <FileUpload> component: that one
 * always renders an <img> preview, which breaks for a PDF label. This
 * shows a plain "view current label" link instead.
 */
export function ShippingLabelUpload({
  orderId,
  shippingLabelUrl,
}: {
  orderId: string;
  shippingLabelUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, startRemoveTransition] = useTransition();
  const router = useRouter();

  async function handleFile(file: File) {
    setError(null);
    setIsUploading(true);
    setProgress(0);

    try {
      const blob = await upload(`labels/${orderId}-${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/uploads/token",
        clientPayload: JSON.stringify({ purpose: "label" }),
        onUploadProgress: (event) => setProgress(event.percentage),
      });
      await setShippingLabel({ orderId, blobUrl: blob.url });
      toast.success(shippingLabelUrl ? "Shipping label replaced." : "Shipping label uploaded.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload the shipping label.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the exact same file again still fires onChange.
    event.target.value = "";
    if (file) void handleFile(file);
  }

  function handleRemove() {
    setError(null);
    startRemoveTransition(async () => {
      try {
        await removeShippingLabel({ orderId });
        toast.success("Shipping label removed.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove the shipping label.");
      }
    });
  }

  const isBusy = isUploading || isRemoving;

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleInputChange}
      />

      {shippingLabelUrl ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a
            href={shippingLabelUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            View current label
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
          >
            {isUploading ? "Uploading…" : "Replace"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={isBusy}>
            {isRemoving ? "Removing…" : "Remove"}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
        >
          {isUploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UploadIcon className="mr-2 h-4 w-4" />
          )}
          {isUploading ? "Uploading…" : "Upload shipping label"}
        </Button>
      )}

      {isUploading ? (
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">PDF or image, up to 10 MB.</p>
    </div>
  );
}
