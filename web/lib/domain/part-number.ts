/**
 * Part number normalization.
 *
 * Pure domain logic — no Prisma, Next.js or Stripe imports.
 */

/**
 * Normalizes a part number for exact-match lookup: trims surrounding
 * whitespace and uppercases it. This is deliberately the ONLY
 * normalization applied — there is never fuzzy matching, so a part number
 * that differs by so much as a stray character or an omitted dash is
 * treated as "not found," which routes the order into manual admin
 * review (see decideMatch in ./compatibility) rather than risking a wrong
 * automatic match.
 */
export function normalizePartNumber(raw: string): string {
  return raw.trim().toUpperCase();
}
