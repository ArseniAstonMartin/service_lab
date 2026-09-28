// @sentry/nextjs v11 moved the build-time config helper to its own
// "/config" subpath (it isn't exported from the package root any more,
// which the older docs example still shows).
import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
/** const nextConfig = {}; */

/** export default nextConfig; */

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Предупреждение: это позволяет успешно завершить сборку, 
    // даже если есть ошибки ESLint.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Default Server Action body limit is 1MB, too small for a
    // spreadsheet-shaped compatibility import (TASK-039's
    // previewImport(file) passes the file straight through a Server
    // Action, not via a Vercel Blob token). Matches this file's own
    // MAX_FILE_SIZE_BYTES.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    // TASK-045: apply these on every response. frame-ancestors lives on
    // CSP (there is no standalone header for it); HSTS is ignored by
    // browsers on localhost and takes effect on the HTTPS production host.
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

// ADD-SENTRY: wraps the config so the build uploads source maps to
// Sentry (readable stack traces on captured errors) and injects the
// runtime instrumentation the config files above rely on. org/project/
// authToken come from Vercel env vars, not this file -- authToken is a
// secret and must never be committed; the upload step silently no-ops
// locally when it's unset (`silent: true` below only controls log
// output, not whether the step runs).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});