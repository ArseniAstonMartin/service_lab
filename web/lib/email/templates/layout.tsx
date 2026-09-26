/**
 * Shared wrapper for every transactional email template (TASK-041).
 * Plain TSX, not @react-email/components — rendered to a static HTML
 * string by lib/email/send.ts via react-dom/server, so only inline
 * styles are used (no <style> tag, no CSS classes: most email clients
 * strip or ignore both).
 */
export function EmailLayout({
  previewText,
  children,
}: {
  /** Short text some email clients show next to the subject in the inbox list. */
  previewText: string;
  children: React.ReactNode;
}) {
  return (
    <html>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: "#f4f4f5",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        {/* Hidden preview text -- not shown in the rendered body, only
            picked up by inbox list previews in clients that read it. */}
        <div style={{ display: "none", overflow: "hidden", lineHeight: 1, opacity: 0, maxHeight: 0, maxWidth: 0 }}>
          {previewText}
        </div>
        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
          <tbody>
            <tr>
              <td align="center" style={{ padding: "24px 16px" }}>
                <table
                  width="100%"
                  style={{ maxWidth: 480, backgroundColor: "#ffffff", borderRadius: 8 }}
                  cellPadding={0}
                  cellSpacing={0}
                  role="presentation"
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: "24px 28px", color: "#18181b", fontSize: 14, lineHeight: 1.5 }}>
                        <p style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>ECU Service Lab</p>
                        {children}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function EmailButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        display: "inline-block",
        marginTop: 16,
        padding: "10px 20px",
        backgroundColor: "#18181b",
        color: "#ffffff",
        borderRadius: 6,
        textDecoration: "none",
        fontWeight: 600,
        fontSize: 14,
      }}
    >
      {children}
    </a>
  );
}
