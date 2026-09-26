/**
 * Idempotent reference-data seed (TASK-007).
 *
 * Safe to run repeatedly: every write is an upsert (or a manual
 * find-then-create/update for models with no natural unique key), so
 * running this against an already-seeded database changes nothing.
 *
 * - Always seeds: the 5 module categories, price tiers 100/200/300/400,
 *   the services in PRD section 6/8, the return shipping fee AppSetting,
 *   and the SRS / CLONING / VIN_WRITE / RESTORATION / FOLLOW_UP question
 *   sets from PRD section 4.4.
 * - Only when SEED_SAMPLE=true AND this is not a Vercel production
 *   build: a few sample vehicles and compatibility entries (including
 *   one entry with zero linked services, to exercise the "matched but
 *   nothing confirmed yet" edge case), source "admin_confirmed" so they
 *   read as hand-entered test data rather than a real CSV import.
 *   TASK-046: production never gets this sample set — real coverage
 *   is imported through /admin/compatibility/import.
 *
 * Registered as `prisma.seed` in package.json; run with
 * `npx prisma db seed` (or `npm run db:seed`).
 */
import { PrismaClient, EntrySource, QuestionAnswerType } from "@prisma/client";

const prisma = new PrismaClient();

// ModuleCategory and Service have no unique constraint on `name` in the
// schema (only PriceTier.tierCode, AppSetting.key, QuestionDefinition's
// composite unique, Vehicle's composite unique and CompatibilityEntry's
// composite unique support a real `upsert`). For those two, fall back to
// find-then-create/update so the script stays idempotent regardless.
async function upsertModuleCategoryByName(name: string) {
  const existing = await prisma.moduleCategory.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.moduleCategory.create({ data: { name } });
}

async function upsertServiceByName(
  name: string,
  data: { categoryId: bigint; tierCode: string; questionSetCode: string },
) {
  const existing = await prisma.service.findFirst({ where: { name } });
  if (existing) {
    return prisma.service.update({ where: { id: existing.id }, data });
  }
  return prisma.service.create({ data: { name, ...data } });
}

const MODULE_CATEGORIES = [
  "Airbag/SRS",
  "ECM/PCM",
  "TCM/TCU",
  "BCM",
  "Instrument Cluster",
] as const;

const PRICE_TIERS = [
  { tierCode: "100", amountCents: 10000 },
  { tierCode: "200", amountCents: 20000 },
  { tierCode: "300", amountCents: 30000 },
  { tierCode: "400", amountCents: 40000 },
];

// name, category, tierCode, questionSetCode -- see PRD 4.4 for the
// question sets and 4.3/6/8 for tiers and category scoping.
const SERVICES: Array<{
  name: string;
  category: (typeof MODULE_CATEGORIES)[number];
  tierCode: string;
  questionSetCode: string;
}> = [
  { name: "Crash Data Reset", category: "Airbag/SRS", tierCode: "100", questionSetCode: "SRS" },
  { name: "SRS Module Repair", category: "Airbag/SRS", tierCode: "200", questionSetCode: "SRS" },
  { name: "ECM Cloning", category: "ECM/PCM", tierCode: "300", questionSetCode: "CLONING" },
  { name: "ECM VIN Write", category: "ECM/PCM", tierCode: "200", questionSetCode: "VIN_WRITE" },
  { name: "ECM Repair", category: "ECM/PCM", tierCode: "200", questionSetCode: "RESTORATION" },
  { name: "TCM Cloning", category: "TCM/TCU", tierCode: "300", questionSetCode: "CLONING" },
  { name: "TCM Repair", category: "TCM/TCU", tierCode: "200", questionSetCode: "RESTORATION" },
  { name: "BCM Cloning", category: "BCM", tierCode: "300", questionSetCode: "CLONING" },
  { name: "BCM Repair", category: "BCM", tierCode: "200", questionSetCode: "RESTORATION" },
  { name: "Cluster Repair", category: "Instrument Cluster", tierCode: "200", questionSetCode: "RESTORATION" },
  { name: "Cluster VIN Write", category: "Instrument Cluster", tierCode: "100", questionSetCode: "VIN_WRITE" },
];

