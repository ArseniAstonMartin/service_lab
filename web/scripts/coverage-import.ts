import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient, Prisma } from "@prisma/client";
import { normalizeCoverage, vehicleKey, entryKey } from "./coverage/normalize";
import { coverageMake, coverageName } from "../lib/domain/coverage-validation";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(webRoot, "../coverage_sources");
const outputRoot = path.join(webRoot, "data/coverage-import");
const args = process.argv.slice(2);
const mode = args[0] ?? "--dry-run";
const BATCH_SIZE = 3000;
const stringify = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2);
function writePrivate(file: string, value: unknown) {
  fs.writeFileSync(file, stringify(value) + "\n", { mode: 0o600, flag: "wx" });
}
async function batches<T>(rows: T[], apply: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) await apply(rows.slice(i, i + BATCH_SIZE));
}

async function main() {
  if (!["--dry-run", "--replace", "--purge-only", "--inspect", "--verify"].includes(mode) || args.length > 1) {
    throw new Error("Usage: coverage-import.ts [--dry-run|--replace|--purge-only|--inspect|--verify]");
  }
  const started = performance.now();
  fs.mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(outputRoot, runId);
  fs.mkdirSync(runDir, { mode: 0o700 });
  const normalized = mode === "--purge-only" || mode === "--inspect" ? null : normalizeCoverage(sourceRoot, new Date().getUTCFullYear());
  if (normalized) {
    writePrivate(path.join(runDir, "normalized.json"), { ...normalized, issues: undefined });
    writePrivate(path.join(runDir, "rejected-rows.json"), normalized.issues);
    console.log("Normalization:", stringify(normalized.summary));
    if (!normalized.entries.length || !normalized.summary.publicVehicles) throw new Error("Refusing an empty or unusable replacement");
  }
  const normalizationSeconds = Number(((performance.now() - started) / 1000).toFixed(3));
  if (mode === "--dry-run") {
    writePrivate(path.join(runDir, "report.json"), { mode, normalizationSeconds, ...normalized!.summary });
    console.log(`Dry run complete in ${normalizationSeconds}s. Reports: ${runDir}`);
    return;
  }

  loadEnvConfig(webRoot);
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DIRECT_URL or DATABASE_URL is required");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    if (mode === "--verify") {
      const [vehicles, entries, links, categories, services, orders] = await Promise.all([
        prisma.vehicle.findMany(), prisma.compatibilityEntry.findMany(), prisma.compatibilityService.findMany(),
        prisma.moduleCategory.findMany(), prisma.service.findMany(),
        prisma.order.findMany({ select: { vehicleId: true } }),
      ]);
      const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
      const categoryById = new Map(categories.map((c) => [c.id, c.name]));
      const serviceById = new Map(services.map((s) => [s.id, s.name]));
      const linksByEntry = new Map<bigint, string[]>();
      for (const link of links) linksByEntry.set(link.entryId, [...(linksByEntry.get(link.entryId) ?? []), serviceById.get(link.serviceId)!]);
      const actual = entries.map((e) => JSON.stringify([entryKey({ ...vehicleById.get(e.vehicleId)!, category: categoryById.get(e.categoryId)!, partNumber: e.partNumber }), (linksByEntry.get(e.id) ?? []).sort()])).sort();
      const expected = normalized!.entries.map((e) => JSON.stringify([entryKey(e), [...e.services].sort()])).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Live compatibility/service contents differ from normalized sources");
      const actualVehicleKeys = new Set(vehicles.map(vehicleKey));
      const expectedVehicleKeys = new Set(normalized!.vehicles.map(vehicleKey));
      const orderVehicles = new Set(orders.map((o) => o.vehicleId));
      if (normalized!.vehicles.some((v) => !actualVehicleKeys.has(vehicleKey(v))) || vehicles.some((v) => !expectedVehicleKeys.has(vehicleKey(v)) && !orderVehicles.has(v.id))) throw new Error("Live vehicle directory differs from normalized sources and historical order vehicles");
      const hierarchyStart = performance.now();
      const makes = await prisma.vehicle.groupBy({ by: ["make"], where: { NOT: { model: "All" } }, orderBy: { make: "asc" } });
      const models = await prisma.vehicle.groupBy({ by: ["model"], where: { make: "Toyota", NOT: { model: "All" } }, orderBy: { model: "asc" } });
      const years = await prisma.vehicle.findMany({ where: { make: "Toyota", model: "CAMRY" }, select: { year: true }, orderBy: { year: "desc" } });
      if (!makes.length || !models.length || !years.length || new Set(years.map((y) => y.year)).size !== years.length) throw new Error("Dropdown hierarchy verification failed");
      const hierarchyRoundTripMs = Math.round(performance.now() - hierarchyStart);
      const plan = await prisma.$queryRaw`EXPLAIN (ANALYZE, FORMAT JSON) SELECT year FROM vehicles WHERE make = 'Toyota' AND model = 'CAMRY' ORDER BY year DESC`;
      const report = { mode, entries: entries.length, links: links.length, vehicles: vehicles.length, orders: orders.length, exactSourceMatch: true, makes: makes.length, toyotaModels: models.length, camryYears: years.length, hierarchyRoundTripMs, plan };
      writePrivate(path.join(runDir, "report.json"), report);
      console.log("Verified:", stringify(report));
      return;
    }
    if (mode === "--inspect") {
      const result = {
        vehicles: await prisma.vehicle.count(), entries: await prisma.compatibilityEntry.count(),
        links: await prisma.compatibilityService.count(), orders: await prisma.order.count(),
        matchedOrders: await prisma.order.count({ where: { matchedEntryId: { not: null } } }),
      };
      console.log(stringify(result));
      writePrivate(path.join(runDir, "report.json"), result);
      return;
    }
    const databaseStarted = performance.now();
    const result = await prisma.$transaction(async (tx) => {
      // Serialize import runs and block concurrent checkout/admin writes only
      // during the short replacement. Reads continue against the old snapshot.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(78392410)`;
      await tx.$executeRawUnsafe('LOCK TABLE "orders", "compatibility_services", "compatibility_entries", "vehicles" IN SHARE ROW EXCLUSIVE MODE');
      await tx.$executeRawUnsafe('LOCK TABLE "module_categories", "services" IN SHARE MODE');
      const categories = await tx.moduleCategory.findMany();
      const services = await tx.service.findMany();
      const categoryByName = new Map(categories.map((c) => [c.name, c.id]));
      const serviceByName = new Map(services.map((s) => [`${s.categoryId}:${s.name}`, s.id]));
      // Validate the entire live catalog mapping before any purge.
      for (const row of normalized?.entries ?? []) {
        const categoryId = categoryByName.get(row.category);
        if (!categoryId) throw new Error(`Missing category: ${row.category}`);
        for (const name of row.services) if (!serviceByName.has(`${categoryId}:${name}`)) throw new Error(`Missing service: ${row.category}/${name}`);
      }
      const oldVehicles = await tx.vehicle.findMany();
      const oldEntries = await tx.compatibilityEntry.findMany();
      const oldLinks = await tx.compatibilityService.findMany();
      // No customer contact data, credentials, or payment details in the backup.
      const orderRefs = await tx.order.findMany({ select: { id: true, vehicleId: true, matchedEntryId: true, serviceId: true } });
      const backupPath = path.join(runDir, "backup.json");
      writePrivate(backupPath, { createdAt: new Date().toISOString(), vehicles: oldVehicles, entries: oldEntries, links: oldLinks, orderRefs });
      console.log(`Backup saved. Replacing ${oldEntries.length} entries and ${oldLinks.length} links; preserving ${orderRefs.length} orders.`);

      const oldVehicleById = new Map(oldVehicles.map((v) => [v.id, v]));
      const oldCategoryById = new Map(categories.map((v) => [v.id, v.name]));
      const oldEntryByKey = new Map(oldEntries.map((e) => [entryKey({ ...oldVehicleById.get(e.vehicleId)!, category: oldCategoryById.get(e.categoryId)!, partNumber: e.partNumber }), e.id]));
      await tx.$executeRaw`UPDATE orders SET matched_entry_id = NULL WHERE matched_entry_id IS NOT NULL`;
      await tx.compatibilityService.deleteMany();
      await tx.compatibilityEntry.deleteMany();
      // Keep order-owned vehicles. Every other old row is replaced, removing
      // dirty names, old range expansions, and legacy sentinel containers.
      const deletedVehicles = await tx.vehicle.deleteMany({ where: { orders: { none: {} } } });
      if (!normalized) return { deletedEntries: oldEntries.length, deletedLinks: oldLinks.length, deletedVehicles: deletedVehicles.count, entries: 0, links: 0, preservedOrders: orderRefs.length, relinkedOrders: 0, detachedHistoricalMatches: orderRefs.filter((o) => o.matchedEntryId !== null).length };

      await batches(normalized.vehicles, (data) => tx.vehicle.createMany({ data, skipDuplicates: true }));
      let loadedVehicles = await tx.vehicle.findMany({ select: { id: true, make: true, model: true, year: true } });
      const vehicleByKey = new Map(loadedVehicles.map((v) => [vehicleKey(v), v.id]));
      // Historical orders may retain legacy spellings such as Camry vs CAMRY.
      // Merge only reviewed make aliases / casing into a real imported vehicle
      // with the same year; never fuzzy-match models or invent applicability.
      const expectedVehicleKeys = new Set(normalized.vehicles.map(vehicleKey));
      const historicalVehicles = new Set(orderRefs.map((o) => o.vehicleId));
      const vehicleAliases: { old_id: string; new_id: string }[] = [];
      for (const vehicle of loadedVehicles) {
        if (!historicalVehicles.has(vehicle.id)) continue;
        const make = coverageMake(vehicle.make), model = coverageName(vehicle.model);
        if (!make || !model) continue;
        const key = vehicleKey({ make, model, year: vehicle.year });
        const canonicalId = vehicleByKey.get(key);
        if (expectedVehicleKeys.has(key) && canonicalId && canonicalId !== vehicle.id) vehicleAliases.push({ old_id: String(vehicle.id), new_id: String(canonicalId) });
      }
      if (vehicleAliases.length) {
        await tx.$executeRaw`UPDATE orders AS o SET vehicle_id = x.new_id
          FROM jsonb_to_recordset(${JSON.stringify(vehicleAliases)}::jsonb)
          AS x(old_id bigint, new_id bigint) WHERE o.vehicle_id = x.old_id`;
        const aliasIds = vehicleAliases.map((v) => BigInt(v.old_id));
        await tx.vehicle.deleteMany({ where: { id: { in: aliasIds }, orders: { none: {} } } });
        loadedVehicles = loadedVehicles.filter((v) => !aliasIds.includes(v.id));
      }
      const entryData: Prisma.CompatibilityEntryCreateManyInput[] = normalized.entries.map((row) => ({
        id: oldEntryByKey.get(entryKey(row)),
        vehicleId: vehicleByKey.get(vehicleKey(row))!, categoryId: categoryByName.get(row.category)!,
        partNumber: row.partNumber, source: "import",
      }));
      const returned: { id: bigint; vehicleId: bigint; categoryId: bigint; partNumber: string }[] = [];
      await batches(entryData, async (data) => {
        returned.push(...await tx.compatibilityEntry.createManyAndReturn({ data, select: { id: true, vehicleId: true, categoryId: true, partNumber: true } }));
      });
      const keyForIds = (vehicleId: bigint, categoryId: bigint, partNumber: string) => `${vehicleId}:${categoryId}:${partNumber}`;
      const entryByIds = new Map(returned.map((e) => [keyForIds(e.vehicleId, e.categoryId, e.partNumber), e.id]));
      const links = normalized.entries.flatMap((row) => {
        const categoryId = categoryByName.get(row.category)!;
        const entryId = entryByIds.get(keyForIds(vehicleByKey.get(vehicleKey(row))!, categoryId, row.partNumber))!;
        return row.services.map((name) => ({ entryId, serviceId: serviceByName.get(`${categoryId}:${name}`)! }));
      });
      await batches(links, (data) => tx.compatibilityService.createMany({ data }));
      // Restore only identical surviving matches. Obsolete matches stay null;
      // all order details/prices/statuses remain unchanged and backup retains
      // the original relation. Never substitute an unrelated new entry ID.
      const survivingIds = new Set(returned.map((e) => e.id));
      const relink = orderRefs.filter((o) => o.matchedEntryId !== null && survivingIds.has(o.matchedEntryId));
      if (relink.length) {
        await tx.$executeRaw`UPDATE orders AS o SET matched_entry_id = x.entry_id
          FROM jsonb_to_recordset(${JSON.stringify(relink.map((o) => ({ order_id: String(o.id), entry_id: String(o.matchedEntryId) })))}::jsonb)
          AS x(order_id bigint, entry_id bigint) WHERE o.id = x.order_id`;
      }
      const actual = { entries: await tx.compatibilityEntry.count(), links: await tx.compatibilityService.count(), orders: await tx.order.count() };
      if (actual.entries !== normalized.entries.length || actual.links !== links.length || actual.orders !== orderRefs.length) throw new Error("Post-import row counts failed; rolling back");
      return { deletedEntries: oldEntries.length, deletedLinks: oldLinks.length, deletedVehicles: deletedVehicles.count + vehicleAliases.length, normalizedHistoricalVehicles: vehicleAliases.length, entries: actual.entries, links: actual.links, vehicles: loadedVehicles.length, preservedOrders: actual.orders, relinkedOrders: relink.length, detachedHistoricalMatches: orderRefs.filter((o) => o.matchedEntryId !== null).length - relink.length };
    }, { timeout: 180_000, maxWait: 20_000 });
    const databaseSeconds = Number(((performance.now() - databaseStarted) / 1000).toFixed(3));
    console.log(`Replacement committed in ${databaseSeconds}s. Orders preserved: ${result.preservedOrders}.`);
    // Refresh planner statistics after replacing most of the table contents.
    await prisma.$executeRawUnsafe("ANALYZE vehicles, compatibility_entries, compatibility_services");
    const report = { mode, batchSize: BATCH_SIZE, normalizationSeconds, databaseSeconds, inputDigest: normalized ? createHash("sha256").update(JSON.stringify({ workbooks: normalized.manifest, vehicleReferences: normalized.vehicleReferences })).digest("hex") : null, normalization: normalized?.summary, database: result };
    writePrivate(path.join(runDir, "report.json"), report);
    console.log("Committed:", stringify(report));
    console.log(`Reports and backup: ${runDir}`);
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => {
  // Prisma messages can embed connection strings. Report code and sanitized
  // text without exposing database credentials in console output.
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[database URL redacted]"));
  process.exitCode = 1;
});
