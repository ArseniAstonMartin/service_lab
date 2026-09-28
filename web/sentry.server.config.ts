// ADD-SENTRY: Node runtime Sentry init (Server Actions, Route Handlers,
// Server Components, Prisma queries). Loaded by instrumentation.ts's
// register() when NEXT_RUNTIME === "nodejs" -- not imported directly
// anywhere else. Reads SENTRY_DSN straight from process.env rather than
// through lib/env.ts: that module treats every declared key as required
// once read (validateKey throws on a missing var), which is wrong for an
// optional integration that should simply stay off when unset.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
