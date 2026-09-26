import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SHOP_SHIPPING_ADDRESS } from "@/lib/constants";
import { isPostPaymentStatus } from "@/lib/domain/status";
import { answerByCode, packingItems } from "@/lib/tracking/packing";
import { PrintButton } from "@/components/tracking/print-button";

export const dynamic = "force-dynamic";

/**
 * Printable order slip (TASK-029). Reachable only after payment — an
 * unpaid or unknown token uses the same generic not-found as the
 * tracking page, so this URL does not leak whether an unpaid order exists.
 */
export default async function OrderSlipPage({
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
      category: { select: { name: true } },
      service: { select: { questionSetCode: true } },
      answers: { select: { questionCode: true, answerValue: true } },
    },
  });

  if (!order || !isPostPaymentStatus(order.status)) {
    notFound();
  }

  const items = packingItems({
    categoryName: order.category.name,
    partNumber: order.partNumberEntered,
    questionSetCode: order.service?.questionSetCode ?? null,
    originalPartNumber: answerByCode(order.answers, "original_part_number"),
    donorPartNumber: answerByCode(order.answers, "donor_part_number"),
  });

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href={`/track/${trimmed}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to tracking
        </Link>
        <PrintButton />
      </div>

      <article className="space-y-6 rounded-xl border p-6 print:border-0 print:p-0">
        <header>
          <p className="text-sm text-muted-foreground">Include this slip in the package</p>
          <h1 className="text-2xl font-semibold">Order #{order.id.toString()}</h1>
        </header>

        <section>
          <h2 className="text-sm font-semibold">Ship to</h2>
          <p className="mt-1 text-sm">
            {SHOP_SHIPPING_ADDRESS.name}
            <br />
            {SHOP_SHIPPING_ADDRESS.locality}
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Modules to ship</h2>
          <ul className="mt-1 list-inside list-disc text-sm">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </article>
    </main>
  );
}
