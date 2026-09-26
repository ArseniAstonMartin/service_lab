import "server-only";
import { createElement, type ReactElement } from "react";
import type { Order, ModuleCategory, OrderPhoto, Service, Vehicle } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logServerError, safeErrorMessage } from "@/lib/log";
import { resend } from "@/lib/email/resend-client";
import {
  OrderSubmittedEmail,
  subject as orderSubmittedSubject,
  type OrderSubmittedEmailProps,
} from "@/lib/email/templates/order-submitted";
import {
  PaymentLinkEmail,
  subject as paymentLinkSubject,
  type PaymentLinkEmailProps,
} from "@/lib/email/templates/payment-link";
import {
  ModuleReceivedEmail,
  subject as moduleReceivedSubject,
  type ModuleReceivedEmailProps,
} from "@/lib/email/templates/module-received";
import {
  ReadyShippedBackEmail,
  subject as readyShippedBackSubject,
  type ReadyShippedBackEmailProps,
} from "@/lib/email/templates/ready-shipped-back";
import {
  AdminNewOrderEmail,
  subject as adminNewOrderSubject,
  type AdminNewOrderEmailProps,
} from "@/lib/email/templates/admin-new-order";

/**
 * The 5 PRD-section-9 transactional emails (TASK-041). String values,
 * not a Prisma enum, since EmailLog.emailType is a plain VARCHAR(30) --
 * these are the only valid values that column is ever written with.
 *
 *   order_submitted    -- #1, customer, both placeOrder paths (TASK-042)
 *   payment_link       -- #2, customer, the awaiting_payment side effect (TASK-043)
 *   module_received    -- #3, customer, the block_received side effect (TASK-043)
 *   ready_shipped_back -- #4, customer, the ready_shipped_back side effect (TASK-043)
 *   admin_new_order    -- #5, admin, both placeOrder paths (TASK-042)
 */
export type EmailType =
  | "order_submitted"
  | "payment_link"
  | "module_received"
  | "ready_shipped_back"
  | "admin_new_order";

export type SendOrderEmailResult =
  | { sent: true }
  | { sent: false; skipped: true }
  | { sent: false; skipped: false; error: string };

type OrderWithRelations = Order & {
  vehicle: Vehicle;
  category: ModuleCategory;
  service: Service | null;
  photos: OrderPhoto[];
};

function trackingUrl(order: OrderWithRelations): string {
  return `${env.NEXT_PUBLIC_SITE_URL}/track/${order.trackingToken}`;
}

function adminOrderUrl(order: OrderWithRelations): string {
  return `${env.NEXT_PUBLIC_SITE_URL}/admin/orders/${order.id.toString()}`;
}

/**
 * Renders a template element to a static HTML string via
 * react-dom/server. Imported dynamically, INSIDE this function, rather
 * than as a top-level `import { renderToStaticMarkup } from
 * "react-dom/server"` -- a static import of react-dom/server anywhere
 * in this module's import graph fails `next build` the moment anything
 * "use server" (e.g. lib/actions/place-order.ts, TASK-042) imports this
 * file: "You're importing a component that imports react-dom/server...
 * render or return the content directly as a Server Component
 * instead." That rule exists for actual React components rendered as
 * part of a page; it doesn't apply to what this is actually doing
 * (rendering an email to a plain string, nothing ever reaches the RSC
 * tree), but Next's check can't tell the difference from a static
 * import alone -- a dynamic import sidesteps it.
 */
async function renderEmailHtml(element: ReactElement): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(element);
}

/**
 * Builds the {to, subject, html} for one order + email type. Throws
 * (caught by sendOrderEmail's try/catch below, never left to the
 * caller) when the order is missing a field a particular email type
 * requires -- e.g. asking for the payment_link email before the order
 * actually has one is a caller bug, not a "send failed" case to retry
 * silently.
 */
