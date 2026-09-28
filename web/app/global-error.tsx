"use client";

// ADD-SENTRY: Next.js App Router only reports an error thrown while
// rendering the root layout (or below it, once it escapes every nested
// error.tsx boundary) by rendering this file, if it exists -- it's the
// one client-side crash instrumentation.ts's onRequestError can't see,
// since nothing server-side ever threw.
import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* NextError is the framework's minimal built-in error page --
            this file replaces the entire root layout, so there is no
            other UI (Tailwind, Toaster, etc.) available to render here. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
