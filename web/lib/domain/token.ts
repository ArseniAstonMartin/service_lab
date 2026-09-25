/**
 * Tracking token generation.
 *
 * Pure domain logic — no Prisma, Next.js or Stripe imports. Uses Node's
 * built-in `crypto` module (standard library, not a framework), matching
 * TASK-009's constraint.
 */
import { randomBytes } from "node:crypto";

/**
 * Generates a URL-safe, unguessable tracking token from 32 random bytes
 * (256 bits), base64url-encoded (RFC 4648 §5 — no `+`, `/` or padding, so
 * it drops straight into a URL path segment with no escaping).
 */
export function generateTrackingToken(): string {
  return randomBytes(32).toString("base64url");
}
