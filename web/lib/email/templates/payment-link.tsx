import { formatCents } from "@/lib/format";
import { EmailButton, EmailLayout } from "./layout";

/**
 * Email #2 (PRD section 9): sent once compatibility is confirmed (auto
 * or manual) and the Stripe Payment Link is created -- registered as
 * the awaiting_payment side effect in TASK-043, alongside
 * lib/services/payment.ts's ensurePaymentLink().
 */
export type PaymentLinkEmailProps = {
  orderNumber: string;
  trackingUrl: string;
  serviceName: string;
  servicePriceCents: number;
  returnShippingFeeCents: number;
  totalCents: number;
  paymentLinkUrl: string;
};

export function subject({ orderNumber }: PaymentLinkEmailProps): string {
  return `Payment link for order #${orderNumber} — ECU Service Lab`;
}

export function PaymentLinkEmail({
  orderNumber,
  trackingUrl,
  serviceName,
  servicePriceCents,
  returnShippingFeeCents,
  totalCents,
  paymentLinkUrl,
}: PaymentLinkEmailProps) {
  return (
    <EmailLayout previewText={`Your payment link for order #${orderNumber} is ready.`}>
      <p style={{ margin: "0 0 12px" }}>
        Compatibility for order <strong>#{orderNumber}</strong> is confirmed. Here&apos;s your order
        summary:
      </p>
      <table width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 12px", fontSize: 14 }}>
        <tbody>
          <tr>
            <td style={{ padding: "4px 0", color: "#52525b" }}>{serviceName}</td>
            <td style={{ padding: "4px 0", textAlign: "right" }}>{formatCents(servicePriceCents)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 0", color: "#52525b" }}>Return shipping</td>
            <td style={{ padding: "4px 0", textAlign: "right" }}>{formatCents(returnShippingFeeCents)}</td>
          </tr>
          <tr>
            <td style={{ padding: "8px 0 0", borderTop: "1px solid #e4e4e7", fontWeight: 700 }}>Total</td>
            <td style={{ padding: "8px 0 0", borderTop: "1px solid #e4e4e7", textAlign: "right", fontWeight: 700 }}>
              {formatCents(totalCents)}
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ margin: "0 0 12px" }}>
        Inbound shipping (you → us) is free. Pay securely with Stripe to get started — packing
        instructions and an order slip will follow once payment is received.
      </p>
      <EmailButton href={paymentLinkUrl}>Pay now</EmailButton>
      <p style={{ margin: "16px 0 0", fontSize: 12, color: "#71717a" }}>
        Or track your order anytime: <a href={trackingUrl}>{trackingUrl}</a>
      </p>
    </EmailLayout>
  );
}
