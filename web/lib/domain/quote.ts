/**
 * Price quote.
 *
 * Pure domain logic — no Prisma, Next.js or Stripe imports. All amounts
 * are integer cents in and integer cents out; only the UI ever formats
 * cents as dollars.
 */

export interface Quote {
  servicePriceCents: number;
  returnShippingFeeCents: number;
  totalCents: number;
}

/**
 * Computes the price quote for a matched order: the service's price
 * (from its PriceTier.amountCents) plus the flat return shipping fee
 * (from the return_shipping_fee_cents AppSetting). Inbound shipping to
 * the lab is always free and never appears here.
 */
export function quote(tierAmountCents: number, returnFeeCents: number): Quote {
  if (!Number.isSafeInteger(tierAmountCents) || tierAmountCents <= 0) {
    throw new Error("Set a positive service price in Pricing before confirming payment.");
  }
  if (!Number.isSafeInteger(returnFeeCents) || returnFeeCents < 0) throw new Error("Invalid return shipping fee.");
  return {
    servicePriceCents: tierAmountCents,
    returnShippingFeeCents: returnFeeCents,
    totalCents: tierAmountCents + returnFeeCents,
  };
}
