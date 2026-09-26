"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/review-queue", label: "Review Queue" },
  { href: "/admin/compatibility", label: "Compatibility" },
  { href: "/admin/pricing", label: "Pricing" },
];

function NavLinks({
  onNavigate,
  className,
  pendingReviewCount,
}: {
  onNavigate?: () => void;
  className?: string;
  pendingReviewCount: number;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-1 md:flex-row md:items-center md:gap-1", className)}>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
            {item.href === "/admin/review-queue" && pendingReviewCount > 0 ? (
              <Badge
                variant="outline"
                className="border-none bg-amber-500 px-1.5 py-0 text-xs text-white"
              >
                {pendingReviewCount}
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Top nav for the admin panel. Horizontal links on desktop; a toggled
 * off-canvas panel on mobile (no shadcn Sheet component is installed
 * yet, so this is a small hand-rolled collapsible instead of pulling
 * one in for a single use).
 */
export function AdminNav({
  userEmail,
  pendingReviewCount,
}: {
  userEmail: string | null;
  pendingReviewCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b bg-background">
      <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-6 overflow-hidden">
          <Link href="/admin" className="shrink-0 font-semibold">
            ECU Service Lab
          </Link>
          <NavLinks className="hidden md:flex" pendingReviewCount={pendingReviewCount} />
        </div>

        <div className="flex items-center gap-3">
          {userEmail ? (
            <span className="hidden max-w-[16rem] truncate text-sm text-muted-foreground sm:inline">
              {userEmail}
            </span>
          ) : null}
          <form action={signOut} className="hidden md:block">
            <Button type="submit" variant="outline" size="sm">
              Log out
            </Button>
          </form>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="md:hidden"
            aria-expanded={open}
            aria-controls="admin-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Menu"}
          </Button>
        </div>
      </div>

      {open ? (
        <div id="admin-mobile-nav" className="border-t px-4 py-3 md:hidden">
          <NavLinks onNavigate={() => setOpen(false)} pendingReviewCount={pendingReviewCount} />
          <form action={signOut} className="mt-3">
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Log out
            </Button>
          </form>
        </div>
      ) : null}
    </header>
  );
}
