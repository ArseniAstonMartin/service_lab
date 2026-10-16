import type { Prisma } from "@prisma/client";
import { DIAGNOSTICS_CATEGORY, VEHICLE_DIAGNOSTICS_SERVICE } from "../lib/domain/coverage";

/**
 * Same ensure-the-catalog-exists pattern as tesla-battery-catalog.ts's
 * ensureTeslaBatteryCatalog: idempotent, safe to call from both the main
 * seed and a one-off script against the live database. Existing pricing
 * is never overwritten.
 */
export const DIAGNOSTICS_QUESTIONS = [
  {
    questionCode: "symptoms",
    label: "What symptoms, warning lights, or noises are you experiencing?",
    answerType: "textarea" as const,
    required: true,
    sortOrder: 1,
  },
  {
    questionCode: "when_started",
    label: "When did this start — all the time, or only sometimes?",
    answerType: "text" as const,
    required: true,
    sortOrder: 2,
  },
];

/** Run within the coverage import lock. Existing pricing is never overwritten. */
export async function ensureVehicleDiagnosticsCatalog(tx: Prisma.TransactionClient, priceCents?: number) {
  const matches = await tx.moduleCategory.findMany({ where: { name: DIAGNOSTICS_CATEGORY } });
  if (matches.length > 1) throw new Error("Duplicate Vehicle Diagnostics categories require review");
  let category = matches[0];
  if (!category) {
    category = await tx.moduleCategory.create({
      data: { name: DIAGNOSTICS_CATEGORY, requiresPartNumber: false },
    });
  } else if (category.requiresPartNumber) {
    // Existed (e.g. created by hand) without the flag set -- fix it
    // rather than leaving the wizard asking for a part number it'll
    // never check against anything.
    category = await tx.moduleCategory.update({
      where: { id: category.id },
      data: { requiresPartNumber: false },
    });
  }

  const services = await tx.service.findMany({ where: { name: VEHICLE_DIAGNOSTICS_SERVICE } });
  if (services.length > 1 || (services[0] && services[0].categoryId !== category.id)) {
    throw new Error("Conflicting Vehicle Diagnostics service mapping");
  }
  let service = services[0];
  if (!service) {
    if (priceCents !== undefined && (!Number.isSafeInteger(priceCents) || priceCents <= 0)) {
      throw new Error("Supply a positive service price in cents, or omit it for quote after review");
    }
    const tier = await tx.priceTier.upsert({
      where: { tierCode: "DIAGNOSTIC" },
      // Zero is an unconfigured price, NEVER a free service. Customer
      // lookup returns null, and the quote/payment paths reject it
      // until priced (same convention as TESLA_BAT).
      create: { tierCode: "DIAGNOSTIC", amountCents: priceCents ?? 0 },
      update: {},
    });
    if (priceCents !== undefined && tier.amountCents !== priceCents) {
      throw new Error("Existing Vehicle Diagnostics price differs from the supplied price");
    }
    service = await tx.service.create({
      data: {
        name: VEHICLE_DIAGNOSTICS_SERVICE,
        categoryId: category.id,
        tierCode: tier.tierCode,
        questionSetCode: "VEHICLE_DIAGNOSTICS",
      },
    });
  }

  for (const question of DIAGNOSTICS_QUESTIONS) {
    await tx.questionDefinition.upsert({
      where: {
        questionSetCode_questionCode: {
          questionSetCode: "VEHICLE_DIAGNOSTICS",
          questionCode: question.questionCode,
        },
      },
      create: { ...question, questionSetCode: "VEHICLE_DIAGNOSTICS" },
      update: {},
    });
  }

  return { category, service };
}
