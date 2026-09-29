"use server";

import "server-only";
import { prisma } from "@/lib/db";
import { COVERAGE_SENTINEL_MODEL } from "@/lib/domain/coverage";

const publicVehicleWhere = {
  NOT: { model: COVERAGE_SENTINEL_MODEL },
} as const;

/**
 * Cascading Make → Model → Year lookups for /order/vehicle.
 * Brand-level sentinel rows (model "All") from coverage_sources are
 * hidden — customers pick a real model/year; part-number fallback still
 * matches programmer-dump entries stored on those sentinels.
 */

export async function getMakes(): Promise<string[]> {
  const rows = await prisma.vehicle.groupBy({
    by: ["make"],
    where: publicVehicleWhere,
    orderBy: { make: "asc" },
  });

  return rows.map((row) => row.make);
}

export async function getModels(make: string): Promise<string[]> {
  if (!make) return [];

  const rows = await prisma.vehicle.groupBy({
    by: ["model"],
    where: { make, ...publicVehicleWhere },
    orderBy: { model: "asc" },
  });

  return rows.map((row) => row.model);
}

export async function getYears(make: string, model: string): Promise<number[]> {
  if (!make || !model) return [];

  const rows = await prisma.vehicle.findMany({
    where: { make, model, ...publicVehicleWhere },
    select: { year: true },
    orderBy: { year: "desc" },
  });

  return rows.map((row) => row.year);
}
