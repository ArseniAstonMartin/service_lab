// ADD-SENTRY: Edge runtime Sentry init. Loaded by instrumentation.ts's
// register() when NEXT_RUNTIME === "edge" -- covers middleware.ts (the
// Supabase session-refresh/admin-gate middleware), the only Edge code in
// this app. Same DSN-resolution rationale as sentry.server.config.ts.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
