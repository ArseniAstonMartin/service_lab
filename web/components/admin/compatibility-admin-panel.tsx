"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
  CoverageEntryDialog,
  type CategoryOption,
  type EditingEntry,
  type ServiceOption,
} from "@/components/admin/coverage-entry-dialog";
import {
  CompatibilityTable,
  type CompatibilityEntryRow,
} from "@/components/admin/compatibility-table";
import { deleteCompatibilityEntry } from "@/lib/actions/coverage-entry";
import { COVERAGE_SENTINEL_MODEL } from "@/lib/domain/coverage";

/**
 * Owns the manual add/edit/delete UI for /admin/compatibility: the "Add
 * Entry" trigger, the create/edit dialog (CoverageEntryDialog), a small
 * delete-confirmation dialog, and the table itself (which just renders
 * rows and reports which one was clicked).
 */
export function CompatibilityAdminPanel({
  entries,
  categories,
  services,
}: {
  entries: CompatibilityEntryRow[];
  categories: CategoryOption[];
  services: ServiceOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditingEntry | null>(null);
  const [deleting, setDeleting] = useState<CompatibilityEntryRow | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(entry: CompatibilityEntryRow) {
    const vehicleLabel =
      entry.model === COVERAGE_SENTINEL_MODEL
        ? `${entry.make} (model/year not specified by source)`
        : `${entry.make} ${entry.model} (${entry.year})`;
    setEditing({
      id: entry.id,
      vehicleLabel,
      categoryId: entry.categoryId,
      categoryName: entry.categoryName,
      partNumber: entry.partNumber,
      serviceIds: entry.services.map((service) => service.id),
    });
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!deleting) return;
    const entry = deleting;
    startTransition(async () => {
      try {
        await deleteCompatibilityEntry(entry.id);
        toast.success(`Entry #${entry.id} deleted.`);
        setDeleting(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete entry.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          Add Entry
        </Button>
      </div>

      <CompatibilityTable entries={entries} onEdit={openEdit} onDelete={setDeleting} />

      <CoverageEntryDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        services={services}
        editing={editing}
      />

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && !isPending && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete entry #{deleting?.id}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleting ? (
              <>
                Removes the <span className="font-mono">{deleting.partNumber}</span> entry for{" "}
                {deleting.make} {deleting.model === COVERAGE_SENTINEL_MODEL ? "" : deleting.model}{" "}
                ({deleting.categoryName}) and its linked services. This can&apos;t be undone — an
                order that already matched it keeps its own price and service snapshot, but loses
                the reference to this entry.
              </>
            ) : null}
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleting(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={isPending}>
              {isPending ? "Deleting…" : "Delete entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
