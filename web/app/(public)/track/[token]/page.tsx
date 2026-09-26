import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/format";
import { isPostPaymentStatus } from "@/lib/domain/status";
import { answerByCode, packingItems } from "@/lib/tracking/packing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { TrackingStatusTimeline } from "@/components/tracking/status-timeline";

export const dynamic = "force-dynamic";

/**
 * /track/[token] — public order tracking (TASK-028) plus post-payment
 * packing materials (TASK-029).
 *
 * Lookup is by tracking token only (unguessable, not the sequential id).
 * The Prisma select is the allow-list of fields this page may see: no
 * email, phone, address, photos, description, or changedBy. packing
 * answers are only the cloning part-number codes, not free-text notes.
 */
export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trimmed = token?.trim() ?? "";

  if (!trimmed) {
    notFound();
  }

  const order = await prisma.order.findUnique({
    where: { trackingToken: trimmed },
    select: {
      id: true,
      status: true,
      partNumberEntered: true,
      servicePriceCents: true,
      returnShippingFeeCents: true,
      totalAmountCents: true,
      paymentLinkUrl: true,
      shippingLabelUrl: true,
      vehicle: { select: { make: true, model: true, year: true } },
      category: { select: { name: true } },
      service: { select: { name: true, questionSetCode: true } },
      answers: { select: { questionCode: true, answerValue: true } },
      statusHistory: {
        orderBy: { changedAt: "asc" },
        select: { status: true, changedAt: true },
      },
    },
  });

  if (!order) {
    notFound();
  }

  const vehicleLabel = `${order.vehicle.year} ${order.vehicle.make} ${order.vehicle.model}`;
  const hasPriceSnapshot = order.totalAmountCents != null;
  const showPayNow = order.status === "awaiting_payment" && Boolean(order.paymentLinkUrl);
  const showShippingMaterials = isPostPaymentStatus(order.status);
  const items = packingItems({
    categoryName: order.category.name,
    partNumber: order.partNumberEntered,
    questionSetCode: order.service?.questionSetCode ?? null,
    originalPartNumber: answerByCode(order.answers, "original_part_number"),
    donorPartNumber: answerByCode(order.answers, "donor_part_number"),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ECU Service Lab
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Order #{order.id.toString()}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      {showPayNow ? (
        <Card>
          <CardHeader>
            <CardTitle>Payment due</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              This order is waiting for payment. Use the secure Stripe link — nothing is charged
              until you complete it.
            </p>
            <Button asChild>
              <a href={order.paymentLinkUrl!} rel="noopener noreferrer">
                Pay now
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {order.status === "awaiting_payment" && !order.paymentLinkUrl ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Your payment link is being prepared. Check the email we sent, or refresh this page in
            a minute.
          </CardContent>
        </Card>
      ) : null}

      {showShippingMaterials ? (
        <Card>
          <CardHeader>
            <CardTitle>Packing & shipping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-medium">What to ship</p>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <p className="text-muted-foreground">
              Print the order slip and put it in the box. Inbound shipping to us is free — use any
              carrier.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/track/${trimmed}/slip`}>Printable order slip</Link>
              </Button>
              {order.shippingLabelUrl ? (
                <Button asChild variant="outline">
                  <a href={order.shippingLabelUrl} rel="noopener noreferrer">
                    Download shipping label
                  </a>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Order</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <div>
            <span className="text-muted-foreground">Vehicle: </span>
            {vehicleLabel}
          </div>
          <div>
            <span className="text-muted-foreground">Module: </span>
            {order.category.name}
          </div>
          <div>
            <span className="text-muted-foreground">Service: </span>
            {order.service?.name ?? "To be confirmed after review"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {hasPriceSnapshot ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service</span>
                <span>{formatCents(order.servicePriceCents!)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Return shipping</span>
                <span>{formatCents(order.returnShippingFeeCents!)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-medium">
                <span>Total</span>
                <span>{formatCents(order.totalAmountCents!)}</span>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Price will be confirmed after we review your part. Totals will show here once they
              are set.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <TrackingStatusTimeline currentStatus={order.status} history={order.statusHistory} />
        </CardContent>
      </Card>
    </main>
  );
}
