import { prisma } from "@/lib/db";
import { ReviewQueueCard } from "@/components/admin/review-queue-card";

/**
 * /admin/review-queue (TASK-035) -- the pending_review worklist. Confirm
 * dialog / confirmCompatibility wiring is TASK-036/037's job; this task
 * only lists the queue.
 */
export default async function AdminReviewQueuePage() {
  const orders = await prisma.order.findMany({
    where: { status: "pending_review" },
    orderBy: { createdAt: "asc" },
    include: {
      vehicle: true,
      category: true,
      photos: { where: { photoType: "sticker" }, take: 1 },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Review Queue</h1>
        <p className="text-sm text-muted-foreground">
          {orders.length} order{orders.length === 1 ? "" : "s"} awaiting manual compatibility review, oldest first.
        </p>
      </div>

      {orders.length === 0 ? (
        <p className="text-muted-foreground">Nothing to review right now.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <ReviewQueueCard
              key={order.id.toString()}
              id={order.id.toString()}
              partNumber={order.partNumberEntered}
              vehicleLabel={`${order.vehicle.year} ${order.vehicle.make} ${order.vehicle.model}`}
              categoryName={order.category.name}
              description={order.description}
              stickerPhotoUrl={order.photos[0]?.blobUrl ?? null}
              createdAt={order.createdAt.toISOString()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
