"use server";

import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { EntrySource, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { normalizePartNumber } from "@/lib/domain/part-number";

/**
 * Manual CRUD for individual CompatibilityEntry rows (PRD 5.3 calls this
 * "secondary, not MVP-blocking" — /admin/compatibility (TASK-038) shipped
 * read-only on purpose). This is that deferred piece: an admin can now
 * add, edit or delete a single entry by hand, alongside the existing
 * bulk Excel/CSV import (lib/actions/import.ts) and the
 * confirm-compatibility flow (which only ever writes an entry as a side
 * effect of confirming one specific pending-review order).
 *
 * Every entry created or edited here is stamped admin_confirmed, same as
 * confirm-compatibility.ts — there is no "manual import" source.
 */

function parseBigInt(value: string, label: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
}

const vehicleSchema = z.object({
  make: z.string().trim().min(1).max(50),
  // "All" + year 2000 is the sentinel container coverage imports use for
  // brand-level entries with no real model/year (see lib/domain/coverage.ts)
  // — allowed here too, so an admin can hand-add that kind of entry.
  model: z.string().trim().min(1).max(50),
  year: z.number().int().min(1900).max(2100),
});

const createEntrySchema = z.object({
  vehicle: vehicleSchema,
  categoryId: z.string().min(1),
  partNumber: z.string().trim().min(1).max(100),
  serviceIds: z
    .array(z.string().min(1))
    .transform((ids) => Array.from(new Set(ids))),
});

const updateEntrySchema = z.object({
  entryId: z.string().min(1),
  partNumber: z.string().trim().min(1).max(100),
  serviceIds: z
    .array(z.string().min(1))
    .transform((ids) => Array.from(new Set(ids))),
});

const deleteEntrySchema = z.object({ entryId: z.string().min(1) });

export type CreateCompatibilityEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateCompatibilityEntryInput = z.infer<typeof updateEntrySchema>;

/** Never trusts that the client's service checkboxes actually belong to
 * the entry's own module category — same guard confirm-compatibility.ts
 * applies to an order's category. */
async function assertServicesBelongToCategory(
  tx: Prisma.TransactionClient,
  serviceIds: bigint[],
  categoryId: bigint,
): Promise<void> {
  if (serviceIds.length === 0) return;
  const rows = await tx.service.findMany({ where: { id: { in: serviceIds }, categoryId } });
  if (rows.length !== serviceIds.length) {
    throw new Error("One or more selected services do not belong to this module category.");
  }
}

/**
 * Creates a new CompatibilityEntry (and its Vehicle row, if the given
 * make/model/year doesn't exist yet). Fails loudly — never silently
 * overwrites — if an entry already exists for this exact
 * vehicle/category/part number; edit that one instead.
 */
export async function createCompatibilityEntry(
  input: CreateCompatibilityEntryInput,
): Promise<{ id: string }> {
  await requireAdmin();
  const parsed = createEntrySchema.parse(input);
  const categoryId = parseBigInt(parsed.categoryId, "categoryId");
  const serviceIds = parsed.serviceIds.map((id) => parseBigInt(id, "serviceId"));
  const partNumber = normalizePartNumber(parsed.partNumber);

  const entryId = await prisma.$transaction(async (tx) => {
    await assertServicesBelongToCategory(tx, serviceIds, categoryId);

    const vehicle = await tx.vehicle.upsert({
      where: { make_model_year: parsed.vehicle },
      create: parsed.vehicle,
      update: {},
    });

    let entry;
    try {
      entry = await tx.compatibilityEntry.create({
        data: {
          vehicleId: vehicle.id,
          categoryId,
          partNumber,
          source: EntrySource.admin_confirmed,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error(
          "An entry already exists for this vehicle, category and part number — edit it instead.",
        );
      }
      throw error;
    }

    if (serviceIds.length > 0) {
      await tx.compatibilityService.createMany({
        data: serviceIds.map((serviceId) => ({ entryId: entry.id, serviceId })),
      });
    }

    return entry.id;
  });

  revalidatePath("/admin/compatibility");
  return { id: entryId.toString() };
}

/**
 * Edits an existing entry's part number and/or linked services. The
 * vehicle and module category are immutable once created — changing
 * either is really "a different entry", so that's delete-and-recreate,
 * not an edit (keeps the vehicleId/categoryId/partNumber unique
 * constraint's meaning intact and avoids silently merging two entries).
 */
export async function updateCompatibilityEntry(
  input: UpdateCompatibilityEntryInput,
): Promise<void> {
  await requireAdmin();
  const parsed = updateEntrySchema.parse(input);
  const entryId = parseBigInt(parsed.entryId, "entryId");
  const serviceIds = parsed.serviceIds.map((id) => parseBigInt(id, "serviceId"));
  const partNumber = normalizePartNumber(parsed.partNumber);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.compatibilityEntry.findUniqueOrThrow({ where: { id: entryId } });
    await assertServicesBelongToCategory(tx, serviceIds, existing.categoryId);

    try {
      await tx.compatibilityEntry.update({
        where: { id: entryId },
        data: { partNumber, source: EntrySource.admin_confirmed },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("Another entry already exists for this vehicle, category and part number.");
      }
      throw error;
    }

    await tx.compatibilityService.deleteMany({ where: { entryId } });
    if (serviceIds.length > 0) {
      await tx.compatibilityService.createMany({
        data: serviceIds.map((serviceId) => ({ entryId, serviceId })),
      });
    }
  });

  revalidatePath("/admin/compatibility");
}

/**
 * Deletes an entry and its service links. Never touches the Vehicle row
 * (it may still back other entries or orders). An order that had
 * matched this exact entry (Order.matchedEntryId) keeps its own price/
 * service snapshot — the FK is ON DELETE SET NULL, so the order just
 * loses the backreference, not its history.
 */
export async function deleteCompatibilityEntry(entryIdInput: string): Promise<void> {
  await requireAdmin();
  const parsed = deleteEntrySchema.parse({ entryId: entryIdInput });
  const entryId = parseBigInt(parsed.entryId, "entryId");

  await prisma.$transaction(async (tx) => {
    // compatibility_services.entry_id is ON DELETE RESTRICT -- these
    // must go first, or the entry delete below fails its FK check.
    await tx.compatibilityService.deleteMany({ where: { entryId } });
    await tx.compatibilityEntry.delete({ where: { id: entryId } });
  });

  revalidatePath("/admin/compatibility");
}
