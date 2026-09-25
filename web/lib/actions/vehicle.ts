"use server";

import { prisma } from "@/lib/db";

/**
 * Cascading Make → Model → Year lookups for /order/vehicle. Every level
 * is filtered to vehicles with at least one compatibility entry — a
 * customer should never be offered a make/model/year combination that
 * can't possibly match anything, since that would always funnel them
 * into manual review.
 */

export async function getMakes(): Promise<string[]> {
  const rows = await prisma.vehicle.findMany({
    where: { compatibilityEntries: { some: {} } },
    select: { make: true },
    distinct: ["make"],
    orderBy: { make: "asc" },
  });

  return rows.map((row) => row.make);
}

export async function getModels(make: string): Promise<string[]> {
  if (!make) return [];

  const rows = await prisma.vehicle.findMany({
    where: { make, compatibilityEntries: { some: {} } },
    select: { model: true },
    distinct: ["model"],
    orderBy: { model: "asc" },
  });

  return rows.map((row) => row.model);
}

export async function getYears(make: string, model: string): Promise<number[]> {
  if (!make || !model) return [];

  const rows = await prisma.vehicle.findMany({
    where: { make, model, compatibilityEntries: { some: {} } },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });

  return rows.map((row) => row.year);
}
