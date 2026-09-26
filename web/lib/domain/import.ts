/**
 * Compatibility import: row parsing and validation.
 *
 * Pure domain logic — no Prisma, Next.js or file-format-parsing (xlsx /
 * papaparse) imports. Takes the already-parsed spreadsheet rows (plain
 * header -> cell-string objects, the shape both xlsx and papaparse
 * produce) plus the catalog of known category/service names as plain
 * arrays, so this module stays framework-free and testable with plain
 * objects, matching the rest of /lib/domain.
 */

/** One raw spreadsheet row: header text (as written in the file) -> cell text. */
export type ImportCellRow = Record<string, string>;

export type ResolvedImportRow = {
  /** 1-based, matching the file's own row numbering (header is row 1). */
  rowNumber: number;
  make: string;
  model: string;
  year: number;
  /** The catalog's own casing, not necessarily what the file had. */
  categoryName: string;
  partNumber: string;
  /** Catalog service names (canonical casing) marked supported in this row. */
  serviceNames: string[];
};

export type ImportRowError = {
  rowNumber: number;
  reasons: string[];
};

export const IMPORT_YEAR_MIN = 1900;
export const IMPORT_YEAR_MAX = 2100;

const CANONICAL_COLUMNS = new Set(["make", "model", "year", "category", "part number"]);

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

/** Only "1" or "x" (either case, surrounding whitespace trimmed) mean "supported". */
function isSupportedCellValue(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "x";
}

/** Returns null for blank, non-numeric, non-integer, or out-of-range years. */
export function parseYearCell(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < IMPORT_YEAR_MIN || parsed > IMPORT_YEAR_MAX) return null;
  return parsed;
}

function getCell(row: ImportCellRow, canonicalHeader: string): string | undefined {
  const key = Object.keys(row).find((header) => normalizeHeader(header) === canonicalHeader);
  return key ? row[key] : undefined;
}

/**
 * Validates and resolves one raw row against the live catalog of
 * category and service names.
 *
 * Every recognized-but-invalid piece of the row (missing Make/Model,
 * invalid Year, empty Part Number, an unrecognized Category) adds a
 * reason and the row becomes an error row — never partially applied.
 *
 * Column headers that match neither the 5 fixed fields nor any known
 * service name are NOT an error on their own (see collectUnknownColumns
 * below, which reports them once at the file level as ignored). They
 * only turn THIS row into an error if the row actually tried to use one
 * (a non-empty "1"/"x" value) — otherwise a column nobody filled in for
 * this row is silently irrelevant to it.
 */
export function validateImportRow(
  raw: ImportCellRow,
  rowNumber: number,
  categoryNames: string[],
  serviceNames: string[],
): { row: ResolvedImportRow } | { error: ImportRowError } {
  const reasons: string[] = [];

  const make = (getCell(raw, "make") ?? "").trim();
  const model = (getCell(raw, "model") ?? "").trim();
  const categoryRaw = (getCell(raw, "category") ?? "").trim();
  const partNumber = (getCell(raw, "part number") ?? "").trim();
  const year = parseYearCell(getCell(raw, "year"));

  if (!make) reasons.push("Missing Make");
  if (!model) reasons.push("Missing Model");
  if (year === null) reasons.push("Invalid Year");
  if (!partNumber) reasons.push("Empty Part Number");

  const categoryMatch = categoryNames.find(
    (name) => name.toLowerCase() === categoryRaw.toLowerCase(),
  );
  if (!categoryMatch) {
    reasons.push(`Unknown category "${categoryRaw || "(blank)"}"`);
  }

  const serviceNameByLower = new Map(serviceNames.map((name) => [name.toLowerCase(), name]));
  const matchedServiceNames = new Set<string>();

  for (const header of Object.keys(raw)) {
    const normalized = normalizeHeader(header);
    if (CANONICAL_COLUMNS.has(normalized)) continue;

    const canonicalServiceName = serviceNameByLower.get(normalized);
    if (canonicalServiceName) {
      if (isSupportedCellValue(raw[header])) {
        matchedServiceNames.add(canonicalServiceName);
      }
      continue;
    }

    // An unrecognized column this row actually tried to use.
    if (isSupportedCellValue(raw[header])) {
      reasons.push(`Unknown service column "${header}"`);
    }
  }

  if (reasons.length > 0) {
    return { error: { rowNumber, reasons } };
  }

  return {
    row: {
      rowNumber,
      make,
      model,
      year: year as number,
      categoryName: categoryMatch as string,
      partNumber,
      serviceNames: Array.from(matchedServiceNames),
    },
  };
}

/**
 * Header columns present in the file that match neither a fixed field
 * (Make/Model/Year/Category/Part Number) nor a known service name.
 * Reported once, at the file level, as ignored warnings -- never a
 * reject reason by itself (see validateImportRow's docblock for when a
 * column DOES become a per-row error instead).
 */
export function collectUnknownColumns(headers: string[], serviceNames: string[]): string[] {
  const serviceNameLowerSet = new Set(serviceNames.map((name) => name.toLowerCase()));
  const seen = new Set<string>();
  const unknown: string[] = [];

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (CANONICAL_COLUMNS.has(normalized) || serviceNameLowerSet.has(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unknown.push(header);
  }

  return unknown;
}
