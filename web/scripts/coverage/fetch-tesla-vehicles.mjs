import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Independent vehicle identity reference, never evidence of module support.
// Persist the source responses so imports are deterministic and work offline.
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../coverage_sources/reference/tesla-vehicles.json");
const endYear = new Date().getUTCFullYear();
const observations = [];
for (let year = 2008; year <= endYear; year++) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/tesla/modelyear/${year}?format=json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`NHTSA ${year}: HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.Results) || body.Count !== body.Results.length) throw new Error(`Invalid NHTSA response for ${year}`);
  const models = body.Results.filter((row) => row.Make_ID === 441 && row.Make_Name === "TESLA").map((row) => row.Model_Name);
  if (models.some((model) => typeof model !== "string" || !model.trim())) throw new Error(`Invalid model for ${year}`);
  observations.push({ year, url, models: [...new Set(models)].sort() });
  console.log(`${year}: ${models.join(", ") || "no published models"}`);
}
const snapshot = { schemaVersion: 1, purpose: "Vehicle selection only; does not establish part fitment or service support", make: "Tesla", retrievedAt: new Date().toISOString(), observations };
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`Saved ${observations.reduce((sum, row) => sum + row.models.length, 0)} model/year records to ${output}`);
