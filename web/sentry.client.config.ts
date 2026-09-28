// ADD-SENTRY: browser-side Sentry init. Next.js (App Router, < 15.3) loads
// this file automatically via the Sentry webpack plugin configured in
// next.config.mjs — nothing imports it directly. Reads
// NEXT_PUBLIC_SENTRY_DSN straight from process.env rather than through
// lib/env.ts: that module is "server-only" and this file runs in the
// browser bundle.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Disables the SDK entirely (no init, no network calls) rather than
  // initializing with an empty DSN when it isn't set, e.g. a local dev
  // environment that hasn't been given one.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  // Low sample rate: this is an internal wizard/admin tool, not a
  // high-traffic app, and full tracing on every page load isn't needed
  // to catch crashes -- captureException calls (uncaught errors, plus
  // the manual ones in lib/log.ts) are always sent regardless of this.
  tracesSampleRate: 0.1,
  // No Session Replay: the wizard collects customer PII (name, email,
  // phone, return address) in plain form fields, and replay would record
  // it into Sentry by default.
});
