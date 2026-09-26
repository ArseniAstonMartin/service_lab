"use server";

import { z } from "zod";
import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { isVercelBlobUrl } from "@/lib/blob";

/**
 * Admin return-label upload/replace/remove (TASK-033). The upload
 * itself happens client-side straight to Vercel Blob through the
 * "label" purpose on app/api/uploads/token (TASK-014, admin-only,
 * labels/ path prefix); these Server Actions are what the client calls
 * afterwards with the resulting Blob URL, and are the only code that
 * writes Order.shippingLabelUrl.
 */

function assertLabelBlobUrl(url: string): void {
  if (!isVercelBlobUrl(url)) {
    throw new Error("shippingLabelUrl must be a Vercel Blob URL.");
  }
  // Defense in depth beyond the domain check above: also confirm it was
  // uploaded under the same labels/ prefix the upload token route
  // enforces for purpose "label", so a wizard-purpose (pending/) blob
  // URL can never be saved here by mistake.
  const { pathname } = new URL(url);
  if (!pathname.startsWith("/labels/")) {
    throw new Error("shippingLabelUrl must be under the labels/ path prefix.");
  }
}

/**
 * Deletes a blob and swallows the error rather than throwing — losing
 * the OLD blob is not worth failing the admin's replace/remove action
 * over (the new state has already been decided; at worst an orphan blob
 * is left behind, which is a storage cost, not a correctness problem).
 */
async function deleteBlobBestEffort(url: string): Promise<void> {
  try {
    await del(url);
  } catch (error) {
    console.error(`Failed to delete shipping label blob ${url}:`, error);
  }
}

const orderIdSchema = z.object({ orderId: z.string().min(1) });

function parseOrderId(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error("Invalid orderId");
  }
}

async function revalidateOrderAndTracking(orderId: bigint, trackingToken: string): Promise<void> {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/track/${trackingToken}`);
}

const setShippingLabelSchema = orderIdSchema.extend({
  blobUrl: z.string().min(1),
});

/**
 * Saves (or replaces) the order's return shipping label. If a label
 * already exists, the old blob is deleted after the new URL is
 * committed to the database, never before -- a failed upload must never
 * leave the order with neither the old nor the new label.
 */
export async function setShippingLabel(
  input: z.infer<typeof setShippingLabelSchema>,
): Promise<{ shippingLabelUrl: string }> {
  await requireAdmin();
  const parsed = setShippingLabelSchema.parse(input);
  const orderId = parseOrderId(parsed.orderId);
  assertLabelBlobUrl(parsed.blobUrl);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const previousUrl = order.shippingLabelUrl;

  await prisma.order.update({
    where: { id: orderId },
    data: { shippingLabelUrl: parsed.blobUrl },
  });

  if (previousUrl && previousUrl !== parsed.blobUrl) {
    await deleteBlobBestEffort(previousUrl);
  }

  await revalidateOrderAndTracking(orderId, order.trackingToken);

  return { shippingLabelUrl: parsed.blobUrl };
}

/** Clears the order's return shipping label and deletes its blob. */
export async function removeShippingLabel(
  input: z.infer<typeof orderIdSchema>,
): Promise<{ shippingLabelUrl: null }> {
  await requireAdmin();
  const parsed = orderIdSchema.parse(input);
  const orderId = parseOrderId(parsed.orderId);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  if (order.shippingLabelUrl) {
    await prisma.order.update({
      where: { id: orderId },
      data: { shippingLabelUrl: null },
    });
    await deleteBlobBestEffort(order.shippingLabelUrl);
  }

  await revalidateOrderAndTracking(orderId, order.trackingToken);

  return { shippingLabelUrl: null };
}
