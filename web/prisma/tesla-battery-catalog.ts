import type { Prisma } from "@prisma/client";
import { BATTERY_CATEGORY, TESLA_BATTERY_SERVICE } from "../lib/domain/coverage";

export const BATTERY_QUESTIONS = [
  { questionCode: "battery_fault_history", label: "What happened before the 16V battery module stopped working? Include any accident or replacement history.", answerType: "textarea" as const, required: true, sortOrder: 1 },
  { questionCode: "battery_error_codes", label: "What battery-related diagnostic codes or alerts are present?", answerType: "text" as const, required: true, sortOrder: 2 },
  { questionCode: "battery_module_available", label: "Is the original 16V low-voltage battery management module available?", answerType: "yes_no" as const, required: true, sortOrder: 3 },
];

/** Run within the coverage import lock. Existing pricing is never overwritten. */
export async function ensureTeslaBatteryCatalog(tx: Prisma.TransactionClient, priceCents?: number) {
  const matches = await tx.moduleCategory.findMany({ where: { name: BATTERY_CATEGORY } });
  if (matches.length > 1) throw new Error("Duplicate Battery/BMS categories require review");
  const category = matches[0] ?? await tx.moduleCategory.create({ data: { name: BATTERY_CATEGORY } });
  const services = await tx.service.findMany({ where: { name: TESLA_BATTERY_SERVICE } });
  if (services.length > 1 || (services[0] && services[0].categoryId !== category.id)) throw new Error("Conflicting Tesla Battery Reset service mapping");
  let service = services[0];
  if (!service) {
    if (priceCents !== undefined && (!Number.isSafeInteger(priceCents) || priceCents <= 0)) throw new Error("Supply a positive service price in cents, or omit it for quote after review");
    const tier = await tx.priceTier.upsert({
      where: { tierCode: "TESLA_BAT" },
      // Zero is an unconfigured price, NEVER a free service. Customer lookup
      // returns null, and the quote/payment paths reject it until priced.
      create: { tierCode: "TESLA_BAT", amountCents: priceCents ?? 0 },
      update: {},
    });
    if (priceCents !== undefined && tier.amountCents !== priceCents) throw new Error("Existing Tesla battery price differs from the supplied price");
    service = await tx.service.create({ data: { name: TESLA_BATTERY_SERVICE, categoryId: category.id, tierCode: tier.tierCode, questionSetCode: "BATTERY_RESET" } });
  }
  for (const question of BATTERY_QUESTIONS) {
    await tx.questionDefinition.upsert({
      where: { questionSetCode_questionCode: { questionSetCode: "BATTERY_RESET", questionCode: question.questionCode } },
      create: { ...question, questionSetCode: "BATTERY_RESET" },
      update: {},
    });
  }
  return { category, service };
}
