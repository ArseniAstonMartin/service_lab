"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  CircuitBoard,
  BatteryCharging,
  Cpu,
  Gauge,
  ImageIcon,
  Loader2,
  Settings2,
  ShieldAlert,
  Stethoscope,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getModels, getYears } from "@/lib/actions/vehicle";
import { checkCompatibility } from "@/lib/actions/compatibility";
import { FileUpload } from "@/components/wizard/file-upload";
import { useWizard } from "@/components/wizard/wizard-store";
import { useStepGuard } from "@/components/wizard/use-step-guard";
import type { ModuleCategoryOption } from "@/lib/actions/module";
import type { WizardMatchResult } from "@/lib/wizard/types";

// Icons keyed by the exact category name from the seed data. Any future
// category added only in the database (not in this map) still renders,
// just with the generic fallback icon below.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Airbag/SRS": ShieldAlert,
  "ECM/PCM": Cpu,
  "TCM/TCU": Settings2,
  BCM: CircuitBoard,
  "Instrument Cluster": Gauge,
  "Battery/BMS": BatteryCharging,
  "Vehicle Diagnostics": Stethoscope,
};

function iconFor(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? Wrench;
}

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

/**
 * /order/vehicle: the combined first step — vehicle, module category,
 * and (for most categories) part number/photo all on one page.
 *
 * "Continue" is the one required action: it runs checkCompatibility
 * itself if it hasn't already (no separate confirm click needed — the
 * old flow made the customer click "Check compatibility", read the
 * result, then click "Continue" a second time to do the exact same
 * thing placeOrder re-derives server-side regardless) and routes
 * straight to the right next step. "Check compatibility" still exists
 * as a preview button for a category that needs a part number, useful
 * for seeing the result before deciding what to type in Details.
 *
 * The photo upload is hidden up front and only appears once a check
 * actually comes back not-matched — that's the one case a human needs
 * it to manually verify the module, so nothing is asked for before it's
 * known to be needed (see `needsPhoto` below). A fresh not-matched
 * result stops "Continue" from navigating on, so the customer sees the
 * now-required upload instead of being carried past it.
 *
 * A category with requiresPartNumber false (Vehicle Diagnostics) skips
 * the part number + photo section entirely (hidden by default, in fact
 * — it only appears once a category that needs one is picked) and has
 * no preview button at all: checkCompatibility (and placeOrder) always
 * resolve it to its own one Service for any vehicle, so there's nothing
 * to preview. It also has only one Service, so there's nothing to pick
 * on /order/service either — Continue sets serviceId itself and routes
 * straight to /order/details.
 */
