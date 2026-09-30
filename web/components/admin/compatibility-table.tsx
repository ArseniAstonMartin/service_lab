"use client";

import { Pencil, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ENTRY_SOURCE_LABELS } from "@/lib/constants";
import { COVERAGE_SENTINEL_MODEL } from "@/lib/domain/coverage";

export type CompatibilityEntryRow = {
  id: string;
  make: string;
  model: string;
  year: number;
  categoryId: string;
  categoryName: string;
  partNumber: string;
  services: { id: string; name: string }[];
  source: "import" | "admin_confirmed";
};

/**
 * The compatibility-database table for /admin/compatibility. Was
 * read-only by design (TASK-038; PRD 5.3 called manual CRUD "secondary,
 * not MVP-blocking"); a real Edit/Delete row action now exists, wired by
 * the parent CompatibilityAdminPanel, which owns the dialogs these
 * buttons open.
 */
export function CompatibilityTable({
  entries,
  onEdit,
  onDelete,
}: {
  entries: CompatibilityEntryRow[];
  onEdit: (entry: CompatibilityEntryRow) => void;
  onDelete: (entry: CompatibilityEntryRow) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No compatibility entries match these filters.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Make</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Year</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Part Number</TableHead>
            <TableHead>Services</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{entry.make}</TableCell>
              <TableCell>{entry.model === COVERAGE_SENTINEL_MODEL ? "Not specified by source" : entry.model}</TableCell>
              <TableCell>{entry.model === COVERAGE_SENTINEL_MODEL ? "—" : entry.year}</TableCell>
              <TableCell>{entry.categoryName}</TableCell>
              <TableCell className="font-mono">{entry.partNumber}</TableCell>
              <TableCell>
                {entry.services.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {entry.services.map((service) => (
                      <Badge key={service.id} variant="secondary">
                        {service.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">No services confirmed</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{ENTRY_SOURCE_LABELS[entry.source]}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit entry #${entry.id}`}
                    onClick={() => onEdit(entry)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete entry #${entry.id}`}
                    onClick={() => onDelete(entry)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
