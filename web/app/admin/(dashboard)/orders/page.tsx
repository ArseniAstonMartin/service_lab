import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STATUS_LABELS } from "@/lib/constants";
import type { OrderStatusValue } from "@/lib/domain/status";
import { OrdersFilterBar } from "@/components/admin/orders-filter-bar";
import { OrdersTable, type OrderRow } from "@/components/admin/orders-table";
import { OrdersPagination } from "@/components/admin/orders-pagination";

const PAGE_SIZE = 20;

type SearchParams = {
  status?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: string;
};

/**
 * /admin/orders -- filterable, paginated order list.
 *
 * Deliberately a plain Server Component with no explicit requireAdmin()
 * call: middleware.ts and the redirect-on-no-session check in
 * app/admin/(dashboard)/layout.tsx already guard every page navigation
 * under /admin/*. requireAdmin() is reserved for Server Actions and
 * Route Handlers, which are independently reachable and would otherwise
 * bypass those page-level guards.
 *
 * All filter/search/pagination state lives in the URL (see
 * OrdersFilterBar), so this component re-reads searchParams and re-runs
 * the Prisma query on every navigation rather than holding any state of
 * its own.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const status = isValidStatus(params.status) ? params.status : undefined;
  const q = params.q?.trim() || undefined;
  const page = parsePage(params.page);

  const where = buildWhere({ status, q, dateFrom: params.dateFrom, dateTo: params.dateTo });

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { vehicle: true, category: true, service: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where }),
  ]);

  const rows: OrderRow[] = orders.map((order) => ({
    id: order.id.toString(),
    vehicleLabel: `${order.vehicle.year} ${order.vehicle.make} ${order.vehicle.model}`,
    categoryName: order.category.name,
    serviceName: order.service?.name ?? null,
    customerEmail: order.customerEmail,
    status: order.status,
    totalAmountCents: order.totalAmountCents,
    createdAt: order.createdAt.toISOString(),
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Orders</h1>
        <p className="text-muted-foreground">
          {total} order{total === 1 ? "" : "s"}
        </p>
      </div>

      <OrdersFilterBar />
      <OrdersTable orders={rows} />
      <OrdersPagination page={page} totalPages={totalPages} />
    </div>
  );
}

function isValidStatus(value: string | undefined): value is OrderStatusValue {
  return !!value && value in STATUS_LABELS;
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * `q` matches customer email or the raw part number the customer typed in
 * (case-insensitively), plus an exact order-id match when the whole
 * search string is digits -- lets a support rep paste an order number
 * copied from an email straight into the search box.
 */
function buildWhere({
  status,
  q,
  dateFrom,
  dateTo,
}: {
  status?: OrderStatusValue;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  if (status) {
    where.status = status;
  }

  if (q) {
    const orConditions: Prisma.OrderWhereInput[] = [
      { customerEmail: { contains: q, mode: "insensitive" } },
      { partNumberEntered: { contains: q, mode: "insensitive" } },
    ];
    if (/^\d+$/.test(q)) {
      orConditions.push({ id: BigInt(q) });
    }
    where.OR = orConditions;
  }

  const createdAt: Prisma.DateTimeFilter = {};
  if (dateFrom) {
    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    if (!Number.isNaN(from.getTime())) {
      createdAt.gte = from;
    }
  }
  if (dateTo) {
    const to = new Date(`${dateTo}T23:59:59.999Z`);
    if (!Number.isNaN(to.getTime())) {
      createdAt.lte = to;
    }
  }
  if (createdAt.gte || createdAt.lte) {
    where.createdAt = createdAt;
  }

  return where;
}
