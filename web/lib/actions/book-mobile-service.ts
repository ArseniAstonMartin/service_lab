"use server";

import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logServerError } from "@/lib/log";
import { BOOKING_SERVICES } from "@/lib/booking/catalog";

// Webhook endpoint for the n8n workflow that acts on a new booking
// (notifications, scheduling, etc.). Fixed, non-secret URL -- not worth
// routing through lib/env.ts's fail-fast schema, which exists for
// credentials that must be present before the feature that reads them
// can run at all.
const N8N_BOOKING_WEBHOOK_URL = "https://bestkeyservice.app.n8n.cloud/webhook/service-boooked";

const bookServiceSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(1).max(50),
  vehicle: z.object({
    make: z.string().min(1),
    model: z.string().min(1),
    year: z.number().int(),
  }),
  // Never trusts service titles/descriptions from the client -- only
  // the slug crosses the boundary, re-resolved against the server's
  // own catalog below.
  services: z.array(z.string()).min(1, "Select at least one service"),
  note: z.string().trim().max(2000).optional(),
});

export type BookServiceInput = z.infer<typeof bookServiceSchema>;

export type BookServiceResult = {
  bookingId: string;
  serviceTitles: string[];
};

/**
 * Validates and stores a mobile-service booking in its own table (never
 * mixed with the ECU Order flow -- see MobileServiceBooking's schema
 * comment), then best-effort notifies the configured n8n webhook. The
 * booking itself is the durable record: a webhook delivery failure is
 * logged but never rolls back or fails the booking, same as every other
 * side effect registered off the main Order flow
 * (lib/services/order-status.ts's side-effect registrations).
 */
export async function bookMobileService(input: BookServiceInput): Promise<BookServiceResult> {
  const parsed = bookServiceSchema.parse(input);

  const services = parsed.services.map((slug) => {
    const service = BOOKING_SERVICES.find((candidate) => candidate.slug === slug);
    if (!service) throw new Error("Invalid service selected");
    return service;
  });
  if (new Set(parsed.services).size !== parsed.services.length) {
    throw new Error("Duplicate service selected");
  }

  const note = parsed.note?.trim() || null;

  const booking = await prisma.mobileServiceBooking.create({
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone,
      make: parsed.vehicle.make,
      model: parsed.vehicle.model,
      year: parsed.vehicle.year,
      services: parsed.services,
      note,
    },
  });

  try {
    const response = await fetch(N8N_BOOKING_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: booking.id.toString(),
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email,
        phone: parsed.phone,
        vehicle: parsed.vehicle,
        services: services.map((service) => ({ slug: service.slug, title: service.title })),
        note,
        submittedAt: booking.createdAt.toISOString(),
      }),
    });
    if (!response.ok) throw new Error(`Webhook responded with ${response.status}`);
    await prisma.mobileServiceBooking.update({
      where: { id: booking.id },
      data: { webhookDeliveredAt: new Date() },
    });
  } catch (error) {
    logServerError("book-mobile-service-webhook", error);
  }

  return {
    bookingId: booking.id.toString(),
    serviceTitles: services.map((service) => service.title),
  };
}
