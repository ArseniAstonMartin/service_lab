/** Legacy entry point; all parsing and writes use the validated bulk pipeline. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", fileURLToPath(new URL("./coverage-import.ts", import.meta.url)), "--replace"],
  { cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
