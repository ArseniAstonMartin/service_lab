import { EmailButton, EmailLayout } from "./layout";

/**
 * Email #4 (PRD section 9): sent when an order moves to
 * ready_shipped_back -- registered as that status's side effect in
 * TASK-043. Includes the return tracking number only when one was set
 * on the order (an admin-entered, optional field -- TASK-032).
 */
export type ReadyShippedBackEmailProps = {
  orderNumber: string;
  trackingUrl: string;
  returnTrackingNo: string | null;
};

export function subject({ orderNumber }: ReadyShippedBackEmailProps): string {
  return `Order #${orderNumber} is on its way back to you`;
}

export function ReadyShippedBackEmail({
  orderNumber,
  trackingUrl,
  returnTrackingNo,
}: ReadyShippedBackEmailProps) {
  return (
    <EmailLayout previewText={`Order #${orderNumber} is ready and on its way back to you.`}>
      <p style={{ margin: "0 0 12px" }}>
        Your module for order <strong>#{orderNumber}</strong> is ready and on its way back to you.
      </p>
      {returnTrackingNo ? (
        <p style={{ margin: "0 0 12px" }}>
          Return tracking number: <strong>{returnTrackingNo}</strong>
        </p>
      ) : null}
      <EmailButton href={trackingUrl}>Track my order</EmailButton>
    </EmailLayout>
  );
}
