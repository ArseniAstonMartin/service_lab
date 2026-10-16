import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { ensureVehicleDiagnosticsCatalog, DIAGNOSTICS_QUESTIONS } from "../prisma/vehicle-diagnostics-catalog";
import { DIAGNOSTICS_CATEGORY, VEHICLE_DIAGNOSTICS_SERVICE } from "../lib/domain/coverage";

/**
 * One-off: creates (or repairs) the Vehicle Diagnostics category/service/
 * question set against the real database -- prisma/seed.ts's full reseed
 * isn't meant to run standalone against a live, already-seeded database.
 * Idempotent (ensureVehicleDiagnosticsCatalog itself is), so safe to
 * re-run; existing pricing is never overwritten.
 *
 * Usage: npx tsx scripts/add-vehicle-diagnostics.ts [--apply] [--price-cents=<amount>]
 * Without --apply, only prints what would happen.
 */
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const priceArgument = args.find((arg) => arg.startsWith("--price-cents="));
const priceCents = priceArgument ? Number(priceArgument.split("=")[1]) : undefined;
const json = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v), 2);

async function main() {
  if (args.some((arg) => arg !== "--apply" && !/^--price-cents=\d+$/.test(arg))) {
    throw new Error("Usage: add-vehicle-diagnostics.ts [--apply] [--price-cents=<amount>]");
  }

  console.log(
    json({
      category: DIAGNOSTICS_CATEGORY,
      service: VEHICLE_DIAGNOSTICS_SERVICE,
      questions: DIAGNOSTICS_QUESTIONS.map((q) => q.questionCode),
      priceCents: priceCents ?? "unconfigured (quote after review)",
      apply,
    }),
  );
  if (!apply) {
    console.log("Dry run only -- pass --apply to write.");
    return;
  }

  loadEnvConfig(webRoot);
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
  });
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Same advisory-lock slot the Tesla script uses -- these two
        // catalog-ensure functions never run concurrently with each other.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(78392410)`;
        return ensureVehicleDiagnosticsCatalog(tx, priceCents);
      },
      // Default 5s timeout was too tight against the pooled connection
      // for this many round trips (category + service + tier + 2
      // questions, each its own query).
      { timeout: 20000 },
    );
    console.log(json({ applied: result }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
