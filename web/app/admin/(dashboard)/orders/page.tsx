import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STATUS_LABELS } from "@/lib/constants";
import { ORDER_STATUSES, isPostPaymentStatus, type OrderStatusValue } from "@/lib/domain/status";
import { formatCents } from "@/lib/format";
import { OrdersFilterBar } from "@/components/admin/orders-filter-bar";
import { OrdersTable, type OrderRow } from "@/components/admin/orders-table";
import { OrdersPagination } from "@/components/admin/orders-pagination";

const PAGE_SIZE = 20;

// Orders in any of these statuses have actually been paid (Stripe has
// confirmed the checkout) -- the same rule isPostPaymentStatus() applies
// to a single order, reused here for the customer-history "total paid"
// summary (TASK-034).
const PAID_STATUSES = ORDER_STATUSES.filter(isPostPaymentStatus);

type SearchParams = {
  status?: string;
  q?: string;
  email?: string;
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
  const email = params.email?.trim() || undefined;
  const page = parsePage(params.page);

  const where = buildWhere({ status, q, email, dateFrom: params.dateFrom, dateTo: params.dateTo });

  const [orders, total, emailSummary] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { vehicle: true, category: true, service: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where }),
    // The customer-history summary (TASK-034) is intentionally scoped
    // to ONLY the email filter -- not status/date/q -- so it always
    // reads "this customer's whole history", regardless of whatever
    // else the admin has additionally filtered the table by below.
    email ? getEmailSummary(email) : null,
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
      {emailSummary ? (
        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <span className="font-medium">{email}</span> — {emailSummary.orderCount} order
          {emailSummary.orderCount === 1 ? "" : "s"}, {formatCents(emailSummary.totalPaidCents)} total paid
        </div>
      ) : null}
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
 * Order count and total paid for one customer email, independent of any
 * other filter on the page (TASK-034) -- see the call site's comment.
 * "Paid" means Stripe has actually confirmed the checkout
 * (payment_received or later, per isPostPaymentStatus); an
 * awaiting_payment order hasn't paid anything yet even though it has a
 * price snapshot.
 */
async function getEmailSummary(email: string): Promise<{ orderCount: number; totalPaidCents: number }> {
  const emailWhere: Prisma.OrderWhereInput = { customerEmail: { equals: email, mode: "insensitive" } };

  const [orderCount, paidAggregate] = await Promise.all([
    prisma.order.count({ where: emailWhere }),
    prisma.order.aggregate({
      where: { ...emailWhere, status: { in: PAID_STATUSES } },
      _sum: { totalAmountCents: true },
    }),
  ]);

  return { orderCount, totalPaidCents: paidAggregate._sum.totalAmountCents ?? 0 };
}

/**
 * `q` matches customer email or the raw part number the customer typed in
 * (case-insensitively), plus an exact order-id match when the whole
 * search string is digits -- lets a support rep paste an order number
 * copied from an email straight into the search box.
 *
 * `email`, in contrast, is an EXACT (case-insensitive) match -- the
 * customer-history link from the order detail page (TASK-034) uses this
 * instead of `q` so a customer whose email happens to be a substring of
 * another customer's doesn't pull in the wrong history.
 */
function buildWhere({
  status,
  q,
  email,
  dateFrom,
  dateTo,
}: {
  status?: OrderStatusValue;
  q?: string;
  email?: string;
  dateFrom?: string;
  dateTo?: string;
}): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  if (status) {
    where.status = status;
  }

  if (email) {
    where.customerEmail = { equals: email, mode: "insensitive" };
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
