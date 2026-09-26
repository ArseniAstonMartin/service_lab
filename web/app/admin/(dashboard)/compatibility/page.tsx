import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ENTRY_SOURCE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { CompatibilityFilterBar } from "@/components/admin/compatibility-filter-bar";
import { CompatibilityTable, type CompatibilityEntryRow } from "@/components/admin/compatibility-table";
import { OrdersPagination } from "@/components/admin/orders-pagination";

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  make?: string;
  categoryId?: string;
  source?: string;
  page?: string;
};

/**
 * /admin/compatibility -- read-only, searchable compatibility database
 * (TASK-038). Same filters-live-in-the-URL / Server Component pattern as
 * /admin/orders (TASK-030): this page re-reads searchParams and re-runs
 * the Prisma query on every navigation, no client-side row state.
 */
export default async function AdminCompatibilityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const q = params.q?.trim() || undefined;
  const make = params.make?.trim() || undefined;
  const source = isValidSource(params.source) ? params.source : undefined;
  const page = parsePage(params.page);

  let categoryId: bigint | undefined;
  if (params.categoryId) {
    try {
      categoryId = BigInt(params.categoryId);
    } catch {
      // Ignore a malformed categoryId query param rather than 500 --
      // same defensive stance as an unrecognized `status` on
      // /admin/orders.
    }
  }

  const where = buildWhere({ q, make, categoryId, source });

  const [entries, total, categories, makeRows] = await Promise.all([
    prisma.compatibilityEntry.findMany({
      where,
      include: {
        vehicle: true,
        category: true,
        services: { include: { service: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.compatibilityEntry.count({ where }),
    prisma.moduleCategory.findMany({ orderBy: { name: "asc" } }),
    // Scoped to vehicles that actually have a compatibility entry, not
    // every Vehicle row -- a vehicle can exist purely from a
    // pending_review order with no entry yet, and that make shouldn't
    // show up as a filter option on this table.
    prisma.vehicle.findMany({
      where: { compatibilityEntries: { some: {} } },
      distinct: ["make"],
      select: { make: true },
      orderBy: { make: "asc" },
    }),
  ]);

  const rows: CompatibilityEntryRow[] = entries.map((entry) => ({
    id: entry.id.toString(),
    make: entry.vehicle.make,
    model: entry.vehicle.model,
    year: entry.vehicle.year,
    categoryName: entry.category.name,
    partNumber: entry.partNumber,
    services: entry.services.map((link) => ({
      id: link.service.id.toString(),
      name: link.service.name,
    })),
    source: entry.source,
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Compatibility</h1>
          <p className="text-muted-foreground">
            {total} entr{total === 1 ? "y" : "ies"} in the compatibility database.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/compatibility/import">Import Excel/CSV</Link>
        </Button>
      </div>

      <CompatibilityFilterBar
        makes={makeRows.map((row) => row.make)}
        categories={categories.map((category) => ({
          id: category.id.toString(),
          name: category.name,
        }))}
      />
      <CompatibilityTable entries={rows} />
      <OrdersPagination page={page} totalPages={totalPages} />
    </div>
  );
}

function isValidSource(value: string | undefined): value is keyof typeof ENTRY_SOURCE_LABELS {
  return !!value && value in ENTRY_SOURCE_LABELS;
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildWhere({
  q,
  make,
  categoryId,
  source,
}: {
  q?: string;
  make?: string;
  categoryId?: bigint;
  source?: keyof typeof ENTRY_SOURCE_LABELS;
}): Prisma.CompatibilityEntryWhereInput {
  const where: Prisma.CompatibilityEntryWhereInput = {};

  if (q) {
    where.partNumber = { contains: q, mode: "insensitive" };
  }
  if (make) {
    where.vehicle = { make };
  }
  if (categoryId !== undefined) {
    where.categoryId = categoryId;
  }
  if (source) {
    where.source = source;
  }

  return where;
}
