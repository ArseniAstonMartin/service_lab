import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

/**
 * Shared shell for every authenticated admin page (everything under
 * /admin except /admin/login, which lives outside this route group so
 * it never gets wrapped by this guard — otherwise an unauthenticated
 * visit would redirect to /admin/login, re-render this same layout, and
 * redirect again).
 *
 * middleware.ts already redirects unauthenticated /admin/* page
 * navigations before they get here; this check is a second,
 * independent line of defense directly in the render path.
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  // Loaded server-side so the badge is correct on first paint (TASK-035);
  // a cheap count query, not the full review-queue list.
  const pendingReviewCount = await prisma.order.count({
    where: { status: "pending_review" },
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <AdminNav userEmail={user.email ?? null} pendingReviewCount={pendingReviewCount} />
      <main className="p-4 md:p-6">{children}</main>
    </div>
  );
}
