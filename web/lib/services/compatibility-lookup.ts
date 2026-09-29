import "server-only";

import { prisma } from "@/lib/db";
import { normalizePartNumber } from "@/lib/domain/part-number";
import { COVERAGE_SENTINEL_MODEL, COVERAGE_SENTINEL_YEAR } from "@/lib/domain/coverage";

const entryInclude = {
  services: {
    include: { service: { include: { priceTier: true } } },
  },
} as const;

export type CompatibilityLookupEntry = Awaited<
  ReturnType<typeof prisma.compatibilityEntry.findFirst<{ include: typeof entryInclude }>>
>;

export type CompatibilityLookup = {
  vehicle: { id: bigint } | null;
  entry: CompatibilityLookupEntry;
};

/**
 * Exact vehicle + category + part number first. If that misses, the same
 * category + part number in an explicit same-make brand-level container
 * can match. A record belonging to another vehicle/make never acts as a
 * wildcard. The container's year is an internal marker, not applicability.
 */
export async function lookupCompatibility(input: {
  make: string;
  model: string;
  year: number;
  categoryId: bigint;
  partNumber: string;
}): Promise<CompatibilityLookup> {
  const partNumber = normalizePartNumber(input.partNumber);

  const vehicle = await prisma.vehicle.findUnique({
    where: {
      make_model_year: {
        make: input.make,
        model: input.model,
        year: input.year,
      },
    },
  });

  if (vehicle) {
    const exact = await prisma.compatibilityEntry.findUnique({
      where: {
        vehicleId_categoryId_partNumber: {
          vehicleId: vehicle.id,
          categoryId: input.categoryId,
          partNumber,
        },
      },
      include: entryInclude,
    });
    if (exact) return { vehicle, entry: exact };
  }

  const fallback = await prisma.compatibilityEntry.findFirst({
    where: {
      categoryId: input.categoryId,
      partNumber,
      vehicle: { make: input.make, model: COVERAGE_SENTINEL_MODEL, year: COVERAGE_SENTINEL_YEAR },
      services: { some: {} },
    },
    include: entryInclude,
    orderBy: { id: "asc" },
  });

  return { vehicle, entry: fallback };
}

export function servicesFromEntry(entry: NonNullable<CompatibilityLookupEntry>) {
  return entry.services.map((link) => ({
    id: link.service.id.toString(),
    name: link.service.name,
    priceCents: link.service.priceTier.amountCents,
  }));
}