async function buildEmail(
  order: OrderWithRelations,
  type: EmailType,
): Promise<{ to: string; subject: string; html: string }> {
  switch (type) {
    case "order_submitted": {
      const props: OrderSubmittedEmailProps = {
        orderNumber: order.id.toString(),
        trackingUrl: trackingUrl(order),
        matched: order.matchedEntryId != null,
      };
      return {
        to: order.customerEmail,
        subject: orderSubmittedSubject(props),
        html: await renderEmailHtml(createElement(OrderSubmittedEmail, props)),
      };
    }

    case "payment_link": {
      if (
        !order.paymentLinkUrl ||
        order.servicePriceCents == null ||
        order.returnShippingFeeCents == null ||
        order.totalAmountCents == null ||
        !order.service
      ) {
        throw new Error(
          `Order ${order.id.toString()} is missing the price snapshot or payment link required for the payment_link email.`,
        );
      }
      const props: PaymentLinkEmailProps = {
        orderNumber: order.id.toString(),
        trackingUrl: trackingUrl(order),
        serviceName: order.service.name,
        servicePriceCents: order.servicePriceCents,
        returnShippingFeeCents: order.returnShippingFeeCents,
        totalCents: order.totalAmountCents,
        paymentLinkUrl: order.paymentLinkUrl,
      };
      return {
        to: order.customerEmail,
        subject: paymentLinkSubject(props),
        html: await renderEmailHtml(createElement(PaymentLinkEmail, props)),
      };
    }

    case "module_received": {
      const props: ModuleReceivedEmailProps = {
        orderNumber: order.id.toString(),
        trackingUrl: trackingUrl(order),
      };
      return {
        to: order.customerEmail,
        subject: moduleReceivedSubject(props),
        html: await renderEmailHtml(createElement(ModuleReceivedEmail, props)),
      };
    }

    case "ready_shipped_back": {
      const props: ReadyShippedBackEmailProps = {
        orderNumber: order.id.toString(),
        trackingUrl: trackingUrl(order),
        returnTrackingNo: order.returnTrackingNo,
      };
      return {
        to: order.customerEmail,
        subject: readyShippedBackSubject(props),
        html: await renderEmailHtml(createElement(ReadyShippedBackEmail, props)),
      };
    }

    case "admin_new_order": {
      const stickerPhoto = order.photos.find((photo) => photo.photoType === "sticker");
      const props: AdminNewOrderEmailProps = {
        orderNumber: order.id.toString(),
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        partNumber: order.partNumberEntered,
        stickerPhotoUrl: stickerPhoto?.blobUrl ?? null,
        adminOrderUrl: adminOrderUrl(order),
      };
      return {
        to: env.ADMIN_NOTIFICATION_EMAIL,
        subject: adminNewOrderSubject(props),
        html: await renderEmailHtml(createElement(AdminNewOrderEmail, props)),
      };
    }
  }
}

/** Never throws -- failures are logged to EmailLog (and console) and returned, not raised. */
async function recordEmailLog(
  orderId: bigint,
  emailType: EmailType,
  status: "sent" | "failed",
  error: string | null,
): Promise<void> {
  try {
    await prisma.emailLog.create({ data: { orderId, emailType, status, error } });
  } catch (err) {
    // Only reachable via a race: two concurrent sendOrderEmail calls
    // both passed the findUnique check below before either had written
    // its EmailLog row, so this create() is the one that actually hits
    // the (orderId, emailType) unique constraint. The email itself was
    // already sent/attempted by that point -- not worth failing the
    // caller over a duplicate LOG row.
    logServerError(`EmailLog write raced for order ${orderId.toString()} (${emailType})`, err);
  }
}

/**
 * Renders one of the 5 PRD emails for `orderId`, sends it via Resend,
 * and records the outcome in EmailLog. The (orderId, emailType) unique
 * key is what actually guarantees each email is sent at most once per
 * order; the findUnique() below is just the fast path that skips
 * calling Resend at all for the common (non-racing) repeat call.
 *
 * Deliberately never throws: every internal failure (a missing order
 * field, a Resend API error, a network error) is caught, logged to both
 * EmailLog and the server console, and returned as
 * `{ sent: false, skipped: false, error }` instead of raised. Callers
 * (TASK-042/043) are expected to call this AFTER their own DB commit
 * has already succeeded, exactly because a failed send must never look
 * like a failed order/status update.
 */
export async function sendOrderEmail(
  orderId: bigint | string,
  type: EmailType,
): Promise<SendOrderEmailResult> {
  let id: bigint;
  try {
    id = typeof orderId === "bigint" ? orderId : BigInt(orderId);
  } catch {
    console.error("sendOrderEmail called with an invalid orderId");
    return { sent: false, skipped: false, error: "Invalid orderId" };
  }

  const existing = await prisma.emailLog.findUnique({
    where: { orderId_emailType: { orderId: id, emailType: type } },
  });
  if (existing) {
    return { sent: false, skipped: true };
  }

  try {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: { vehicle: true, category: true, service: true, photos: true },
    });

    const { to, subject, html } = await buildEmail(order, type);

    const result = await resend.emails.send({ from: env.RESEND_FROM_EMAIL, to, subject, html });
    if (result.error) {
      throw new Error(`Resend API error (${result.error.name}): ${result.error.message}`);
    }

    await recordEmailLog(id, type, "sent", null);
    return { sent: true };
  } catch (error) {
    const message = safeErrorMessage(error);
    logServerError(`sendOrderEmail failed for order ${id.toString()} (${type})`, error);
    await recordEmailLog(id, type, "failed", message);
    return { sent: false, skipped: false, error: message };
  }
}
