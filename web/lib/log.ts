import "server-only";

/**
 * TASK-045: the only thing we ever write about a caught error is its
 * `.message`. Logging the Error object itself (or unknown values) can
 * serialize request bodies, emails, tokens or Stripe/Resend payloads
 * into the host logs.
 */
export function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function logServerError(context: string, error: unknown): void {
  console.error(context, safeErrorMessage(error));
}
