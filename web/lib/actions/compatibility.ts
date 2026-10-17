"use server";

import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { decideMatch, type MatchResult } from "@/lib/domain/compatibility";
import { lookupCompatibility, servicesFromEntry } from "@/lib/services/compatibility-lookup";

const checkCompatibilitySchema = z.object({
  vehicle: z.object({
    make: z.string().min(1),
    model: z.string().min(1),
    year: z.number().int(),
  }),
  categoryId: z.string().min(1),
  // Required for an ordinary part-number category, but NOT sent at all
  // for a category like Vehicle Diagnostics (ModuleCategory.requiresPartNumber
  // false) -- the wizard never shows that field for one. Enforced below,
  // after the category's own requiresPartNumber is looked up, not in
  // this shape (a fixed zod shape can't make a field conditionally
  // required on a value that isn't known until a query runs).
  //
  // No stickerPhotoUrl here: a photo was never part of the lookup below
  // (it only ever checks vehicle + category + partNumber) -- it's only
  // required later, at placeOrder time, and only when the part number
  // couldn't be auto-matched (so a human has something to verify
  // against). Collecting it this early, before a customer even knows
  // whether it'll be needed, was the whole thing being fixed here.
  partNumber: z.string().optional(),
});

export type CheckCompatibilityInput = z.infer<typeof checkCompatibilitySchema>;

/**
 * Client-facing shape of a compatibility check result. Deliberately
 * distinct from /lib/domain/compatibility's MatchResult: that domain
 * type's entryId/service.id are typed as the wide EntityId
 * (string | number | bigint) so the pure domain layer stays agnostic
 * of how ids are represented, but everything crossing the Server
 * Action boundary to the client (and into wizard state / sessionStorage,
 * see lib/wizard/types.ts's WizardMatchResult) must be a plain string —
 * the same stringify-at-the-boundary convention TASK-017 established
 * for categoryId. Structurally identical to WizardMatchResult, kept as
 * its own type here (rather than importing that client type into a
 * Server Action module) so this module has no dependency on wizard
 * state's shape.
 */
export type CompatibilityMatchResult = {
  matched: boolean;
  entryId: string | null;
  services: { id: string; name: string; priceCents: number | null }[];
};

function toClientMatchResult(result: MatchResult): CompatibilityMatchResult {
  return {
    matched: result.matched,
    entryId: result.entryId === null ? null : String(result.entryId),
    services: result.services.map((service) => ({
      id: String(service.id),
      name: service.name,
      priceCents: service.priceCents,
    })),
  };
}

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
export async function checkCompatibility(
  input: CheckCompatibilityInput,
): Promise<CompatibilityMatchResult> {
  const parsed = checkCompatibilitySchema.parse(input);

  let categoryId: bigint;
  try {
    categoryId = BigInt(parsed.categoryId);
  } catch {
    throw new Error("Invalid categoryId");
  }

  // Category and the ordinary vehicle/part-number lookup run in
  // parallel rather than sequentially -- requiresPartNumber isn't known
  // until the category query resolves, but the overwhelming majority of
  // categories need it, so the lookup is started speculatively (a
  // partNumber was at least submitted) and simply discarded in the rare
  // case it turns out not to apply. Keeps this at roughly the same
  // latency it had before ModuleCategory.requiresPartNumber existed,
  // instead of adding a second sequential round trip to every check.
  const [category, speculativeLookup] = await Promise.all([
    prisma.moduleCategory.findUnique({ where: { id: categoryId } }),
    parsed.partNumber?.trim()
      ? lookupCompatibility({
          make: parsed.vehicle.make,
          model: parsed.vehicle.model,
          year: parsed.vehicle.year,
          categoryId,
          partNumber: parsed.partNumber,
        })
      : null,
  ]);

  if (!category) {
    throw new Error("Invalid categoryId");
  }

  // Vehicle Diagnostics (and any future category like it): no part
  // number or CompatibilityEntry involved at all -- this category
  // always resolves to its own one Service, for any vehicle. entryId is
  // null (never a real CompatibilityEntry id) -- placeOrder checks for
  // that explicitly and stores Order.matchedEntryId as null too.
  if (!category.requiresPartNumber) {
    const services = await prisma.service.findMany({
      where: { categoryId },
      include: { priceTier: true },
    });
    const matched = services.length > 0;
    return {
      matched,
      entryId: null,
      services: matched
        ? services.map((service) => ({
            id: service.id.toString(),
            name: service.name,
            priceCents: service.priceTier.amountCents > 0 ? service.priceTier.amountCents : null,
          }))
        : [],
    };
  }

  if (!parsed.partNumber?.trim()) {
    throw new Error("partNumber is required for this category");
  }

  // speculativeLookup is only null here if partNumber was somehow empty
  // after all -- already rejected just above.
  const { vehicle, entry } = speculativeLookup!;

  // No matching vehicle row at all (shouldn't normally happen — the
  // wizard only ever offers makes/models/years that exist — but never
  // silently guesses: treat it exactly like "no compatibility entry".
  if (!vehicle) {
    return toClientMatchResult(decideMatch(null, []));
  }

  if (!entry) {
    return toClientMatchResult(decideMatch(null, []));
  }

  return toClientMatchResult(decideMatch({ id: entry.id.toString() }, servicesFromEntry(entry)));
}
