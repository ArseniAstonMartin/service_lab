import "server-only";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Thrown by requireAdmin() when there is no authenticated session.
 * Server Actions and Route Handlers should let this propagate (or catch
 * it to return a 401/redirect); it is never silently swallowed.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Admin session required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Guards an admin Server Action or Route Handler.
 *
 * Middleware (middleware.ts) already redirects unauthenticated PAGE
 * navigations away from /admin/*, but Server Actions and Route Handlers
 * are independently reachable HTTP endpoints — middleware's page-level
 * redirect does not protect them. Per TASK-045, every admin Server
 * Action and Route Handler must call requireAdmin() itself; this is the
 * one place that check is implemented.
 *
 * Returns the authenticated Supabase user, or throws UnauthorizedError.
 */
export async function requireAdmin(): Promise<User> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError();
  }

  return user;
}
