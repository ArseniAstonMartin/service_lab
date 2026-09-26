"use server";

import "server-only";
import { z } from "zod";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { EntrySource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { normalizePartNumber } from "@/lib/domain/part-number";
import {
  collectUnknownColumns,
  validateImportRow,
  IMPORT_YEAR_MIN,
  IMPORT_YEAR_MAX,
  type ImportCellRow,
  type ImportRowError,
  type ResolvedImportRow,
} from "@/lib/domain/import";

// Matches next.config.mjs's serverActions.bodySizeLimit -- the file is
// passed straight through this Server Action, not through a Vercel Blob
// upload token (TASK-014's flow is for wizard/label photos, not this
// admin-only spreadsheet import).
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export type PreviewImportResult = {
  validRows: ResolvedImportRow[];
  errorRows: ImportRowError[];
  warnings: string[];
};

/**
 * Parses an uploaded .csv or .xlsx file into plain header -> cell-string
 * row objects. IO/format-parsing glue only -- every actual validation
 * decision lives in /lib/domain/import, which never sees a File.
 */
async function parseFileToRows(file: File): Promise<ImportCellRow[]> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (name.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buffer);
    const parsed = Papa.parse<ImportCellRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });
    if (parsed.errors.length > 0) {
      throw new Error(`Failed to parse CSV: ${parsed.errors[0].message}`);
    }
    return parsed.data;
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    // raw: false forces every cell (including Year) to its display
    // string, matching what papaparse gives us for CSV -- one shared
    // "row is Record<string,string>" shape for /lib/domain/import to
    // validate regardless of which file format was uploaded.
    return XLSX.utils.sheet_to_json<ImportCellRow>(sheet, { defval: "", raw: false });
  }

  throw new Error("Unsupported file type — upload a .csv or .xlsx file.");
}

/**
 * previewImport (TASK-039): parses the uploaded file and validates every
 * row against the LIVE category/service catalog, without writing
 * anything. requireAdmin()-gated like every other admin Server Action
 * (see lib/supabase/require-admin.ts) -- this is independently
 * reachable and not covered by middleware.ts's page-level guard.
 */
export async function previewImport(file: File): Promise<PreviewImportResult> {
  await requireAdmin();

  if (!(file instanceof File)) {
    throw new Error("No file was uploaded.");
  }
  if (file.size === 0) {
    throw new Error("The uploaded file is empty.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File is too large (max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB).`);
  }

  const rawRows = await parseFileToRows(file);
  if (rawRows.length === 0) {
    throw new Error("No data rows found in the file.");
  }

  const [categories, services] = await Promise.all([
    prisma.moduleCategory.findMany(),
    prisma.service.findMany(),
  ]);
  const categoryNames = categories.map((category) => category.name);
  const serviceNames = services.map((service) => service.name);

  const validRows: ResolvedImportRow[] = [];
  const errorRows: ImportRowError[] = [];

  rawRows.forEach((raw, index) => {
    // Row 1 is the header, so the first data row is row 2 -- matches
    // what the admin sees if they open the same file in a spreadsheet
    // app, which is what the error-row reasons need to point back to.
    const result = validateImportRow(raw, index + 2, categoryNames, serviceNames);
    if ("row" in result) {
      validRows.push(result.row);
    } else {
      errorRows.push(result.error);
    }
  });

  const allHeaders = Array.from(new Set(rawRows.flatMap((row) => Object.keys(row))));
  const unknownColumns = collectUnknownColumns(allHeaders, serviceNames);
  const warnings = unknownColumns.map(
    (column) => `Column "${column}" doesn't match a known field or service and was ignored.`,
  );

  return { validRows, errorRows, warnings };
}

const applyImportRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  make: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: z.number().int().min(IMPORT_YEAR_MIN).max(IMPORT_YEAR_MAX),
  categoryName: z.string().trim().min(1),
  partNumber: z.string().trim().min(1),
  serviceNames: z.array(z.string().trim().min(1)),
});

const applyImportSchema = z.array(applyImportRowSchema).min(1);

export type ApplyImportResult = {
  added: number;
  updated: number;
  skipped: number;
  skippedRows: ImportRowError[];
};

