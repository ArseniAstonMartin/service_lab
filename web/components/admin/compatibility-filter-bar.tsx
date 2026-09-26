"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ENTRY_SOURCE_LABELS } from "@/lib/constants";

const SOURCE_OPTIONS = Object.entries(ENTRY_SOURCE_LABELS) as Array<
  [keyof typeof ENTRY_SOURCE_LABELS, string]
>;

/**
 * Filter controls for /admin/compatibility (TASK-038) -- same
 * URL-search-params-as-state approach as OrdersFilterBar
 * (components/admin/orders-filter-bar.tsx): every change writes to the
 * URL so the Server Component page re-queries Prisma, and the result
 * stays a shareable, bookmarkable, back-button-friendly link.
 */
export function CompatibilityFilterBar({
  makes,
  categories,
}: {
  makes: string[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Debounced, same as OrdersFilterBar's part-number/email search box --
  // updating the URL (and re-querying Prisma) on every keystroke would
  // be far too chatty.
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("q")]);

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    params.delete("page");
    startTransition(() => {
      router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
    });
  }

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (q === current) return;
    const timeout = setTimeout(() => updateParams({ q: q || undefined }), 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const make = searchParams.get("make") ?? "all";
  const categoryId = searchParams.get("categoryId") ?? "all";
  const source = searchParams.get("source") ?? "all";
  const hasFilters = Boolean(q || make !== "all" || categoryId !== "all" || source !== "all");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col gap-1">
        <label htmlFor="compat-search" className="text-xs font-medium text-muted-foreground">
          Part number
        </label>
        <Input
          id="compat-search"
          placeholder="Search part number"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="w-56"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Make</label>
        <Select
          value={make}
          onValueChange={(value) => updateParams({ make: value === "all" ? undefined : value })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All makes</SelectItem>
            {makes.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Category</label>
        <Select
          value={categoryId}
          onValueChange={(value) =>
            updateParams({ categoryId: value === "all" ? undefined : value })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Source</label>
        <Select
          value={source}
          onValueChange={(value) => updateParams({ source: value === "all" ? undefined : value })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {SOURCE_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            router.replace(pathname);
          }}
        >
          Clear filters
        </Button>
      ) : null}

      {isPending ? <span className="text-xs text-muted-foreground">Updating…</span> : null}
    </div>
  );
}
