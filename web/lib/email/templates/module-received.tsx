import { EmailButton, EmailLayout } from "./layout";

/**
 * Email #3 (PRD section 9): sent when an order moves to
 * block_received -- registered as that status's side effect in
 * TASK-043. Confirms receipt only; no follow-up email for the
 * intermediate in_progress status (explicitly not automated in v1).
 */
export type ModuleReceivedEmailProps = {
  orderNumber: string;
  trackingUrl: string;
};

export function subject({ orderNumber }: ModuleReceivedEmailProps): string {
  return `We received your module — order #${orderNumber}`;
}

export function ModuleReceivedEmail({ orderNumber, trackingUrl }: ModuleReceivedEmailProps) {
  return (
    <EmailLayout previewText={`We received the module for order #${orderNumber}.`}>
      <p style={{ margin: "0 0 12px" }}>
        Good news — we received your module for order <strong>#{orderNumber}</strong>.
      </p>
      <p style={{ margin: "0 0 12px" }}>
        We&apos;ll get started on the service you selected and email you again once it&apos;s ready
        and on its way back to you.
      </p>
      <EmailButton href={trackingUrl}>Track my order</EmailButton>
    </EmailLayout>
  );
}