export function VehicleModulePartForm({
  makes,
  categories,
}: {
  makes: string[];
  categories: ModuleCategoryOption[];
}) {
  const router = useRouter();
  const { state, update } = useWizard();
  const [isPending, startTransition] = useTransition();
  // First step — nothing to redirect back to — but this still waits out
  // sessionStorage hydration before rendering, consistent with every
  // other guarded step.
  const ready = useStepGuard("vehicle");

  // --- Vehicle ---
  const [models, setModels] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);

  const make = state.vehicle?.make ?? "";
  const model = state.vehicle?.model ?? "";
  const year = state.vehicle?.year ?? null;

  useEffect(() => {
    let cancelled = false;
    setModels([]);
    if (!make) return;
    startTransition(async () => {
      try {
        const values = await getModels(make);
        if (!cancelled) setModels(values);
      } catch {
        if (!cancelled) toast.error("Unable to load models. Please try again.");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [make]);

  useEffect(() => {
    let cancelled = false;
    setYears([]);
    if (!make || !model) return;
    startTransition(async () => {
      try {
        const values = await getYears(make, model);
        if (!cancelled) setYears(values);
      } catch {
        if (!cancelled) toast.error("Unable to load years. Please try again.");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [make, model]);

  function handleMakeChange(nextMake: string) {
    // Selecting a parent resets its children — a model/year picked for
    // the previous make is meaningless once the make changes.
    update({ vehicle: { make: nextMake, model: "", year: 0 } });
    // handleContinue below can reuse an already-computed `result`
    // without re-checking — stale once the vehicle it was computed for
    // has changed, so drop it like the part number/photo handlers do.
    setResult(null);
  }

  function handleModelChange(nextModel: string) {
    update({ vehicle: { make, model: nextModel, year: 0 } });
    setResult(null);
  }

  function handleYearChange(nextYear: string) {
    update({ vehicle: { make, model, year: Number(nextYear) } });
    setResult(null);
  }

  const vehicleComplete = Boolean(
    make && model && year && models.includes(model) && years.includes(year),
  );

  // --- Module category ---
  const categoryId = state.categoryId;
  const selectedCategory = categories.find((category) => category.id === categoryId);
  // Defaults to false (part number section hidden) before any category
  // is picked yet — it only appears once a category that actually needs
  // one is selected, not as a default assumption.
  const requiresPartNumber = selectedCategory?.requiresPartNumber ?? false;

  function handleCategorySelect(id: string) {
    update({ categoryId: id });
    // A category switch can change whether a part number is even
    // relevant — drop any previous check result rather than show a
    // stale "Found it" for the category just left.
    setResult(null);
  }

  // --- Part number / photo / compatibility check ---
  const [partNumber, setPartNumber] = useState(state.partNumber);
  const [stickerPhotoUrl, setStickerPhotoUrl] = useState<string | null>(state.stickerPhotoUrl);
  const [result, setResult] = useState<WizardMatchResult | null>(state.matchResult);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  // This component mounts on the very first /order/* page load, before
  // sessionStorage hydration has necessarily finished (`ready` above is
  // false until it does) — unlike the old, separate CompatibilityForm,
  // which only ever mounted on a later navigation once an earlier step
  // had already triggered hydration. So the useState initializers just
  // above can capture stale (pre-hydration) values on first render;
  // this re-syncs them from context the one time `ready` flips from
  // false to true (e.g. a page reload or deep link with wizard state
  // already in sessionStorage), without clobbering local edits after.
  useEffect(() => {
    if (!ready) return;
    setPartNumber(state.partNumber);
    setStickerPhotoUrl(state.stickerPhotoUrl);
    setResult(state.matchResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function handlePartNumberChange(next: string) {
    setPartNumber(next);
    // A changed part number invalidates any prior check result -- and
    // the photo that went with it, if the old result was a no-match:
    // that photo was for proving the *old* part number, not this one.
    setResult(null);
    setStickerPhotoUrl(null);
  }

  function handlePhotoChange(url: string | null) {
    // Doesn't touch `result` -- uploading a photo doesn't change the
    // compatibility check itself, and clearing it here would hide the
    // very section the customer is in the middle of filling out.
    setStickerPhotoUrl(url);
  }

  // A photo is only ever needed once a check has actually come back
  // not-matched -- never up front, and never for a category (Vehicle
  // Diagnostics) that has no part number at all.
  const needsPhoto = requiresPartNumber && result !== null && !result.matched;

  // Both buttons only need a part number typed in to become enabled --
  // a photo isn't required (or even shown) until a check reveals one is
  // needed, per PRD.
  const canCheck =
    Boolean(vehicleComplete && categoryId && (!requiresPartNumber || partNumber.trim())) &&
    !isChecking;
  const canContinue =
    Boolean(
      vehicleComplete &&
        categoryId &&
        (requiresPartNumber ? partNumber.trim() && (!needsPhoto || stickerPhotoUrl) : true),
    ) && !isChecking;

  /**
   * Runs checkCompatibility and stores the result — shared by both
   * buttons below. Doesn't navigate; callers decide what to do with the
   * result (handleContinue routes on it immediately, the optional
   * preview button on requiresPartNumber categories just displays it).
   */
  async function runCheck(): Promise<WizardMatchResult | null> {
    if (!state.vehicle || !categoryId) return null;

    setIsChecking(true);
    setCheckError(null);

    try {
      const matchResult = await checkCompatibility({
        vehicle: state.vehicle,
        categoryId,
        ...(requiresPartNumber ? { partNumber } : {}),
      });
      setResult(matchResult);
      return matchResult;
    } catch (err) {
      setCheckError(
        err instanceof Error ? err.message : "Could not check compatibility. Please try again.",
      );
      return null;
    } finally {
      setIsChecking(false);
    }
  }

  /** The optional preview button, shown only for a category that needs
   * a part number — runs the same check as Continue would, just without
   * navigating anywhere. */
  function handlePreviewCheck() {
    void runCheck();
  }

  /**
   * The one required action. Reuses an already-computed result (the
   * preview button, or a prior attempt) when one exists; otherwise runs
   * the check itself. A fresh not-matched result stops here instead of
   * navigating on — that's what reveals the now-required photo upload
   * above (`needsPhoto`) — so the customer clicks Continue again once
   * it's attached, which reuses that same stored result and proceeds.
   *
   * For a category with no part number (Vehicle Diagnostics), there's
   * only ever one Service, so there's nothing to pick on /order/service
   * — serviceId is set here directly and /order/service is skipped
   * entirely, straight to /order/details.
   */
  async function handleContinue() {
    if (!canContinue) return;

    let matchResult = result;
    if (!matchResult) {
      matchResult = await runCheck();
      if (!matchResult) return;
      if (requiresPartNumber && !matchResult.matched) {
        return;
      }
    }

    update({
      partNumber: requiresPartNumber ? partNumber : "",
      stickerPhotoUrl: requiresPartNumber && !matchResult.matched ? stickerPhotoUrl : null,
      matchResult,
      serviceId:
        !requiresPartNumber && matchResult.matched && matchResult.services.length === 1
          ? matchResult.services[0].id
          : state.serviceId,
    });

    if (!requiresPartNumber) {
      router.push("/order/details");
      return;
    }
    router.push(matchResult.matched ? "/order/service" : "/order/details");
  }

  if (!ready) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Vehicle</h2>
        <div className="space-y-2">
          <label className="text-sm font-medium">Make</label>
          <Select value={make} onValueChange={handleMakeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select make" />
            </SelectTrigger>
            <SelectContent>
              {makes.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Model</label>
          <Select value={model} onValueChange={handleModelChange} disabled={!make}>
            <SelectTrigger>
              <SelectValue placeholder={make ? "Select model" : "Select a make first"} />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Year</label>
          <Select value={year ? String(year) : ""} onValueChange={handleYearChange} disabled={!model}>
            <SelectTrigger>
              <SelectValue placeholder={model ? "Select year" : "Select a model first"} />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Module</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {categories.map((category) => {
            const Icon = iconFor(category.name);
            const isSelected = category.id === categoryId;

            return (
              <Card
                key={category.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => handleCategorySelect(category.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleCategorySelect(category.id);
                  }
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 p-4 text-center transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isSelected && "border-primary bg-primary/5 ring-1 ring-primary",
                )}
              >
                <Icon
                  className={cn("h-8 w-8", isSelected ? "text-primary" : "text-muted-foreground")}
                  aria-hidden
                />
                <span className="text-sm font-medium">{category.name}</span>
              </Card>
            );
          })}
        </div>
      </div>

      {requiresPartNumber ? (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">
            {needsPhoto ? "Part number & photo" : "Part number"}
          </h2>
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

          {/* Hidden until a check comes back not-matched -- only then is
              a photo actually needed to manually verify the module. */}
          {needsPhoto ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  We couldn&apos;t confirm this part number in our system yet. To help us verify
                  compatibility, please upload a photo of your module with part number visible.
                </span>
              </div>
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
          ) : null}
        </div>
      ) : null}

      {checkError ? <p className="text-sm text-destructive">{checkError}</p> : null}

      {/* Only for a category that needs a part number, and only once
          matched -- the not-matched case has its own message above,
          next to the now-required photo upload. */}
      {requiresPartNumber && result?.matched ? (
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Found it — {result.services.length} service{result.services.length === 1 ? "" : "s"}{" "}
            confirmed for this part.
          </span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Button
          type="button"
          className="w-full"
          disabled={!canContinue || isPending}
          onClick={handleContinue}
        >
          {isChecking ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Please wait...
            </>
          ) : (
            "Continue"
          )}
        </Button>
        {requiresPartNumber ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!canCheck || isPending}
            onClick={handlePreviewCheck}
          >
            Check compatibility
          </Button>
        ) : null}
      </div>
    </div>
  );
}
