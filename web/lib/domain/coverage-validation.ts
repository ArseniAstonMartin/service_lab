/** Conservative validation for manufacturer imports, not customer input. */
export function validateCoveragePart(raw: string): { partNumber: string; conditional: boolean } | null {
  const annotations = /[（(](?:PARTIALLY|BETA|DIAG ONLY|KLINE|CAN)[）)]/gi;
  const conditional = new RegExp(annotations.source, "i").test(raw);
  const partNumber = raw.replace(annotations, "").trim().toUpperCase();
  // Only explicit OEM part-number columns may call this validator. A pattern
  // alone cannot distinguish an OEM number from an MCU or ECU family code.
  if (partNumber.length < 5 || partNumber.length > 100) return null;
  if (!/^[A-Z0-9]+(?:[-. ][A-Z0-9]+)*$/.test(partNumber)) return null;
  if ((partNumber.match(/\d/g) ?? []).length < 4) return null;
  if (/^(?:0+|1+|9+|19\d{2}|20\d{2}|\d{4}[- ]\d{4})$/.test(partNumber)) return null;
  if (/^(?:TYPE|BOSCH|DENSO|DELPHI|SIMOS|EDC\d|MED\d|MEVD\d|MG1|MD1|SID\d|TC17|TC2\d|SPC5|R7F|RH850)/.test(partNumber)) return null;
  if (/\b(?:PART|NUMBER|UNKNOWN|NONE|NULL|DASHBOARD|READ|WRITE|FLASH|EEPROM|BENCH|BOOT|OBD|TYPE)\b/.test(partNumber)) return null;
  return { partNumber, conditional };
}

export function coverageText(value: unknown): string {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function coverageName(value: unknown): string | null {
  const text = coverageText(value).toUpperCase();
  if (!text || text.length > 50 || /[<>\r\n]/.test(text)) return null;
  if (/^(?:ALL|OTHER|OTHERS|UNKNOWN|NONE|NULL|N\/A|NA|MODEL|BRAND|MAKE|TYPE\s*\d*|[-?*]+)$/.test(text)) return null;
  return text;
}

const MAKE_ALIASES: Record<string, string> = {
  "MB BENZ": "Mercedes-Benz", BENZ: "Mercedes-Benz", "MERCEDES BENZ": "Mercedes-Benz",
  "MERCEDES-BENZ": "Mercedes-Benz", VW: "Volkswagen", VOLKSWAGEN: "Volkswagen",
  ALFAROMEO: "Alfa Romeo", "ALFA ROMEO": "Alfa Romeo", LANDROVER: "Land Rover",
  "LAND ROVER": "Land Rover", GREATWALL: "Great Wall", "GREAT WALL": "Great Wall",
  "LYNK&CO": "Lynk & Co", "LYNK & CO": "Lynk & Co",
  BMW: "BMW", GMC: "GMC", MG: "MG", BYD: "BYD", MINI: "MINI", DS: "DS",
};

export function coverageMake(value: unknown): string | null {
  const text = coverageName(value);
  if (text && MAKE_ALIASES[text]) return MAKE_ALIASES[text];
  // Group names are not individual makes. Never fan them out to every brand.
  if (!text || /[/&+]/.test(text) || /^(?:\d+|GM|JLR|PSA|VAG|CHINA|EUROPE|ASIA|USA)$/.test(text)) return null;
  if (/^(?:VW SKODA|HYUNDAI KIA|CHRYSLER DODGE|FORD LINCOLN|FIAT ABARTH|RENAULT DACIA|GM OPEL)/.test(text)) return null;
  return MAKE_ALIASES[text] ?? text.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Open ranges are allowed for the vehicle directory only, with an explicit horizon. */
export function coverageYears(raw: unknown, asOfYear: number): number[] {
  const text = coverageText(raw).replace(/[–—]/g, "-").replace(/\s/g, "");
  const single = /^(\d{4})$/.exec(text);
  const range = /^(\d{4})-(\d{4})?$/.exec(text);
  if (!single && !range) return [];
  const start = Number((single ?? range)![1]);
  const end = single ? start : range![2] ? Number(range![2]) : asOfYear;
  if (start < 1900 || end > asOfYear || end < start || end - start > 60) return [];
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
