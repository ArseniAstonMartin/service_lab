import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Server Actions and Route
 * Handlers. Reads/writes auth cookies through Next's cookies() store.
 *
 * Server Components can't set cookies (Next throws if they try), so the
 * setAll call is wrapped in a try/catch: middleware.ts is what actually
 * refreshes the session cookie on every request, so a Server Component
 * calling this mid-render never needs to write cookies itself for the
 * session to stay valid.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — see doc comment above.
          }
        },
      },
    },
  );
}
