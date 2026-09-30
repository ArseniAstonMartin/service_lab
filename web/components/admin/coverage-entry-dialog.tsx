"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  createCompatibilityEntry,
  updateCompatibilityEntry,
} from "@/lib/actions/coverage-entry";

export type CategoryOption = { id: string; name: string };
export type ServiceOption = { id: string; name: string; categoryId: string };

/** What's pre-filled when editing an existing entry. Vehicle and
 * category aren't included -- lib/actions/coverage-entry.ts treats both
 * as immutable once an entry exists (see updateCompatibilityEntry's
 * docblock), so edit mode never lets them change. */
export type EditingEntry = {
  id: string;
  vehicleLabel: string;
  categoryId: string;
  categoryName: string;
  partNumber: string;
  serviceIds: string[];
};

/**
 * Add/edit dialog for a single CompatibilityEntry (PRD 5.3's deferred
 * manual-CRUD piece — /admin/compatibility (TASK-038) was read-only
 * until now). Create mode collects a vehicle (make/model/year — either
 * an existing one or a brand new one, upserted server-side) and a
 * category up front; edit mode only ever touches part number and the
 * linked services, matching the server action's immutable-vehicle/
 * category rule.
 */
export function CoverageEntryDialog({
  open,
  onOpenChange,
  categories,
  services,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  services: ServiceOption[];
  editing: EditingEntry | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [partNumber, setPartNumber] = useState(editing?.partNumber ?? "");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    new Set(editing?.serviceIds ?? []),
  );

  const isEditing = editing !== null;
  const categoryServices = useMemo(
    () => services.filter((service) => service.categoryId === categoryId),
    [services, categoryId],
  );

  function toggleService(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetForm() {
    setMake("");
    setModel("");
    setYear("");
    setCategoryId("");
    setPartNumber("");
    setCheckedIds(new Set());
    setError(null);
  }

  function handleSubmit() {
    setError(null);

    if (!partNumber.trim()) {
      setError("Enter a part number.");
      return;
    }

    if (isEditing) {
      startTransition(async () => {
        try {
          await updateCompatibilityEntry({
            entryId: editing.id,
            partNumber,
            serviceIds: Array.from(checkedIds),
          });
          toast.success(`Entry #${editing.id} updated.`);
          onOpenChange(false);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to update entry.");
        }
      });
      return;
    }

    if (!make.trim() || !model.trim() || !year.trim()) {
      setError("Enter a make, model and year.");
      return;
    }
    const yearNumber = Number(year);
    if (!Number.isInteger(yearNumber)) {
      setError("Year must be a whole number.");
      return;
    }
    if (!categoryId) {
      setError("Pick a module category.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createCompatibilityEntry({
          vehicle: { make, model, year: yearNumber },
          categoryId,
          partNumber,
          serviceIds: Array.from(checkedIds),
        });
        toast.success(`Entry #${result.id} created.`);
        onOpenChange(false);
        resetForm();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create entry.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit entry #${editing.id}` : "Add compatibility entry"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isEditing ? (
            <div className="text-sm">
              <div>
                <span className="text-muted-foreground">Vehicle: </span>
                {editing.vehicleLabel}
              </div>
              <div>
                <span className="text-muted-foreground">Module: </span>
                {editing.categoryName}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Vehicle and module can&apos;t be changed here — delete this entry and add a new
                one instead.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="entry-make">Make</Label>
                  <Input
                    id="entry-make"
                    value={make}
                    onChange={(event) => setMake(event.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entry-model">Model</Label>
                  <Input
                    id="entry-model"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entry-year">Year</Label>
                  <Input
                    id="entry-year"
                    inputMode="numeric"
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Module category</Label>
                <Select
                  value={categoryId}
                  onValueChange={(value) => {
                    setCategoryId(value);
                    setCheckedIds(new Set());
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category…" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="entry-part-number">Part number</Label>
            <Input
              id="entry-part-number"
              value={partNumber}
              onChange={(event) => setPartNumber(event.target.value)}
              disabled={isPending}
              className="font-mono"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Supported services</p>
            {!categoryId ? (
              <p className="text-sm text-muted-foreground">Pick a module category first.</p>
            ) : categoryServices.length === 0 ? (
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
            <p className="mt-2 text-xs text-muted-foreground">
              Leaving every box unchecked is allowed — the entry is still saved (with no
              confirmed operation), the same as a bulk-import row with nothing matched yet.
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
            {isPending ? "Saving…" : isEditing ? "Save changes" : "Create entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
