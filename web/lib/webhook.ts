import "server-only";
import { logServerError } from "@/lib/log";

/**
 * Fire-and-forget POST to an external (n8n) webhook, shared by
 * lib/actions/place-order.ts and lib/actions/book-mobile-service.ts.
 * Failure is logged but never thrown back to the caller -- the booking
 * or order it's reporting on has already committed by the time this
 * runs, and a webhook outage must never roll back or fail that already-
 * successful action. Returns whether delivery succeeded so a caller
 * that tracks delivery (MobileServiceBooking.webhookDeliveredAt) can
 * act on it.
 */
export async function postWebhook(context: string, url: string, payload: unknown): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Webhook responded with ${response.status}`);
    return true;
  } catch (error) {
    logServerError(context, error);
    return false;
  }
}
