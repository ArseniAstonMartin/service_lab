"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Loader2, RotateCcw, Upload as UploadIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FileUploadProps = {
  /** The uploaded file's Blob URL, or null when nothing is uploaded yet. */
  value: string | null;
  onChange: (url: string | null) => void;
  /** Matches the upload token route's purpose scoping (app/api/uploads/token). */
  purpose: "wizard" | "label";
  /** Must satisfy the token route's required prefix for this purpose
   * ("pending/" for wizard uploads, "labels/" for admin labels). */
  pathPrefix: string;
  accept?: string;
  className?: string;
};

/**
 * Uploads a file directly to Vercel Blob from the browser (the file
 * bytes never pass through this app's server) via a short-lived,
 * purpose-scoped token from app/api/uploads/token (TASK-014). Shows a
 * preview once uploaded, an upload progress bar while in flight, and an
 * error state with a retry affordance on failure.
 *
 * Callers must treat `isUploading` (exposed implicitly by disabling
 * their own Continue button whenever `value` is null while a file has
 * been picked) — in practice, consuming code simply requires `value` to
 * be non-null before continuing, which is exactly "blocks Continue
 * until the upload completes".
 */
export function FileUpload({
  value,
  onChange,
  purpose,
  pathPrefix,
  accept = "image/jpeg,image/png,image/heic,image/webp",
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setIsUploading(true);
    setProgress(0);

    try {
      const blob = await upload(`${pathPrefix}/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/uploads/token",
        clientPayload: JSON.stringify({ purpose }),
        onUploadProgress: (event) => setProgress(event.percentage),
      });
      onChange(blob.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      onChange(null);
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
    setProgress(0);
    onChange(null);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleInputChange}
      />

      {value ? (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Uploaded photo"
            className="h-32 w-32 rounded-md border object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Remove photo"
            className="absolute -right-2 -top-2 rounded-full border bg-background p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : isUploading ? (
        <div className="flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-xs text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <span>{Math.round(progress)}%</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-32 w-32 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground"
        >
          <UploadIcon className="h-5 w-5" />
          <span>Upload photo</span>
        </button>
      )}

      {error ? (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <span>{error}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => inputRef.current?.click()}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
