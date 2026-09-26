import { prisma } from "@/lib/db";
import { PricingForm } from "@/components/admin/pricing-form";

const RETURN_SHIPPING_FEE_KEY = "return_shipping_fee_cents";
const DEFAULT_RETURN_SHIPPING_FEE_CENTS = 2500;

/**
 * /admin/pricing (TASK-044) — live catalog only: tier amounts,
 * service-to-tier mapping, and the flat return-shipping fee.
 *
 * Plain Server Component, no requireAdmin() here — middleware and the
 * dashboard layout already guard page navigations. The mutations live
 * in lib/actions/pricing.ts and each one calls requireAdmin() itself.
 *
 * Order price snapshots are never loaded or written on this page, so
 * saving here can only affect quotes computed after the save.
 */
export default async function AdminPricingPage() {
  const [tiers, services, feeSetting] = await Promise.all([
    prisma.priceTier.findMany({ orderBy: { amountCents: "asc" } }),
    prisma.service.findMany({
      include: { category: true },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.appSetting.findUnique({ where: { key: RETURN_SHIPPING_FEE_KEY } }),
  ]);

  const parsedFee = feeSetting ? Number.parseInt(feeSetting.value, 10) : Number.NaN;
  const returnShippingFeeCents = Number.isFinite(parsedFee)
    ? parsedFee
    : DEFAULT_RETURN_SHIPPING_FEE_CENTS;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Pricing</h1>
        <p className="text-muted-foreground">
          Edit the live price catalog. Changes apply to new quotes only —
          already-quoted and paid orders keep their snapshot.
        </p>
      </div>
      <PricingForm
        tiers={tiers.map((tier) => ({
          tierCode: tier.tierCode,
          amountCents: tier.amountCents,
        }))}
        services={services.map((service) => ({
          id: service.id.toString(),
          name: service.name,
          categoryName: service.category.name,
          tierCode: service.tierCode,
        }))}
        returnShippingFeeCents={returnShippingFeeCents}
      />
    </div>
  );
}
