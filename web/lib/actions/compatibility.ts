"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePartNumber } from "@/lib/domain/part-number";
import { decideMatch, type MatchResult } from "@/lib/domain/compatibility";
import { isVercelBlobUrl } from "@/lib/blob";

const checkCompatibilitySchema = z.object({
  vehicle: z.object({
    make: z.string().min(1),
    model: z.string().min(1),
    year: z.number().int(),
  }),
  categoryId: z.string().min(1),
  partNumber: z.string().min(1),
  // Required (PRD 4.2: "Photo upload (required) of the module's
  // label"), but validated here rather than trusted: the client could
  // still submit a non-Blob string, so isVercelBlobUrl() below is what
  // actually decides whether it's accepted.
  stickerPhotoUrl: z.string().min(1),
});

export type CheckCompatibilityInput = z.infer<typeof checkCompatibilitySchema>;

/**
 * The single source of truth for whether a vehicle/category/part-number
 * combination is a known, confirmed-supported compatibility match.
 *
 * Never trusts anything the client computed — there is no "matched"
 * flag in the input at all. Every call re-derives the answer from a
 * live Prisma lookup (exact part-number match only, per
 * normalizePartNumber's no-fuzzy-matching contract) and
 * /lib/domain/compatibility's decideMatch(), which also folds in the
 * "entry exists but has zero linked services" edge case as not matched.
 */
export async function checkCompatibility(input: CheckCompatibilityInput): Promise<MatchResult> {
  const parsed = checkCompatibilitySchema.parse(input);

  if (!isVercelBlobUrl(parsed.stickerPhotoUrl)) {
    throw new Error("stickerPhotoUrl must be a Vercel Blob URL");
  }

  let categoryId: bigint;
  try {
    categoryId = BigInt(parsed.categoryId);
  } catch {
    throw new Error("Invalid categoryId");
  }

  const normalizedPartNumber = normalizePartNumber(parsed.partNumber);

  const vehicle = await prisma.vehicle.findUnique({
    where: {
      make_model_year: {
        make: parsed.vehicle.make,
        model: parsed.vehicle.model,
        year: parsed.vehicle.year,
      },
    },
  });

  // No matching vehicle row at all (shouldn't normally happen — the
  // wizard only ever offers makes/models/years that exist — but never
  // silently guesses: treat it exactly like "no compatibility entry".
  if (!vehicle) {
    return decideMatch(null, []);
  }

  const entry = await prisma.compatibilityEntry.findUnique({
    where: {
      vehicleId_categoryId_partNumber: {
        vehicleId: vehicle.id,
        categoryId,
        partNumber: normalizedPartNumber,
      },
    },
    include: {
      services: {
        include: {
          service: { include: { priceTier: true } },
        },
      },
    },
  });

  if (!entry) {
    return decideMatch(null, []);
  }

  const services = entry.services.map((link) => ({
    id: link.service.id.toString(),
    name: link.service.name,
    priceCents: link.service.priceTier.amountCents,
  }));

  return decideMatch({ id: entry.id.toString() }, services);
}
