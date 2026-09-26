import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { OrderPhotoGallery } from "@/components/admin/order-photo-gallery";
import { OrderStatusTimeline } from "@/components/admin/order-status-timeline";
import { RegeneratePaymentLinkButton } from "@/components/admin/regenerate-payment-link-button";
import { ShippingLabelUpload } from "@/components/admin/shipping-label-upload";
import { UpdateStatusControl } from "@/components/admin/update-status-control";

/**
 * /admin/orders/[id] -- order detail (TASK-031), plus the manual
 * status-update control (TASK-032).
 *
 * Plain Server Component, no explicit requireAdmin() call -- same
 * layering decision as TASK-030's orders list: middleware.ts and the
 * dashboard layout's redirect-on-no-session already guard every page
 * navigation under /admin/*; requireAdmin() is reserved for the Server
 * Actions this page's buttons call (regeneratePaymentLink,
 * updateOrderStatus), which are independently reachable endpoints.
 */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;

  let id: bigint;
  try {
    id = BigInt(rawId);
  } catch {
    notFound();
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      vehicle: true,
      category: true,
      service: true,
      photos: { orderBy: { uploadedAt: "asc" } },
      answers: true,
      statusHistory: { orderBy: { changedAt: "asc" } },
    },
  });

  if (!order) {
    notFound();
  }

  // Answers only ever exist on the matched path (TASK-022), and are
  // always tied to the order's own service's question set (plus
  // FOLLOW_UP) -- the same rule getQuestions() (TASK-020) uses to
  // decide which questions apply, reproduced here as a direct Prisma
  // query rather than calling that Server Action, since this is a
  // plain read within an already-server context.
  let questionLabels = new Map<string, string>();
  if (order.service && order.answers.length > 0) {
    const setCodes =
      order.service.questionSetCode === "FOLLOW_UP"
        ? [order.service.questionSetCode]
        : [order.service.questionSetCode, "FOLLOW_UP"];
    const definitions = await prisma.questionDefinition.findMany({
      where: { questionSetCode: { in: setCodes } },
    });
    questionLabels = new Map(definitions.map((d) => [d.questionCode, d.label]));
  }

  const vehicleLabel = `${order.vehicle.year} ${order.vehicle.make} ${order.vehicle.model}`;
  const hasPriceSnapshot = order.totalAmountCents != null;
  const showRegenerateButton = order.status === "awaiting_payment" && !order.paymentLinkUrl;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/orders" className="text-sm text-muted-foreground hover:underline">
          ← Back to orders
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold">Order #{order.id.toString()}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manage status</CardTitle>
        </CardHeader>
        <CardContent>
          <UpdateStatusControl orderId={order.id.toString()} currentStatus={order.status} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vehicle & module</CardTitle>
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
              <span className="text-muted-foreground">Part number: </span>
              {order.partNumberEntered}
            </div>
            <div>
              <span className="text-muted-foreground">Service: </span>
              {order.service?.name ?? "Not yet matched — pending review"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer & shipping</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <div>
              <span className="text-muted-foreground">Name: </span>
              {order.customerName}
            </div>
            <div>
              <span className="text-muted-foreground">Email: </span>
              <Link href={`/admin/orders?q=${encodeURIComponent(order.customerEmail)}`} className="hover:underline">
                {order.customerEmail}
              </Link>
            </div>
            <div>
              <span className="text-muted-foreground">Phone: </span>
              {order.customerPhone}
            </div>
            <div>
              <span className="text-muted-foreground">Return address: </span>
              {order.returnAddressStreet}, {order.returnAddressCity}, {order.returnAddressState}{" "}
              {order.returnAddressZip}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Price breakdown</CardTitle>
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
                Price not yet set — this order is awaiting compatibility review.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stripe</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Payment status: </span>
              {order.stripePaymentStatus ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Payment link: </span>
              {order.paymentLinkUrl ? (
                <a
                  href={order.paymentLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {order.paymentLinkUrl}
                </a>
              ) : (
                "None"
              )}
            </div>
            {showRegenerateButton ? <RegeneratePaymentLinkButton orderId={order.id.toString()} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Return shipping label</CardTitle>
          </CardHeader>
          <CardContent>
            <ShippingLabelUpload orderId={order.id.toString()} shippingLabelUrl={order.shippingLabelUrl} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Description & answers</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Description</div>
            <p className="whitespace-pre-wrap">{order.description}</p>
          </div>
          {order.answers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {order.answers.map((answer) => (
                <div key={answer.id.toString()}>
                  <div className="text-muted-foreground">
                    {questionLabels.get(answer.questionCode) ?? answer.questionCode}
                  </div>
                  <p className="whitespace-pre-wrap">{answer.answerValue}</p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderPhotoGallery
            photos={order.photos.map((photo) => ({
              id: photo.id.toString(),
              photoType: photo.photoType,
              blobUrl: photo.blobUrl,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status history</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderStatusTimeline
            history={order.statusHistory.map((entry) => ({
              id: entry.id.toString(),
              status: entry.status,
              changedAt: entry.changedAt.toISOString(),
              changedBy: entry.changedBy,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
