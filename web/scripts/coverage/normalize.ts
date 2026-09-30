import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { coverageMake, coverageName, coverageText, coverageYears, validateCoveragePart } from "../../lib/domain/coverage-validation";
import { BATTERY_CATEGORY, TESLA_BATTERY_SERVICE, COVERAGE_SENTINEL_MODEL, COVERAGE_SENTINEL_YEAR } from "../../lib/domain/coverage";

export type VehicleRow = { make: string; model: string; year: number };
export type Origin = { file: string; sheet: string; row: number; rawPart: string; method: string; conditional: boolean; system: string; voltage: string };
export type CoverageRow = VehicleRow & { category: string; partNumber: string; services: string[]; origins: Origin[] };
export const vehicleKey = (v: VehicleRow) => JSON.stringify([v.make, v.model, v.year]);
export const entryKey = (v: VehicleRow & { category: string; partNumber: string }) => JSON.stringify([v.make, v.model, v.year, v.category, v.partNumber]);
const header = (s: unknown) => coverageText(s).toLowerCase().replace(/[\s._-]/g, "");
const supported = (s: unknown) => ["√", "✔", "✓", "yes", "true", "1"].includes(coverageText(s).toLowerCase());

export function discover(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isSymbolicLink()) return [];
    const full = path.join(dir, e.name);
    return e.isDirectory() ? discover(full) : [full];
  }).sort();
}

export function readSheet(sheet: XLSX.WorkSheet) {
  // Keep physical row numbers, including blanks, for an auditable rejection log.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: true, range: 0 });
  const headerIndex = rows.slice(0, 20).findIndex((r) => {
    const h = r.map(header);
    return h.some((s) => s === "brand" || s === "make") && h.some((s) => ["model", "module", "system", "partnumber", "partno", "type", "ecutype", "series", "keytype"].includes(s));
  });
  if (headerIndex < 0) return { rows, headerIndex, headers: [] as string[] };
  const headers = rows[headerIndex].map(header);
  // Inherit only explicit vertical identity merges, never capability flags or
  // part numbers. Title merges and blanks outside merges remain untouched.
  for (const merge of sheet["!merges"] ?? []) {
    if (merge.s.r <= headerIndex || merge.s.c !== merge.e.c) continue;
    if (!["brand", "make", "model", "year", "system", "module"].includes(headers[merge.s.c])) continue;
    for (let r = merge.s.r + 1; r <= merge.e.r; r++) {
      if (rows[r] && !coverageText(rows[r][merge.s.c])) rows[r][merge.s.c] = rows[merge.s.r]?.[merge.s.c] ?? "";
    }
  }
  return { rows, headerIndex, headers };
}

function categoryFor(file: string, system: string, make: string): string | null {
  const s = coverageText(system).toUpperCase();
  if (make === "Tesla" && s === "VCFRONT") return "BCM";
  if (/CRASH RESET\/BATTERY RESET/i.test(file) && /^(?:BMS|BMSH|BMSL|HV BATTERY|BCSM|MVBM)$/.test(s)) return BATTERY_CATEGORY;
  // The airbag workbook also contains non-SRS systems (Tesla TAS/VCFRONT).
  // Its filename is not evidence that those are restraint modules.
  if (/CRASH RESET\/AIRBAG/i.test(file) && (!s || /^(?:AIRBAG|SRS)$/.test(s))) return "Airbag/SRS";
  if (/Test Platform\/Dashboard/i.test(file)) return "Instrument Cluster";
  if (/^(?:AIRBAG|SRS)$/.test(s)) return "Airbag/SRS";
  if (/^(?:ECM|PCM|ECU|ENGINE CONTROL MODULE)$/.test(s)) return "ECM/PCM";
  if (/^(?:TCM|TCU|TRANSMISSION)$/.test(s)) return "TCM/TCU";
  if (/^(?:BCM|BSI|BODY CONTROL MODULE)$/.test(s)) return "BCM";
  if (/^(?:DASHBOARD|INSTRUMENT CLUSTER|CLUSTER)$/.test(s)) return "Instrument Cluster";
  return null;
}

