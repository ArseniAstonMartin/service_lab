import "server-only";
import * as Sentry from "@sentry/nextjs";

/**
 * TASK-045: the only thing we ever write about a caught error is its
 * `.message`. Logging the Error object itself (or unknown values) can
 * serialize request bodies, emails, tokens or Stripe/Resend payloads
 * into the host logs.
 */
export function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * ADD-SENTRY: every explicitly-caught server error in the app (Prisma
 * calls in lib/services/order-status.ts, Stripe calls in
 * lib/actions/payment.ts, the Stripe webhook route, Resend calls in
 * lib/email/send.ts, ...) already flows through this one function, so
 * this is the single place that forwards them to Sentry rather than
 * adding a captureException call at each site. Sentry gets the real
 * Error object (with its stack trace) -- the message-only restriction
 * above is about what this app's own host logs print, not about what
 * Sentry stores, which is expected to hold this level of detail for
 * debugging. `context` is attached as a tag so an issue in Sentry can be
 * filtered/grouped by which call site logged it.
 */
export function logServerError(context: string, error: unknown): void {
  console.error(context, safeErrorMessage(error));
  Sentry.captureException(error, { tags: { context } });
}
