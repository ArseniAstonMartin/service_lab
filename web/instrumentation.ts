// ADD-SENTRY: Next.js instrumentation hook (stable since Next 15, no
// experimental flag needed). register() runs once per runtime the
// server process starts, and is how the two runtime-specific Sentry
// configs (sentry.server.config.ts, sentry.edge.config.ts) actually get
// initialized -- neither is imported anywhere else.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports an error thrown while Next.js is rendering a Server Component,
// running a Server Action, or handling a Route Handler request -- the
// framework-level hook, so this fires even for an error nothing in the
// app explicitly caught and passed to lib/log.ts's logServerError.
export const onRequestError = Sentry.captureRequestError;
