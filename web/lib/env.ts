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

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid/missing environment variables:\n${issues}\n\nCheck .env.example for the full list.`
    );
  }

  return parsed.data;
}

export const env = loadEnv();
