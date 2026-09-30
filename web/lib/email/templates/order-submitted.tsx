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
  return `Order #${orderNumber} received — Best Auto Repair`;
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
          Our team is reviewing your request before confirming the service and price.
          We&apos;ll email you the next steps and a payment link once the review is complete.
        </p>
      )}
      <p style={{ margin: "0 0 12px" }}>Track your order status anytime with the link below.</p>
      <EmailButton href={trackingUrl}>Track my order</EmailButton>
    </EmailLayout>
  );
}
