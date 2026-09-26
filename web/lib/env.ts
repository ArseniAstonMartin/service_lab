import "server-only";
import { z } from "zod";

/**
 * Typed, fail-fast server environment configuration.
 * Every server-only env var used anywhere in the app must be declared
 * here and read through this module — never via raw process.env.
 */
const envSchema = z.object({
  // Database (Supabase Postgres via Prisma) — added in TASK-002
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Vercel Blob
  BLOB_READ_WRITE_TOKEN: z.string().min(1),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // Resend
  RESEND_API_KEY: z.string().min(1),
  ADMIN_NOTIFICATION_EMAIL: z.string().email(),

  // Site
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

type EnvKey = keyof Env;

/**
 * "Fail fast" originally meant "throw the moment this module is
 * imported" (see TASK-001). That collided with how `next build`
 * actually works: Next evaluates every route module's top-level code
 * during "Collecting page data" to introspect its exports, even for a
 * route nobody is exercising in that build. Any import chain that
 * touched this file — even just to read one already-configured var —
 * ran validation for EVERY declared var, so a feature that hasn't been
 * wired up yet (and genuinely has no key yet, e.g. Resend before any
 * task sends an email) failed the whole production build.
 *
 * This keeps the same schema and the same "throw with a clear message"
 * behavior, but validates one key at a time, on first access, instead
 * of all of them at import time. A var that's actually read by code
 * that's actually running (e.g. STRIPE_SECRET_KEY, read inside
 * lib/stripe.ts's lazily-constructed client) still fails immediately
 * and loudly the moment it's needed — it just no longer fails a build
 * that never needed it in the first place. A var nothing reads yet
 * (RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, BLOB_READ_WRITE_TOKEN as
 * of this writing) is simply never validated until some code starts
 * reading it, which is the point at which it needs to actually be set.
 */
function validateKey<K extends EnvKey>(key: K): Env[K] {
  const shape = envSchema.shape as Record<EnvKey, z.ZodTypeAny>;
  const result = shape[key].safeParse(process.env[key]);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${key}${issue.path.length ? "." + issue.path.join(".") : ""}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid/missing environment variable:\n${issues}\n\nCheck .env.example for the full list.`
    );
  }

  return result.data as Env[K];
}

const cache = new Map<EnvKey, unknown>();

export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    const key = prop as EnvKey;
    if (!(key in envSchema.shape)) {
      return undefined;
    }
    if (!cache.has(key)) {
      cache.set(key, validateKey(key));
    }
    return cache.get(key);
  },
}) as Env;
