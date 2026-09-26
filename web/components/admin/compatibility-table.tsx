import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ENTRY_SOURCE_LABELS } from "@/lib/constants";

export type CompatibilityEntryRow = {
  id: string;
  make: string;
  model: string;
  year: number;
  categoryName: string;
  partNumber: string;
  services: { id: string; name: string }[];
  source: "import" | "admin_confirmed";
};

/**
 * The read-only compatibility-database table for /admin/compatibility
 * (TASK-038). No row click / no admin action here on purpose -- this
 * task is explicitly read-only (PRD 5.3: "a full manual CRUD UI... is
 * secondary, not MVP-blocking"); editing an entry happens indirectly,
 * either through TASK-036's confirm-compatibility flow or TASK-039/040's
 * import.
 */
export function CompatibilityTable({ entries }: { entries: CompatibilityEntryRow[] }) {
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{entry.make}</TableCell>
              <TableCell>{entry.model}</TableCell>
              <TableCell>{entry.year}</TableCell>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
