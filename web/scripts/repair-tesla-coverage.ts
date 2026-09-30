import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { normalizeCoverage, entryKey, vehicleKey } from "./coverage/normalize";
import { ensureTeslaBatteryCatalog } from "../prisma/tesla-battery-catalog";
import { BATTERY_CATEGORY, COVERAGE_SENTINEL_MODEL, TESLA_BATTERY_SERVICE } from "../lib/domain/coverage";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const priceArgument = args.find((arg) => arg.startsWith("--price-cents="));
const priceCents = priceArgument ? Number(priceArgument.split("=")[1]) : undefined;
const json = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? String(v) : v, 2);
const orderFields = { id: true, vehicleId: true, categoryId: true, serviceId: true, status: true, servicePriceCents: true, returnShippingFeeCents: true, totalAmountCents: true } as const;

async function main() {
  if (args.some((arg) => arg !== "--apply" && arg !== "--dry-run" && !/^--price-cents=\d+$/.test(arg)) || (apply && args.includes("--dry-run"))) throw new Error("Usage: repair-tesla-coverage.ts [--dry-run|--apply] [--price-cents=<approved amount>]");
  const normalized = normalizeCoverage(path.resolve(webRoot, "../coverage_sources"), new Date().getUTCFullYear());
  const entries = normalized.entries.filter((row) => row.make === "Tesla");
  const vehicles = normalized.vehicles.filter((row) => row.make === "Tesla");
  const summary = {
    publicVehicles: vehicles.filter((v) => v.model !== COVERAGE_SENTINEL_MODEL).length,
    models: [...new Set(vehicles.filter((v) => v.model !== COVERAGE_SENTINEL_MODEL).map((v) => v.model))],
    entries: entries.length,
    byCategory: Object.fromEntries([...new Set(entries.map((e) => e.category))].map((category) => [category, entries.filter((e) => e.category === category).length])),
    batteryParts: entries.filter((e) => e.services.includes(TESLA_BATTERY_SERVICE)).map((e) => e.partNumber),
    reviewOnly: entries.filter((e) => !e.services.length).map((e) => ({ partNumber: e.partNumber, category: e.category })),
    quarantined: normalized.issues.filter((issue) => issue.values.some((cell) => String(cell).toUpperCase() === "TESLA")).map(({ file, row, reason }) => ({ file, row, reason })),
  };
  console.log(json(summary));
  if (!summary.publicVehicles || !summary.batteryParts.length) throw new Error("Refusing incomplete Tesla normalization");
  if (!apply) return;
  loadEnvConfig(webRoot);
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });
  const runDir = path.join(webRoot, "data/coverage-import", `tesla-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) => fs.writeFileSync(path.join(runDir, name), json(value) + "\n", { mode: 0o600, flag: "wx" });
  save("normalized.json", { entries, vehicles, summary, vehicleReferences: normalized.vehicleReferences });
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(78392410)`;
      await tx.$executeRawUnsafe('LOCK TABLE "orders", "compatibility_entries", "compatibility_services", "vehicles", "module_categories", "services", "price_tiers", "question_definitions" IN SHARE ROW EXCLUSIVE MODE');
      const oldEntries = await tx.compatibilityEntry.findMany({ where: { vehicle: { make: "Tesla" } }, include: { vehicle: true, category: true, services: true } });
      const ordersBefore = await tx.order.findMany({ select: { ...orderFields, matchedEntryId: true }, orderBy: { id: "asc" } });
      const unrelatedCount = await tx.compatibilityEntry.count({ where: { vehicle: { make: { not: "Tesla" } } } });
      save("backup.json", {
        entries: oldEntries,
        vehicles: await tx.vehicle.findMany({ where: { make: "Tesla" } }),
        categories: await tx.moduleCategory.findMany(),
        services: await tx.service.findMany(),
        tiers: await tx.priceTier.findMany(),
        questions: await tx.questionDefinition.findMany({ where: { questionSetCode: "BATTERY_RESET" } }),
        orderRefs: ordersBefore,
      });
      await ensureTeslaBatteryCatalog(tx, priceCents);
      const categories = await tx.moduleCategory.findMany();
      const categoryByName = new Map(categories.map((c) => [c.name, c.id]));
      const services = await tx.service.findMany();
      const serviceByName = new Map(services.map((s) => [`${s.categoryId}:${s.name}`, s.id]));
      for (const row of entries) {
        if (!categoryByName.has(row.category)) throw new Error(`Missing category: ${row.category}`);
        for (const name of row.services) if (!serviceByName.has(`${categoryByName.get(row.category)}:${name}`)) throw new Error(`Missing service: ${name}`);
      }
      await tx.vehicle.createMany({ data: vehicles, skipDuplicates: true });
      const storedVehicles = await tx.vehicle.findMany({ where: { make: "Tesla" } });
      const vehicleIds = new Map(storedVehicles.map((v) => [vehicleKey(v), v.id]));
      await tx.compatibilityEntry.createMany({ data: entries.map((row) => ({ vehicleId: vehicleIds.get(vehicleKey(row))!, categoryId: categoryByName.get(row.category)!, partNumber: row.partNumber, source: "import" as const })), skipDuplicates: true });
      const storedEntries = await tx.compatibilityEntry.findMany({ where: { vehicle: { make: "Tesla" } }, include: { vehicle: true, category: true } });
      const byKey = new Map(storedEntries.map((e) => [entryKey({ ...e.vehicle, category: e.category.name, partNumber: e.partNumber }), e]));
      const expectedKeys = new Set(entries.map(entryKey));
      const stale = oldEntries.filter((e) => e.source === "import" && !expectedKeys.has(entryKey({ ...e.vehicle, category: e.category.name, partNumber: e.partNumber })));
      const writable = entries.filter((row) => byKey.get(entryKey(row))!.source === "import");
      const touchedIds = [...writable.map((row) => byKey.get(entryKey(row))!.id), ...stale.map((e) => e.id)];
      await tx.compatibilityService.deleteMany({ where: { entryId: { in: touchedIds } } });
      const links = writable.flatMap((row) => row.services.map((name) => ({ entryId: byKey.get(entryKey(row))!.id, serviceId: serviceByName.get(`${categoryByName.get(row.category)}:${name}`)! })));
      await tx.compatibilityService.createMany({ data: links, skipDuplicates: true });
      // Relink only a source-proven equivalent OEM number in the SAME category
      // with the historical service still supported. Never change an order's
      // category, selected service, status, price or vehicle.
      let relinked = 0, detached = 0;
      for (const old of stale) {
        const equivalent = entries.find((row) => row.category === old.category.name && row.origins.some((origin) => origin.rawPart.trim().toUpperCase() === old.partNumber));
        for (const order of ordersBefore.filter((o) => o.matchedEntryId === old.id)) {
          const supported = equivalent && equivalent.services.some((name) => serviceByName.get(`${old.categoryId}:${name}`) === order.serviceId);
          const matchedEntryId = supported ? byKey.get(entryKey(equivalent!))!.id : null;
          await tx.order.update({ where: { id: order.id }, data: { matchedEntryId } });
          if (matchedEntryId) relinked++; else detached++;
        }
      }
      await tx.compatibilityEntry.deleteMany({ where: { id: { in: stale.map((e) => e.id) } } });
      const ordersAfter = await tx.order.findMany({ select: orderFields, orderBy: { id: "asc" } });
      if (json(ordersAfter) !== json(ordersBefore.map(({ matchedEntryId: _match, ...rest }) => rest))) throw new Error("Historical order state changed; rolling back");
      if (await tx.compatibilityEntry.count({ where: { vehicle: { make: { not: "Tesla" } } } }) !== unrelatedCount) throw new Error("Unrelated coverage changed; rolling back");
      const verifiedEntries = await tx.compatibilityEntry.findMany({ where: { id: { in: writable.map((row) => byKey.get(entryKey(row))!.id) } }, include: { services: { include: { service: true } } } });
      const verifiedById = new Map(verifiedEntries.map((e) => [e.id, e]));
      for (const row of writable) {
        const stored = verifiedById.get(byKey.get(entryKey(row))!.id)!;
        if (json(stored.services.map((s) => s.service.name).sort()) !== json([...row.services].sort())) throw new Error(`Service verification failed for ${row.partNumber}`);
      }
      const battery = await tx.service.findFirstOrThrow({ where: { name: TESLA_BATTERY_SERVICE, category: { name: BATTERY_CATEGORY } }, include: { priceTier: true } });
      return { ...summary, preservedOrders: ordersAfter.length, removedStaleImportedEntries: stale.length, relinkedOrderReferences: relinked, detachedOrderReferences: detached, batteryPriceCents: battery.priceTier.amountCents, quoteRequired: battery.priceTier.amountCents <= 0, untouchedNonTeslaEntries: unrelatedCount };
    }, { timeout: 180_000, maxWait: 20_000 });
    save("report.json", result);
    console.log(`Committed Tesla repair. Backup and report: ${runDir}\n${json(result)}`);
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[database URL redacted]"));
  process.exitCode = 1;
});
