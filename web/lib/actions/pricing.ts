"use server";

import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/supabase/require-admin";

const RETURN_SHIPPING_FEE_KEY = "return_shipping_fee_cents";
const RETURN_FEE_MIN_CENTS = 2000;
const RETURN_FEE_MAX_CENTS = 3000;

const updateTierAmountSchema = z.object({
  tierCode: z.string().trim().min(1).max(10),
  amountDollars: z.number().finite(),
});

const setServiceTierSchema = z.object({
  serviceId: z.string().min(1),
  tierCode: z.string().trim().min(1).max(10),
});

const setReturnShippingFeeSchema = z.object({
  feeDollars: z.number().finite(),
});

export type UpdateTierAmountInput = z.infer<typeof updateTierAmountSchema>;
export type SetServiceTierInput = z.infer<typeof setServiceTierSchema>;
export type SetReturnShippingFeeInput = z.infer<typeof setReturnShippingFeeSchema>;

/**
 * Converts a dollar amount the admin typed in the UI into integer
 * cents. Rounded to the nearest cent so a value like 24.995 never
 * lands as a fractional cent in the database.
 */
function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Admin pricing (TASK-044): update one PriceTier.amountCents. Only
 * writes the live catalog — existing Order price snapshots
 * (servicePriceCents / returnShippingFeeCents / totalAmountCents) are
 * never touched, so already-quoted and paid orders keep the price
 * they were given.
 */
export async function updateTierAmount(
  input: UpdateTierAmountInput,
): Promise<{ amountCents: number }> {
  await requireAdmin();
  const parsed = updateTierAmountSchema.parse(input);

  const amountCents = dollarsToCents(parsed.amountDollars);
  if (amountCents <= 0) {
    throw new Error("Amount must be greater than 0.");
  }

  const tier = await prisma.priceTier.findUnique({
    where: { tierCode: parsed.tierCode },
  });
  if (!tier) {
    throw new Error("Price tier not found.");
  }

  const updated = await prisma.priceTier.update({
    where: { tierCode: parsed.tierCode },
    data: { amountCents },
  });

  revalidatePath("/admin/pricing");
  return { amountCents: updated.amountCents };
}

/**
 * Admin pricing (TASK-044): remaps a Service onto an existing
 * PriceTier. Same snapshot rule as updateTierAmount — only the live
 * Service.tierCode changes; orders that already have a snapshot keep it.
 */
export async function setServiceTier(
  input: SetServiceTierInput,
): Promise<{ tierCode: string }> {
  await requireAdmin();
  const parsed = setServiceTierSchema.parse(input);

  let serviceId: bigint;
  try {
    serviceId = BigInt(parsed.serviceId);
  } catch {
    throw new Error("Invalid serviceId");
  }

  const [service, tier] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId } }),
    prisma.priceTier.findUnique({ where: { tierCode: parsed.tierCode } }),
  ]);
  if (!service) {
    throw new Error("Service not found.");
  }
  if (!tier) {
    throw new Error("Price tier not found.");
  }

  const updated = await prisma.service.update({
    where: { id: serviceId },
    data: { tierCode: parsed.tierCode },
  });

  revalidatePath("/admin/pricing");
  return { tierCode: updated.tierCode };
}

/**
 * Admin pricing (TASK-044): writes the single flat return-shipping
 * fee AppSetting. Allowed range is $20–$30 inclusive (PRD 5.4).
 * Upserts so a missing seed row cannot block the page; still never
 * writes any Order snapshot field.
 */
export async function setReturnShippingFee(
  input: SetReturnShippingFeeInput,
): Promise<{ feeCents: number }> {
  await requireAdmin();
  const parsed = setReturnShippingFeeSchema.parse(input);

  const feeCents = dollarsToCents(parsed.feeDollars);
  if (feeCents < RETURN_FEE_MIN_CENTS || feeCents > RETURN_FEE_MAX_CENTS) {
    throw new Error("Return shipping fee must be between $20 and $30.");
  }

  await prisma.appSetting.upsert({
    where: { key: RETURN_SHIPPING_FEE_KEY },
    create: { key: RETURN_SHIPPING_FEE_KEY, value: String(feeCents) },
    update: { value: String(feeCents) },
  });

  revalidatePath("/admin/pricing");
  return { feeCents };
}
