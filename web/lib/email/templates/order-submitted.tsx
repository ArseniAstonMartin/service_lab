import { EmailButton, EmailLayout } from "./layout";

/**
 * Email #1 (PRD section 9): sent to the customer right after
 * placeOrder's commit, on BOTH paths (matched or pending_review) --
 * "next steps" copy differs by path since a pending_review order still
 * needs a manual compatibility confirmation before it can be paid.
 */
export type OrderSubmittedEmailProps = {
  orderNumber: string;
  trackingUrl: string;
  matched: boolean;
};

export function subject({ orderNumber }: OrderSubmittedEmailProps): string {
  return `Order #${orderNumber} received — ECU Service Lab`;
}

export function OrderSubmittedEmail({ orderNumber, trackingUrl, matched }: OrderSubmittedEmailProps) {
  return (
    <EmailLayout previewText={`We received order #${orderNumber}.`}>
      <p style={{ margin: "0 0 12px" }}>Hi,</p>
      <p style={{ margin: "0 0 12px" }}>
        We received your order <strong>#{orderNumber}</strong>.
      </p>
      {matched ? (
        <p style={{ margin: "0 0 12px" }}>
          Your part number matched our compatibility database. A Stripe payment link with your
          order total is on its way in a separate email — once you pay, we&apos;ll send packing
          instructions for shipping the module to us.
        </p>
      ) : (
        <p style={{ margin: "0 0 12px" }}>
          We couldn&apos;t automatically confirm compatibility for your part number, so our team is
          reviewing it manually. We&apos;ll email you a payment link as soon as compatibility is
          confirmed.
        </p>
      )}
      <p style={{ margin: "0 0 12px" }}>Track your order status anytime with the link below.</p>
      <EmailButton href={trackingUrl}>Track my order</EmailButton>
    </EmailLayout>
  );
}
