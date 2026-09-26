"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  previewImport,
  applyImport,
  type PreviewImportResult,
  type ApplyImportResult,
} from "@/lib/actions/import";

/**
 * The Excel/CSV compatibility import screen (TASK-040): file picker ->
 * previewImport() -> a preview table with error rows called out ->
 * Apply -> applyImport() -> result counts.
 *
 * Deliberately keeps its own local state instead of the wizard-style
 * sessionStorage store (/lib/wizard) — this is a single-page,
 * single-admin-session flow with nothing to resume across reloads, so a
 * plain useState is enough.
 */
export function CompatibilityImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewImportResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, startPreviewTransition] = useTransition();
  const [isApplying, startApplyTransition] = useTransition();
  const router = useRouter();

  function handleFileChange() {
    const file = fileInputRef.current?.files?.[0];
    setFileName(file?.name ?? null);
    setPreview(null);
    setApplyResult(null);
    setError(null);
  }

  function handlePreview() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a .csv or .xlsx file first.");
      return;
    }
    setError(null);
    setApplyResult(null);

    startPreviewTransition(async () => {
      try {
        const result = await previewImport(file);
        setPreview(result);
      } catch (err) {
        setPreview(null);
        setError(err instanceof Error ? err.message : "Failed to parse the file.");
      }
    });
  }

  function handleApply() {
    if (!preview || preview.validRows.length === 0) return;
    setError(null);

    startApplyTransition(async () => {
      try {
        const result = await applyImport(preview.validRows);
        setApplyResult(result);
        toast.success(
          `Import applied: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped.`,
        );
        // applyImport already revalidatePath()s /admin/compatibility
        // server-side; refresh() is what makes any already-rendered
        // client on this page pick that up now.
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply the import.");
      }
    });
  }

  function handleReset() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFileName(null);
    setPreview(null);
    setApplyResult(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border bg-background p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Columns: Make, Model, Year, Category (must match an existing category name), Part
          Number, then one column per service name ("1" or "x" = supported). Column names are
          matched case-insensitively and unknown extra columns are ignored with a warning.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={isPreviewing || isApplying}
            className="text-sm"
          />
          <Button type="button" onClick={handlePreview} disabled={!fileName || isPreviewing || isApplying}>
            {isPreviewing ? "Parsing…" : "Preview"}
          </Button>
          {preview || applyResult ? (
            <Button type="button" variant="ghost" onClick={handleReset} disabled={isPreviewing || isApplying}>
              Start over
            </Button>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </div>

      {preview ? (
        <PreviewSummary
          preview={preview}
          applyResult={applyResult}
          isApplying={isApplying}
          onApply={handleApply}
        />
      ) : null}
    </div>
  );
}

function PreviewSummary({
  preview,
  applyResult,
  isApplying,
  onApply,
}: {
  preview: PreviewImportResult;
  applyResult: ApplyImportResult | null;
  isApplying: boolean;
  onApply: () => void;
}) {
  const { validRows, errorRows, warnings } = preview;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">{validRows.length} valid</Badge>
          <Badge variant="destructive">{errorRows.length} with errors</Badge>
          {warnings.length > 0 ? (
            <Badge variant="outline">{warnings.length} column warning{warnings.length === 1 ? "" : "s"}</Badge>
          ) : null}
        </div>

        {applyResult ? (
          <div className="text-sm">
            Applied: <span className="font-medium">{applyResult.added} added</span>,{" "}
            <span className="font-medium">{applyResult.updated} updated</span>,{" "}
            <span className="font-medium">{applyResult.skipped} skipped</span>
            {applyResult.skipped > 0 ? " (re-validated and no longer matched a live category/service)" : ""}
          </div>
        ) : (
          <Button type="button" onClick={onApply} disabled={validRows.length === 0 || isApplying}>
            {isApplying ? "Applying…" : `Apply ${validRows.length} row${validRows.length === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>

      {applyResult && applyResult.skippedRows.length > 0 ? (
        <div className="rounded-md border border-dashed p-3 text-sm">
          <p className="mb-1 font-medium">
            {applyResult.skippedRows.length} row{applyResult.skippedRows.length === 1 ? "" : "s"} skipped during apply:
          </p>
          <ul className="list-inside list-disc text-muted-foreground">
            {applyResult.skippedRows.map((row) => (
              <li key={row.rowNumber}>
                Row {row.rowNumber}: {row.reasons.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {errorRows.length > 0 ? (
        <div className="rounded-md border">
          <p className="border-b bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">
            Rows with errors (not imported)
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Row</TableHead>
                <TableHead>Reasons</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errorRows.map((row) => (
                <TableRow key={row.rowNumber}>
                  <TableCell>{row.rowNumber}</TableCell>
                  <TableCell className="text-sm text-destructive">{row.reasons.join("; ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {validRows.length > 0 ? (
        <div className="rounded-md border">
          <p className="border-b bg-muted/50 px-3 py-2 text-sm font-medium">Valid rows</p>
          <div className="max-h-[28rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row</TableHead>
                  <TableHead>Make</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Services</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validRows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.make}</TableCell>
                    <TableCell>{row.model}</TableCell>
                    <TableCell>{row.year}</TableCell>
                    <TableCell>{row.categoryName}</TableCell>
                    <TableCell className="font-mono">{row.partNumber}</TableCell>
                    <TableCell>
                      {row.serviceNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {row.serviceNames.map((name) => (
                            <Badge key={name} variant="secondary">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
