import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { coverageMake, coverageName, coverageYears, validateCoveragePart } from "../../lib/domain/coverage-validation";
import { normalizeCoverage, readSheet } from "./normalize";
import { validateImportRow } from "../../lib/domain/import";

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
