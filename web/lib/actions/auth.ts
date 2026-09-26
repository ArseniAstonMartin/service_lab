"use server";

import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Signs in with email/password and redirects to the admin home on
 * success. Supabase public sign-ups are disabled for this project (see
 * README "Admin authentication") — there is deliberately no sign-up
 * action here; the only way to get a session is to already have an
 * account, created by hand in the Supabase dashboard.
 */
export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Never echo the Supabase error (or the submitted email) back to
    // the URL — TASK-045. A generic message is enough for the admin.
    redirect("/admin/login?error=invalid");
  }

  redirect("/admin");
}

/** Signs out the current session and returns to the login page. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