// Batched rather than one giant transaction: a real compatibility import
// (PRD 5.3's primary population method) can be hundreds of rows, and a
// single multi-hundred-statement transaction is both slow to hold open
// and, if it fails partway, throws away every row's progress instead of
// just the batches after the failure.
const APPLY_BATCH_SIZE = 25;

/**
 * applyImport (TASK-039): takes the rows previewImport already resolved
 * as valid and re-validates + writes them.
 *
 * Never trusts categoryName/serviceNames as still-correct just because
 * previewImport said so a moment ago -- the catalog is re-read fresh
 * here and every row is re-resolved against it, the same
 * never-trust-the-client stance TASK-036's confirmCompatibility applies
 * to its own supportedServiceIds/selectedServiceId.
 */
export async function applyImport(rows: ResolvedImportRow[]): Promise<ApplyImportResult> {
  await requireAdmin();
  const parsedRows = applyImportSchema.parse(rows);

  const [categories, services] = await Promise.all([
    prisma.moduleCategory.findMany(),
    prisma.service.findMany(),
  ]);
  const categoryByLowerName = new Map(categories.map((category) => [category.name.toLowerCase(), category]));
  const serviceByLowerName = new Map(services.map((service) => [service.name.toLowerCase(), service]));

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const skippedRows: ImportRowError[] = [];

  for (let start = 0; start < parsedRows.length; start += APPLY_BATCH_SIZE) {
    const batch = parsedRows.slice(start, start + APPLY_BATCH_SIZE);

    await prisma.$transaction(async (tx) => {
      for (const row of batch) {
        const category = categoryByLowerName.get(row.categoryName.toLowerCase());
        if (!category) {
          skipped++;
          skippedRows.push({
            rowNumber: row.rowNumber,
            reasons: [`Unknown category "${row.categoryName}"`],
          });
          continue;
        }

        // A service name only counts if it still resolves AND still
        // belongs to this row's category -- a service could have been
        // renamed, deleted, or re-categorized since previewImport ran.
        const resolvedServiceIds: bigint[] = [];
        const unresolvedServiceNames: string[] = [];
        for (const name of row.serviceNames) {
          const service = serviceByLowerName.get(name.toLowerCase());
          if (service && service.categoryId === category.id) {
            resolvedServiceIds.push(service.id);
          } else {
            unresolvedServiceNames.push(name);
          }
        }
        if (unresolvedServiceNames.length > 0) {
          skipped++;
          skippedRows.push({
            rowNumber: row.rowNumber,
            reasons: unresolvedServiceNames.map(
              (name) => `Service "${name}" no longer matches this category`,
            ),
          });
          continue;
        }

        const partNumber = normalizePartNumber(row.partNumber);

        const vehicle = await tx.vehicle.upsert({
          where: { make_model_year: { make: row.make, model: row.model, year: row.year } },
          create: { make: row.make, model: row.model, year: row.year },
          update: {},
        });

        const entryKey = {
          vehicleId: vehicle.id,
          categoryId: category.id,
          partNumber,
        };

        const existingEntry = await tx.compatibilityEntry.findUnique({
          where: { vehicleId_categoryId_partNumber: entryKey },
        });

        // Import always wins for the exact row it's given, the same
        // "re-confirming replaces what was there" stance
        // confirmCompatibility (TASK-036) takes for admin_confirmed
        // entries -- an entry re-listed in a later import is treated as
        // this file's current word on it, source and service links both.
        const entry = await tx.compatibilityEntry.upsert({
          where: { vehicleId_categoryId_partNumber: entryKey },
          create: { ...entryKey, source: EntrySource.import },
          update: { source: EntrySource.import },
        });

        await tx.compatibilityService.deleteMany({ where: { entryId: entry.id } });
        if (resolvedServiceIds.length > 0) {
          await tx.compatibilityService.createMany({
            data: resolvedServiceIds.map((serviceId) => ({ entryId: entry.id, serviceId })),
          });
        }

        if (existingEntry) {
          updated++;
        } else {
          added++;
        }
      }
    });
  }

  // The import screen (TASK-040) sends the admin back to
  // /admin/compatibility to see the results land -- refresh it here
  // rather than relying on the client's router.refresh(), same as every
  // other admin mutation (e.g. confirmCompatibility) revalidating its
  // own downstream pages itself.
  revalidatePath("/admin/compatibility");

  return { added, updated, skipped, skippedRows };
}
