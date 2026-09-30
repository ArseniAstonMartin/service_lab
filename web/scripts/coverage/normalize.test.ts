import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { coverageMake, coverageName, coverageYears, validateCoveragePart } from "../../lib/domain/coverage-validation";
import { normalizeCoverage, readSheet } from "./normalize";
import { validateImportRow } from "../../lib/domain/import";
import { BATTERY_CATEGORY, TESLA_BATTERY_SERVICE, COVERAGE_SENTINEL_MODEL } from "../../lib/domain/coverage";

test("OEM validation rejects column drift, placeholders, ECU/chip codes and Excel errors", () => {
  for (const value of ["", "✔", "TYPE1", "2012-2017", "BENCH", "TC1797", "R7F7010123", "EDC17C64", "READ EEPROM 12345", "#REF!", "1234E+12", "000000", "A".repeat(101), "A0999004101/A0999008300"]) {
    assert.equal(validateCoveragePart(value), null, value);
  }
  assert.deepEqual(validateCoveragePart(" 0012345678 "), { partNumber: "0012345678", conditional: false });
  assert.deepEqual(validateCoveragePart("77960-S3V-A813-M1(PARTIALLY)"), { partNumber: "77960-S3V-A813-M1", conditional: true });
  assert.deepEqual(validateCoveragePart("J38580678（KLINE)"), { partNumber: "J38580678", conditional: true });
});

test("names and year bounds never invent grouped makes or truncate invalid ranges", () => {
  assert.equal(coverageMake("MB BENZ"), "Mercedes-Benz");
  assert.equal(coverageMake("VW"), "Volkswagen");
  assert.equal(coverageMake("LYNK&CO"), "Lynk & Co");
  assert.equal(coverageMake("HYUNDAI KIA"), null);
  assert.equal(coverageName("3"), "3");
  assert.equal(coverageName("All"), null);
  assert.deepEqual(coverageYears("2024–", 2026), [2024, 2025, 2026]);
  for (const raw of ["2007.04-", "-2020", "2025-2024", "2020abc", "1900-2026", "2099"]) assert.deepEqual(coverageYears(raw, 2026), [], raw);
});

test("only identity cells inside actual vertical merges are inherited", () => {
  const s = XLSX.utils.aoa_to_sheet([["Brand", "Module", "Part Number", "Erase Crash"], ["AUDI", "SRS", "8V0959655A", "✔"], ["", "SRS", "8V0959655B", ""], ["", "SRS", "8V0959655C", ""]]);
  s["!merges"] = [XLSX.utils.decode_range("A2:A3"), XLSX.utils.decode_range("D2:D3")];
  const { rows } = readSheet(s);
  assert.equal(rows[2][0], "AUDI");
  assert.equal(rows[3][0], "");
  assert.equal(rows[2][3], "");
});

test("all sheets are parsed; qualified/conflicting rows cannot authorize services; types never become parts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-test-"));
  try {
    const airbag = path.join(root, "OBD Star G3/CRASH RESET");
    const immo = path.join(root, "OBD Star G3/IMMO/CAR");
    fs.mkdirSync(airbag, { recursive: true });
    fs.mkdirSync(immo, { recursive: true });
    const w = XLSX.utils.book_new();
    const h = ["Brand", "Module", "Part Number", "Erase Crash", "Write EEPROM", "Method"];
    XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([["Title"], h, ["AUDI", "SRS", "8V0959655A", "✔", "", "BENCH"], ["AUDI", "SRS", "8V0959655B(PARTIALLY)", "✔"], ["AUDI", "SRS", "TYPE1", "✔"]]), "first");
    XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([h, ["AUDI", "SRS", "8V0959655A", ""], ["AUDI", "SRS", "8V0959655C", "", "✔"], ["AUDI", "SRS", "8V0959655D", "✔"]]), "second");
    XLSX.writeFile(w, path.join(airbag, "AIRBAG.xlsx"));
    const v = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(v, XLSX.utils.aoa_to_sheet([["Brand", "Model", "Year", "TYPE"], ["AUDI", "A3", "2024-2025", "TC1797"]]), "vehicles");
    XLSX.writeFile(v, path.join(immo, "AUDI.xlsx"));
    const result = normalizeCoverage(root, 2026);
    assert.equal(result.summary.sheets, 3);
    assert.equal(result.summary.entries, 4);
    assert.equal(result.summary.confirmedEntries, 1);
    assert.equal(result.summary.publicVehicles, 2);
    assert.equal(result.summary.duplicateEntries, 1);
    assert.equal(result.entries.find((e) => e.partNumber === "8V0959655A")!.origins.length, 2);
    assert.equal(result.summary.nonemptyRows, result.summary.acceptedPartRows + result.summary.skippedPartRows);
    assert.deepEqual(normalizeCoverage(root, 2026), result);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("admin CSV validation cannot reintroduce type codes or strip conditional support", () => {
  for (const part of ["TYPE1", "TC1797", "8V0959655A(PARTIALLY)"]) {
    const result = validateImportRow({ Make: "Audi", Model: "A3", Year: "2020", Category: "Airbag/SRS", "Part Number": part, "Crash Data Reset": "x" }, 2, ["Airbag/SRS"], ["Crash Data Reset"]);
    assert.ok("error" in result);
  }
});