// PRD 4.4's conditional-field lists, turned into data-driven questions.
const QUESTION_DEFINITIONS: Array<{
  questionSetCode: string;
  questionCode: string;
  label: string;
  answerType: QuestionAnswerType;
  required: boolean;
  sortOrder: number;
}> = [
  // SRS/Airbag
  { questionSetCode: "SRS", questionCode: "accident_yn", label: "Was the vehicle in an accident?", answerType: QuestionAnswerType.yes_no, required: true, sortOrder: 1 },
  { questionSetCode: "SRS", questionCode: "error_codes", label: "What error codes are present?", answerType: QuestionAnswerType.text, required: true, sortOrder: 2 },

  // Cloning
  { questionSetCode: "CLONING", questionCode: "original_available", label: "Is the original (source) module available?", answerType: QuestionAnswerType.yes_no, required: true, sortOrder: 1 },
  { questionSetCode: "CLONING", questionCode: "donor_available", label: "Is a donor module available?", answerType: QuestionAnswerType.yes_no, required: true, sortOrder: 2 },
  { questionSetCode: "CLONING", questionCode: "original_part_number", label: "Part number of the original module", answerType: QuestionAnswerType.text, required: true, sortOrder: 3 },
  { questionSetCode: "CLONING", questionCode: "original_photo", label: "Photo of the original module", answerType: QuestionAnswerType.photo, required: true, sortOrder: 4 },
  { questionSetCode: "CLONING", questionCode: "donor_part_number", label: "Part number of the donor module", answerType: QuestionAnswerType.text, required: true, sortOrder: 5 },
  { questionSetCode: "CLONING", questionCode: "donor_photo", label: "Photo of the donor module", answerType: QuestionAnswerType.photo, required: true, sortOrder: 6 },

  // VIN write
  { questionSetCode: "VIN_WRITE", questionCode: "current_vin", label: "Current VIN written to the module", answerType: QuestionAnswerType.text, required: true, sortOrder: 1 },
  { questionSetCode: "VIN_WRITE", questionCode: "required_vin", label: "VIN that needs to be written", answerType: QuestionAnswerType.text, required: true, sortOrder: 2 },
  { questionSetCode: "VIN_WRITE", questionCode: "vehicle_info", label: "Vehicle info (year, make, model, trim)", answerType: QuestionAnswerType.textarea, required: true, sortOrder: 3 },

  // Restoration / recovery
  { questionSetCode: "RESTORATION", questionCode: "powers_on", label: "Does the module currently power on or communicate?", answerType: QuestionAnswerType.yes_no, required: true, sortOrder: 1 },
  { questionSetCode: "RESTORATION", questionCode: "what_happened", label: "What happened right before it failed?", answerType: QuestionAnswerType.textarea, required: true, sortOrder: 2 },

  // Follow-up (appended when a service needs post-reinstall work; see TASK-020)
  { questionSetCode: "FOLLOW_UP", questionCode: "needs_followup", label: "Do you expect to need follow-up work done after this module is reinstalled?", answerType: QuestionAnswerType.yes_no, required: true, sortOrder: 1 },
  { questionSetCode: "FOLLOW_UP", questionCode: "followup_by_whom", label: "Who will do that follow-up work (you, your shop, a dealer)?", answerType: QuestionAnswerType.text, required: false, sortOrder: 2 },
];

// Midpoint of the PRD's $20-30 flat return-shipping fee range.
const RETURN_SHIPPING_FEE_CENTS = 2500;

async function seedModuleCategories() {
  const byName = new Map<string, { id: bigint }>();
  for (const name of MODULE_CATEGORIES) {
    const category = await upsertModuleCategoryByName(name);
    byName.set(name, category);
  }
  return byName;
}

async function seedPriceTiers() {
  for (const tier of PRICE_TIERS) {
    await prisma.priceTier.upsert({
      where: { tierCode: tier.tierCode },
      create: tier,
      update: { amountCents: tier.amountCents },
    });
  }
}

async function seedServices(categoryIdByName: Map<string, { id: bigint }>) {
  for (const service of SERVICES) {
    const category = categoryIdByName.get(service.category);
    if (!category) {
      throw new Error(`Unknown category "${service.category}" for service "${service.name}"`);
    }
    await upsertServiceByName(service.name, {
      categoryId: category.id,
      tierCode: service.tierCode,
      questionSetCode: service.questionSetCode,
    });
  }
}

async function seedQuestionDefinitions() {
  for (const q of QUESTION_DEFINITIONS) {
    await prisma.questionDefinition.upsert({
      where: {
        questionSetCode_questionCode: {
          questionSetCode: q.questionSetCode,
          questionCode: q.questionCode,
        },
      },
      create: q,
      update: {
        label: q.label,
        answerType: q.answerType,
        required: q.required,
        sortOrder: q.sortOrder,
      },
    });
  }
}

async function seedAppSettings() {
  await prisma.appSetting.upsert({
    where: { key: "return_shipping_fee_cents" },
    create: { key: "return_shipping_fee_cents", value: String(RETURN_SHIPPING_FEE_CENTS) },
    update: {},
  });
}

