"use server";

import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { contactSchema, type ContactState } from "@/lib/domain/contact";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { resend } from "@/lib/email/resend-client";
import { logServerError } from "@/lib/log";

export async function sendContactInquiry(
  _previous: ContactState,
  data: FormData,
): Promise<ContactState> {
  const parsed = contactSchema.safeParse(Object.fromEntries(data.entries()));
  if (!parsed.success)
    return {
      success: false,
      message: "Please check your contact details and include a message of 20–3,000 characters.",
    };
  if (parsed.data.website)
    return { success: true, message: "Thank you. Your inquiry has been received." };
  try {
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const key = `contact-rate:${createHash("sha256").update(ip).digest("hex")}`;
    const now = Math.floor(Date.now() / 1000);
    // Shared, atomic limit across serverless instances. Fixed recipient, no
    // customer autoresponder. Only a hashed IP and counters are stored.
    const allowed = await prisma.$queryRaw<{ key: string }[]>`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify({ resetAt: now + 3600, count: 1 })}, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = CASE WHEN (app_settings.value::jsonb->>'resetAt')::bigint <= ${now}
          THEN EXCLUDED.value ELSE jsonb_set(app_settings.value::jsonb, '{count}',
            to_jsonb((app_settings.value::jsonb->>'count')::integer + 1))::text END,
        updated_at = NOW()
      WHERE (app_settings.value::jsonb->>'resetAt')::bigint <= ${now}
         OR (app_settings.value::jsonb->>'count')::integer < 5
      RETURNING key`;
    if (!allowed.length)
      return {
        success: false,
        message: "Please wait before sending another inquiry, or call +1 (808) 743-4377.",
      };
    const { name, email, phone, topic, message } = parsed.data;
    const idempotencyKey = createHash("sha256")
      .update(JSON.stringify([name, email, phone, topic, message, Math.floor(now / 3600)]))
      .digest("hex");
    const result = await resend.emails.send(
      {
        from: env.RESEND_FROM_EMAIL,
        to: env.ADMIN_NOTIFICATION_EMAIL,
        replyTo: email,
        subject: `Best Auto Repair inquiry: ${topic}`,
        text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || "Not provided"}\nTopic: ${topic}\n\n${message}`,
      },
      { idempotencyKey: `contact-${idempotencyKey}` },
    );
    if (result.error || !result.data?.id) throw new Error("Contact inquiry delivery failed");
    // Expire old counters without storing the inquiry or personal details.
    await prisma.appSetting
      .deleteMany({
        where: {
          key: { startsWith: "contact-rate:" },
          updatedAt: { lt: new Date(Date.now() - 2 * 86400000) },
        },
      })
      .catch(() => undefined);
    return {
      success: true,
      message: "Your message has been sent. We’ll reply using the contact details you provided.",
    };
  } catch (error) {
    logServerError("contact-inquiry", error);
    return {
      success: false,
      message: "We couldn’t send your message right now. Please call +1 (808) 743-4377.",
    };
  }
}
