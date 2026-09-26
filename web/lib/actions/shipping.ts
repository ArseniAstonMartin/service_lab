"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { quote, type Quote } from "@/lib/domain/quote";

const RETURN_SHIPPING_FEE_KEY = "return_shipping_fee_cents";

export type ServiceQuote = Quote & {
  service: { id: string; name: string; priceCents: number };
};

const getQuoteSchema = z.object({
  serviceId: z.string().min(1),
});

/**
 * Recomputes the price quote for a matched order's selected service,
 * entirely server-side, from the live Service -> PriceTier price and
 * the current return_shipping_fee_cents AppSetting.
 *
 * Deliberately never trusts the priceCents already sitting in wizard
 * state from TASK-018's match result: tasks.json's "Never trust price...
 * data sent from the client — recompute it on the server" convention
 * applies here too, and the return shipping fee especially can have
 * changed (via TASK-044's admin pricing screen) between the
 * compatibility check and this step.
 */
export async function getQuote(serviceId: string): Promise<ServiceQuote> {
  const parsed = getQuoteSchema.parse({ serviceId });

  let id: bigint;
  try {
    id = BigInt(parsed.serviceId);
  } catch {
    throw new Error("Invalid serviceId");
  }

  const service = await prisma.service.findUnique({
    where: { id },
    include: { priceTier: true },
  });
  if (!service) {
    throw new Error("Service not found");
  }

  const feeSetting = await prisma.appSetting.findUnique({
    where: { key: RETURN_SHIPPING_FEE_KEY },
  });
  // Falls back to 0 rather than throwing if the setting is somehow
  // missing (it's always seeded — see TASK-007) so a data problem here
  // degrades to an under-quote rather than a hard crash on this screen;
  // TASK-022's placeOrder still re-derives everything again regardless.
  const returnShippingFeeCents = feeSetting ? Number.parseInt(feeSetting.value, 10) : 0;

  const priced = quote(service.priceTier.amountCents, returnShippingFeeCents);

  return {
    service: {
      id: service.id.toString(),
      name: service.name,
      priceCents: service.priceTier.amountCents,
    },
    ...priced,
  };
}

const getCategoryNameSchema = z.object({
  categoryId: z.string().min(1),
});

/**
 * Resolves a module category id (the only thing wizard state holds for
 * it — see lib/wizard/types.ts) to its display name, so the order
 * review section on this step can show "Airbag/SRS" rather than a raw
 * database id.
 */
export async function getCategoryName(categoryId: string): Promise<string | null> {
  const parsed = getCategoryNameSchema.parse({ categoryId });

  let id: bigint;
  try {
    id = BigInt(parsed.categoryId);
  } catch {
    throw new Error("Invalid categoryId");
  }

  const category = await prisma.moduleCategory.findUnique({ where: { id } });
  return category?.name ?? null;
}
