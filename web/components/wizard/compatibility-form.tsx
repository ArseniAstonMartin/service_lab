"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, ImageIcon, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/wizard/file-upload";
import { useWizard } from "@/components/wizard/wizard-store";
import { useStepGuard } from "@/components/wizard/use-step-guard";
import { checkCompatibility } from "@/lib/actions/compatibility";
import type { WizardMatchResult } from "@/lib/wizard/types";

/**
 * A small static mock of a module label sticker, shown next to the
 * upload control per PRD 4.2 ("a reference example image and upload
 * control are shown"). It's an illustrative diagram rather than a real
 * photo of any specific module, since no example photo asset exists —
 * it exists purely to show the customer what kind of sticker/label to
 * photograph and where the catalog part number typically sits on it.
 */
function StickerReference() {
  return (
    <div className="w-32 shrink-0 space-y-1">
      <div className="flex h-32 w-32 flex-col justify-between rounded-md border bg-muted/40 p-2 text-[9px] leading-tight text-muted-foreground">
        <div className="flex items-center gap-1 font-medium text-foreground">
          <ImageIcon className="h-3 w-3" />
          Example label
        </div>
        <div className="space-y-0.5 rounded bg-background p-1.5 shadow-sm">
          <div className="font-semibold text-foreground">P/N: 12345678</div>
          <div>S/N: 9A8B7C6D5E</div>
          <div className="mt-1 h-3 w-full rounded-sm bg-[repeating-linear-gradient(90deg,#000_0,#000_1px,transparent_1px,transparent_2px)] opacity-70" />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        The <strong>P/N</strong> (catalog part number) is what we need — not the S/N
        (serial number) below it.
      </p>
    </div>
  );
}

export function CompatibilityForm() {
  const router = useRouter();
  const { state, update } = useWizard();
  // Redirects to /order/vehicle or /order/module if either is missing
  // yet (TASK-024) — checkCompatibility needs a vehicle and a category
  // to check against.
  const ready = useStepGuard("compatibility");

  const [partNumber, setPartNumber] = useState(state.partNumber);
  const [stickerPhotoUrl, setStickerPhotoUrl] = useState<string | null>(state.stickerPhotoUrl);
  const [result, setResult] = useState<WizardMatchResult | null>(state.matchResult);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  function handlePartNumberChange(next: string) {
    setPartNumber(next);
    setResult(null);
  }

  function handlePhotoChange(url: string | null) {
    setStickerPhotoUrl(url);
    setResult(null);
  }

  const canCheck = Boolean(partNumber.trim() && stickerPhotoUrl) && !isChecking;

  async function handleCheck() {
    if (!state.vehicle || !state.categoryId || !stickerPhotoUrl) return;

    setIsChecking(true);
    setCheckError(null);

    try {
      const matchResult = await checkCompatibility({
        vehicle: state.vehicle,
        categoryId: state.categoryId,
        partNumber,
        stickerPhotoUrl,
      });

      setResult(matchResult);
      update({ partNumber, stickerPhotoUrl, matchResult });
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Could not check compatibility. Please try again.");
    } finally {
      setIsChecking(false);
    }
  }

  function handleContinue() {
    if (!result) return;
    router.push(result.matched ? "/order/service" : "/order/details");
  }

  if (!ready) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="part-number">Part Number</Label>
        <Input
          id="part-number"
          value={partNumber}
          onChange={(event) => handlePartNumberChange(event.target.value)}
          placeholder="e.g. 12345678"
        />
        <p className="text-xs text-muted-foreground">
          This is the catalog part number printed on the module&apos;s label —{" "}
          <strong>not</strong> its individual serial number.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Photo of the module&apos;s label</Label>
        <div className="flex gap-4">
          <FileUpload
            value={stickerPhotoUrl}
            onChange={handlePhotoChange}
            purpose="wizard"
            pathPrefix="pending/stickers"
          />
          <StickerReference />
        </div>
      </div>

      {checkError ? <p className="text-sm text-destructive">{checkError}</p> : null}

      {result ? (
        result.matched ? (
          <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Found it — {result.services.length} service
              {result.services.length === 1 ? "" : "s"} confirmed for this part.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              We don&apos;t have this part number confirmed yet. Your order will be
              submitted for manual review — our team will check the photo and part
              number and follow up.
            </span>
          </div>
        )
      ) : null}

      {result ? (
        <Button type="button" className="w-full" onClick={handleContinue}>
          Continue
        </Button>
      ) : (
        <Button type="button" className="w-full" disabled={!canCheck} onClick={handleCheck}>
          {isChecking ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Checking...
            </>
          ) : (
            "Check compatibility"
          )}
        </Button>
      )}
    </div>
  );
}
