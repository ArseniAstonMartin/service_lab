import { EmailButton, EmailLayout } from "./layout";

/**
 * Email #5 (PRD section 9): sent to ADMIN_NOTIFICATION_EMAIL on every
 * new order submission (both the matched and pending_review paths) --
 * registered from placeOrder in TASK-042, alongside email #1.
 *
 * Deliberately includes the sticker photo URL as a plain link rather
 * than an inline <img>: several email clients block remote images by
 * default, and this is an internal admin alert, not customer-facing
 * marketing, so a click-through link is simpler and more reliable than
 * fighting image-blocking.
 */
export type AdminNewOrderEmailProps = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  partNumber: string;
  stickerPhotoUrl: string | null;
  adminOrderUrl: string;
};

export function subject({ orderNumber }: AdminNewOrderEmailProps): string {
  return `New order #${orderNumber}`;
}

export function AdminNewOrderEmail({
  orderNumber,
  customerName,
  customerEmail,
  customerPhone,
  partNumber,
  stickerPhotoUrl,
  adminOrderUrl,
}: AdminNewOrderEmailProps) {
  return (
    <EmailLayout previewText={`New order #${orderNumber} from ${customerName}.`}>
      <p style={{ margin: "0 0 12px" }}>
        New order <strong>#{orderNumber}</strong> was just submitted.
      </p>
      <table width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 12px", fontSize: 14 }}>
        <tbody>
          <tr>
            <td style={{ padding: "2px 0", color: "#52525b" }}>Customer</td>
            <td style={{ padding: "2px 0" }}>{customerName}</td>
          </tr>
          <tr>
            <td style={{ padding: "2px 0", color: "#52525b" }}>Email</td>
            <td style={{ padding: "2px 0" }}>{customerEmail}</td>
          </tr>
          <tr>
            <td style={{ padding: "2px 0", color: "#52525b" }}>Phone</td>
            <td style={{ padding: "2px 0" }}>{customerPhone}</td>
          </tr>
          <tr>
            <td style={{ padding: "2px 0", color: "#52525b" }}>Part number</td>
            <td style={{ padding: "2px 0", fontFamily: "monospace" }}>{partNumber}</td>
          </tr>
        </tbody>
      </table>
      {stickerPhotoUrl ? (
        <p style={{ margin: "0 0 12px" }}>
          <a href={stickerPhotoUrl}>View the sticker photo</a>
        </p>
      ) : null}
      <EmailButton href={adminOrderUrl}>Open order in admin</EmailButton>
    </EmailLayout>
  );
}