export function normalizeCoverage(root: string, asOfYear: number) {
  const vehicles = new Map<string, VehicleRow>();
  const entries = new Map<string, CoverageRow>();
  const issues: { file: string; sheet: string; row: number; reason: string; values: unknown[] }[] = [];
  const manifest: { file: string; sha256: string; sheets: { name: string; headers: string[]; rows: number }[] }[] = [];
  const ignoredFiles: string[] = [];
  const vehicleReferences: { file: string; sha256: string; retrievedAt: string; records: number }[] = [];
  const reasons: Record<string, number> = {};
  const stats = { files: 0, sheets: 0, nonemptyRows: 0, acceptedPartRows: 0, skippedPartRows: 0, duplicateEntries: 0, vehicleSourceRows: 0, openYearVehicleRows: 0 };
  const addVehicle = (v: VehicleRow) => vehicles.set(vehicleKey(v), v);
  // These sheets omit Tesla model/year entirely. A checked-in NHTSA snapshot
  // supplies vehicle identity independently; it NEVER fans part numbers out
  // to models or grants service support. Invalid snapshots fail before writes.
  const referenceFile = path.join(root, "reference/tesla-vehicles.json");
  if (fs.existsSync(referenceFile)) {
    const bytes = fs.readFileSync(referenceFile);
    const snapshot = JSON.parse(bytes.toString()) as { schemaVersion: number; make: string; retrievedAt: string; observations: { year: number; url: string; models: string[] }[] };
    if (snapshot.schemaVersion !== 1 || snapshot.make !== "Tesla" || !Array.isArray(snapshot.observations)) throw new Error("Invalid Tesla vehicle reference");
    let records = 0;
    for (const observation of snapshot.observations) {
      if (!Number.isInteger(observation.year) || observation.year < 2008 || observation.year > asOfYear || observation.url !== `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/tesla/modelyear/${observation.year}?format=json` || !Array.isArray(observation.models)) throw new Error("Invalid Tesla vehicle reference observation");
      for (const rawModel of observation.models) {
        const model = coverageName(rawModel);
        if (!model || typeof rawModel !== "string") throw new Error("Invalid Tesla reference model");
        addVehicle({ make: "Tesla", model, year: observation.year });
        records++;
      }
    }
    vehicleReferences.push({ file: "reference/tesla-vehicles.json", sha256: createHash("sha256").update(bytes).digest("hex"), retrievedAt: snapshot.retrievedAt, records });
  }
  for (const full of discover(root)) {
    const file = path.relative(root, full).replace(/\\/g, "/");
    if (full === referenceFile) continue;
    if (!/\.(xlsx|xls)$/i.test(file) || path.basename(file).startsWith("~$")) { ignoredFiles.push(file); continue; }
    const buffer = fs.readFileSync(full);
    // Parsing errors abort the entire run, including a replacement. Never clear
    // the live catalog after silently skipping a damaged workbook.
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const meta = { file, sha256: createHash("sha256").update(buffer).digest("hex"), sheets: [] as { name: string; headers: string[]; rows: number }[] };
    manifest.push(meta);
    stats.files++;
    for (const name of workbook.SheetNames) {
      stats.sheets++;
      const { rows, headerIndex, headers } = readSheet(workbook.Sheets[name]);
      meta.sheets.push({ name, headers, rows: rows.length });
      const index = (...names: string[]) => headers.findIndex((h) => names.includes(h));
      const makeIndex = index("brand", "make"), modelIndex = index("model"), yearIndex = index("year");
      const partIndex = index("partnumber", "partno");
      const vehicleLayout = /\/(?:IMMO\/(?:CAR|E-Car)\/|ODO\/CAR ODO\/|ECU Advanced\/)/i.test(file);
      const partLayout = /\/(?:CRASH RESET\/|ECU Advanced\/|Test Platform\/Dashboard)/i.test(file);
      for (let r = headerIndex < 0 ? 0 : headerIndex + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row.some((v) => coverageText(v))) continue;
        stats.nonemptyRows++;
        const reject = (reason: string) => {
          stats.skippedPartRows++;
          reasons[reason] = (reasons[reason] ?? 0) + 1;
          issues.push({ file, sheet: name, row: r + 1, reason, values: row });
        };
        if (headerIndex < 0) { reject("unrecognized_layout"); continue; }
        if (header(row[makeIndex]) === "brand" || header(row[makeIndex]) === "make") { reject("repeated_header"); continue; }
        const make = coverageMake(row[makeIndex]);
        const model = coverageName(row[modelIndex]);
        const years = coverageYears(row[yearIndex], asOfYear);
        if (vehicleLayout && make && model && years.length) {
          stats.vehicleSourceRows++;
          if (/\d{4}\s*[-–—]\s*$/.test(coverageText(row[yearIndex]))) stats.openYearVehicleRows++;
          for (const year of years) addVehicle({ make, model, year });
        }
        if (partIndex < 0) { reject("no_explicit_part_number_column"); continue; }
        if (!partLayout) { reject("outside_module_scope"); continue; }
        const rawPart = String(row[partIndex] ?? "");
        // Numeric precision already lost by Excel cannot be reconstructed.
        const cell = workbook.Sheets[name][XLSX.utils.encode_cell({ r, c: partIndex })];
        if (cell?.f || (cell?.t === "n" && (!Number.isSafeInteger(cell.v) || String(cell.v).length > 15))) { reject("unsafe_excel_identifier"); continue; }
        const validated = validateCoveragePart(rawPart);
        if (!validated) { reject(coverageText(rawPart) ? "invalid_part_number" : "empty_part_number"); continue; }
        if (!make) { reject("missing_or_ambiguous_make"); continue; }
        const system = coverageText(row[index("module", "system", "system/platform")]);
        const voltage = coverageText(row[index("voltage")]);
        const category = categoryFor(file, system, make);
        if (!category) { reject("unsupported_module_category"); continue; }
        const conditional = validated.conditional || /\b(?:PARTIALLY|BETA|LOCKED|ONLY|EXCEPT)\b/i.test(row.map(coverageText).join(" "));
        const services: string[] = [];
        // No inference from read/write, repair(reset), dashboard tests, or CS.
        if (!conditional && category === "Airbag/SRS" && supported(row[index("erasecrash", "clearcrash")])) services.push("Crash Data Reset");
        if (!conditional && category === "ECM/PCM" && supported(row[index("writevin")])) services.push("ECM VIN Write");
        if (!conditional && category === BATTERY_CATEGORY && make === "Tesla" && system.toUpperCase() === "BMS" && voltage.replace(/\s/g, "").toUpperCase() === "16V" && supported(row[index("erasecrash", "clearcrash")])) services.push(TESLA_BATTERY_SERVICE);
        const origin = { file, sheet: name, row: r + 1, rawPart, conditional, system, voltage, method: coverageText(row[index("method", "commmode")]) };
        // This vendor joins a Tesla OEM identifier and its Bosch identifier in
        // one cell. Keep the OEM identifier, preserving the full cell above.
        const teslaBosch = make === "Tesla" && coverageText(row[index("ecumanufacture")]).toUpperCase() === "BOSCH"
          ? /^(\d{7}-\d{2}-[A-Z])-028\d{7}$/.exec(validated.partNumber) : null;
        const partNumber = teslaBosch?.[1] ?? validated.partNumber;
        let applications: VehicleRow[];
        if (model && years.length && !/\d{4}\s*[-–—]\s*$/.test(coverageText(row[yearIndex]))) {
          applications = years.map((year) => ({ make, model, year }));
        } else if (/CRASH RESET\//i.test(file) && modelIndex < 0 && yearIndex < 0) {
          // Existing schema's private brand/part container; NEVER shown as a
          // real model/year. Matching is restricted to this make and part.
          applications = [{ make, model: COVERAGE_SENTINEL_MODEL, year: COVERAGE_SENTINEL_YEAR }];
        } else { reject("missing_exact_vehicle_applicability"); continue; }
        stats.acceptedPartRows++;
        for (const application of applications) {
          addVehicle(application);
          const candidate: CoverageRow = { ...application, category, partNumber, services, origins: [origin] };
          const key = entryKey(candidate);
          const previous = entries.get(key);
          if (previous) {
            stats.duplicateEntries++;
            // Conservative intersection: conflicting or qualified duplicate
            // evidence cannot grant a service that another row does not confirm.
            previous.services = previous.services.filter((s) => services.includes(s));
            previous.origins.push(origin);
          } else entries.set(key, candidate);
        }
      }
    }
  }
  const sortedVehicles = [...vehicles.values()].sort((a, b) => vehicleKey(a).localeCompare(vehicleKey(b)));
  const sortedEntries = [...entries.values()].sort((a, b) => entryKey(a).localeCompare(entryKey(b)));
  if (stats.nonemptyRows !== stats.acceptedPartRows + stats.skippedPartRows) throw new Error("Row accounting mismatch");
  return {
    policyVersion: 2, asOfYear, vehicles: sortedVehicles, entries: sortedEntries, issues, manifest, vehicleReferences, ignoredFiles,
    summary: { ...stats, reasons, vehicles: sortedVehicles.length, publicVehicles: sortedVehicles.filter((v) => v.model !== COVERAGE_SENTINEL_MODEL).length, entries: sortedEntries.length, confirmedEntries: sortedEntries.filter((v) => v.services.length).length, reviewOnlyEntries: sortedEntries.filter((v) => !v.services.length).length },
  };
}
