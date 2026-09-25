"use client";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. This MVP has no client-side
 * Supabase Auth UI (the login form posts to a Server Action instead), so
 * this is here for completeness / any future client-side auth-state need
 * (e.g. reacting to onAuthStateChange) rather than in active use yet.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
