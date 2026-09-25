/**
 * Compatibility decision.
 *
 * Pure domain logic — no Prisma, Next.js or Stripe imports. Deliberately
 * uses minimal local types instead of Prisma's generated model types, so
 * this module has zero framework dependency and can be unit tested with
 * plain objects.
 */

/** A Prisma id (BigInt) or any other identifier shape callers use. */
export type EntityId = string | number | bigint;

export interface ServiceSummary {
  id: EntityId;
  name: string;
  priceCents: number;
}

export interface CompatibilityEntrySummary {
  id: EntityId;
}

export interface MatchResult {
  matched: boolean;
  entryId: EntityId | null;
  services: ServiceSummary[];
}

/**
 * Decides whether a compatibility check is a match.
 *
 * A match requires BOTH that the entry exists (the part number was found
 * for this vehicle/category) AND that it has at least one linked service.
 * An entry that exists but has zero linked services (the
 * "matched-part-but-nothing-confirmed" edge case seeded by TASK-007's
 * sample data) is treated the same as no entry at all: not matched, so
 * the order goes to pending_review for manual confirmation instead of
 * being silently accepted with no service to perform.
 */
export function decideMatch(
  entry: CompatibilityEntrySummary | null,
  services: ServiceSummary[],
): MatchResult {
  const matched = entry !== null && services.length > 0;

  return {
    matched,
    entryId: matched ? entry.id : null,
    services: matched ? services : [],
  };
}