test("Tesla battery reset requires a valid OEM part, BMS system, 16V and explicit crash erase", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tesla-coverage-"));
  try {
    const dir = path.join(root, "OBD Star G3/CRASH RESET");
    fs.mkdirSync(dir, { recursive: true });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Brand", "System", "Part Number", "VOLTAGE", "Method", "Erase Crash", "Write EEPROM", "Erase DTC"],
      ["TESLA", "BMS", "1598486-00-D", "16V", "JTAG", "✔"],
      ["TESLA", "BMS", "1598486-00-F", "16V", "JTAG", "", "✔", "✔"],
      ["TESLA", "BMS", "1598486-00-G(PARTIALLY)", "16V", "JTAG", "✔"],
      ["TESLA", "BMS", "1598486-99-D", "400V", "JTAG", "✔"],
      ["TESLA", "BMS", "", "16V", "JTAG", "✔"],
      ["TESLA", "BMS", "TYPE1", "16V", "JTAG", "✔"],
      ["AUDI", "BMS", "4N0915105F", "48V", "BENCH", "✔"],
    ]), "Battery");
    XLSX.writeFile(workbook, path.join(dir, "BATTERY RESET.xlsx"));
    const result = normalizeCoverage(root, 2026);
    assert.equal(result.entries.length, 5);
    assert.equal(result.summary.confirmedEntries, 1);
    const supported = result.entries.find((e) => e.partNumber === "1598486-00-D")!;
    assert.equal(supported.category, BATTERY_CATEGORY);
    assert.equal(supported.model, COVERAGE_SENTINEL_MODEL);
    assert.deepEqual(supported.services, [TESLA_BATTERY_SERVICE]);
    assert.equal(supported.origins[0].voltage, "16V");
    assert.equal(supported.origins[0].method, "JTAG");
    assert.equal(result.summary.publicVehicles, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Tesla combined OEM/Bosch identifiers merge conservatively and non-SRS rows cannot gain SRS reset", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tesla-airbag-"));
  try {
    const dir = path.join(root, "OBD Star G3/CRASH RESET");
    fs.mkdirSync(dir, { recursive: true });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Brand", "Module", "Part Number", "ECU Manufacture", "Erase Crash"],
      ["TESLA", "SRS", "1512876-00-D-0285015427", "BOSCH", "✔"],
      ["TESLA", "SRS", "1512876-00-D-0285020422", "BOSCH", ""],
      ["TESLA", "VCFRONT", "1516640-03-E", "", "✔"],
      ["TESLA", "TAS", "1033174-01-F", "", "✔"],
    ]), "Airbag");
    XLSX.writeFile(workbook, path.join(dir, "AIRBAG RESET.xlsx"));
    const result = normalizeCoverage(root, 2026);
    assert.equal(result.entries.length, 2);
    const srs = result.entries.find((e) => e.category === "Airbag/SRS")!;
    assert.equal(srs.partNumber, "1512876-00-D");
    assert.equal(srs.origins.length, 2);
    assert.deepEqual(srs.services, []);
    const body = result.entries.find((e) => e.partNumber === "1516640-03-E")!;
    assert.equal(body.category, "BCM");
    assert.deepEqual(body.services, []);
    assert.equal(result.summary.reasons.unsupported_module_category, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("real Tesla sources supply all four battery parts, and reference vehicles never become fitment claims", () => {
  const root = path.resolve(import.meta.dirname, "../../../coverage_sources");
  const result = normalizeCoverage(root, 2026);
  const battery = result.entries.filter((e) => e.make === "Tesla" && e.category === BATTERY_CATEGORY);
  assert.deepEqual(battery.map((e) => e.partNumber).sort(), ["1598486-00-D", "1598486-00-F", "1598486-00-G", "1598486-99-D"]);
  assert.ok(battery.every((e) => e.model === COVERAGE_SENTINEL_MODEL && e.services.includes(TESLA_BATTERY_SERVICE)));
  assert.ok(result.vehicles.some((v) => v.make === "Tesla" && v.model === "MODEL Y" && v.year === 2024));
  assert.ok(result.vehicles.some((v) => v.make === "Tesla" && v.model === "MODEL 3" && v.year === 2018));
  assert.ok(!result.vehicles.some((v) => v.make === "Tesla" && v.model === "MODEL Y" && v.year === 2018));
  assert.equal(result.entries.filter((e) => e.make === "Tesla" && e.model !== COVERAGE_SENTINEL_MODEL).length, 0);
  assert.equal(result.vehicleReferences[0].records, 56);
});