async function seedSampleCompatibilityData(categoryIdByName: Map<string, { id: bigint }>) {
  const camry = await prisma.vehicle.upsert({
    where: { make_model_year: { make: "Toyota", model: "Camry", year: 2015 } },
    create: { make: "Toyota", model: "Camry", year: 2015 },
    update: {},
  });
  const civic = await prisma.vehicle.upsert({
    where: { make_model_year: { make: "Honda", model: "Civic", year: 2018 } },
    create: { make: "Honda", model: "Civic", year: 2018 },
    update: {},
  });
  const f150 = await prisma.vehicle.upsert({
    where: { make_model_year: { make: "Ford", model: "F-150", year: 2020 } },
    create: { make: "Ford", model: "F-150", year: 2020 },
    update: {},
  });

  const srsCategory = categoryIdByName.get("Airbag/SRS")!;
  const ecmCategory = categoryIdByName.get("ECM/PCM")!;
  const bcmCategory = categoryIdByName.get("BCM")!;

  const crashDataReset = await prisma.service.findFirstOrThrow({ where: { name: "Crash Data Reset" } });
  const ecmVinWrite = await prisma.service.findFirstOrThrow({ where: { name: "ECM VIN Write" } });
  const ecmRepair = await prisma.service.findFirstOrThrow({ where: { name: "ECM Repair" } });

  // 1. Camry / Airbag-SRS, with one confirmed service.
  const camrySrsEntry = await prisma.compatibilityEntry.upsert({
    where: {
      vehicleId_categoryId_partNumber: {
        vehicleId: camry.id,
        categoryId: srsCategory.id,
        partNumber: "89170-06621",
      },
    },
    create: {
      vehicleId: camry.id,
      categoryId: srsCategory.id,
      partNumber: "89170-06621",
      source: EntrySource.admin_confirmed,
    },
    update: {},
  });
  await prisma.compatibilityService.upsert({
    where: { entryId_serviceId: { entryId: camrySrsEntry.id, serviceId: crashDataReset.id } },
    create: { entryId: camrySrsEntry.id, serviceId: crashDataReset.id },
    update: {},
  });

  // 2. Civic / ECM-PCM, with two confirmed services.
  const civicEcmEntry = await prisma.compatibilityEntry.upsert({
    where: {
      vehicleId_categoryId_partNumber: {
        vehicleId: civic.id,
        categoryId: ecmCategory.id,
        partNumber: "37820-5AA-A01",
      },
    },
    create: {
      vehicleId: civic.id,
      categoryId: ecmCategory.id,
      partNumber: "37820-5AA-A01",
      source: EntrySource.admin_confirmed,
    },
    update: {},
  });
  for (const service of [ecmVinWrite, ecmRepair]) {
    await prisma.compatibilityService.upsert({
      where: { entryId_serviceId: { entryId: civicEcmEntry.id, serviceId: service.id } },
      create: { entryId: civicEcmEntry.id, serviceId: service.id },
      update: {},
    });
  }

  // 3. F-150 / BCM, deliberately left with ZERO linked services -- an
  // entry that exists (so it's a "match") but decideMatch() must still
  // treat it as unsupported until an admin links a service to it.
  await prisma.compatibilityEntry.upsert({
    where: {
      vehicleId_categoryId_partNumber: {
        vehicleId: f150.id,
        categoryId: bcmCategory.id,
        partNumber: "JL3T-14B476-AA",
      },
    },
    create: {
      vehicleId: f150.id,
      categoryId: bcmCategory.id,
      partNumber: "JL3T-14B476-AA",
      source: EntrySource.admin_confirmed,
    },
    update: {},
  });
}

async function main() {
  const categoryIdByName = await seedModuleCategories();
  await seedPriceTiers();
  await seedServices(categoryIdByName);
  await seedQuestionDefinitions();
  await seedAppSettings();

  const allowSample = process.env.SEED_SAMPLE === "true" && process.env.VERCEL_ENV !== "production";
  if (allowSample) {
    await seedSampleCompatibilityData(categoryIdByName);
    console.log("Seeded reference data + sample compatibility data (SEED_SAMPLE=true).");
  } else if (process.env.SEED_SAMPLE === "true" && process.env.VERCEL_ENV === "production") {
    console.log("SEED_SAMPLE is ignored in production (TASK-046). Seeded reference data only.");
  } else {
    console.log("Seeded reference data. Set SEED_SAMPLE=true to also seed sample compatibility data.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
