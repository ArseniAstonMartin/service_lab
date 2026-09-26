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
import { STATUS_LABELS } from "@/lib/constants";
import type { OrderStatusValue } from "@/lib/domain/status";

const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as Array<[OrderStatusValue, string]>;

/**
 * Filter controls for /admin/orders. Every change updates the URL's own
 * search params -- never local-only component state -- so the Server
 * Component page (app/admin/(dashboard)/orders/page.tsx) re-queries
 * Prisma with the new filters on the next render, and the resulting URL
 * stays shareable, bookmarkable, and works with the browser back button.
 *
 * Changing any filter besides the page number itself resets `page` back
 * to unset (page 1): landing on "page 3" of a query that has since
 * changed would show a confusing, likely-empty result otherwise.
 */
export function OrdersFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // The search box is the one control that needs local, debounced state
  // -- updating the URL on every keystroke would re-query Prisma far
  // too often. Every other control (status, dates) writes to the URL
  // immediately since those are discrete, infrequent choices.
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
    // Only reacts to the URL's own q param changing (e.g. Clear filters,
    // browser back/forward) -- not to local typing, which is handled by
    // the debounce effect below.
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

  const status = searchParams.get("status") ?? "all";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const hasFilters = Boolean(status !== "all" || q || dateFrom || dateTo);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col gap-1">
        <label htmlFor="orders-search" className="text-xs font-medium text-muted-foreground">
          Search
        </label>
        <Input
          id="orders-search"
          placeholder="Order #, email, or part number"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="w-64"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Status</label>
        <Select
          value={status}
          onValueChange={(value) => updateParams({ status: value === "all" ? undefined : value })}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="orders-date-from" className="text-xs font-medium text-muted-foreground">
          From
        </label>
        {/* Keyed by the URL's own value so a Clear filters click (which
            only touches the URL) also visibly resets these otherwise
            uncontrolled native date inputs. */}
        <Input
          key={`from-${dateFrom}`}
          id="orders-date-from"
          type="date"
          defaultValue={dateFrom}
          onChange={(event) => updateParams({ dateFrom: event.target.value || undefined })}
          className="w-40"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="orders-date-to" className="text-xs font-medium text-muted-foreground">
          To
        </label>
        <Input
          key={`to-${dateTo}`}
          id="orders-date-to"
          type="date"
          defaultValue={dateTo}
          onChange={(event) => updateParams({ dateTo: event.target.value || undefined })}
          className="w-40"
        />
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
