import type { Metadata } from "next";
import { Check } from "lucide-react";
import { MAIL_FAQS } from "@/lib/marketing";
import { requestSiteUrls } from "@/lib/site-urls";
import { ActionLink, PageIntro } from "@/components/marketing/ui";
import { MailInSteps } from "@/components/marketing/sections";
export const metadata: Metadata = {
  title: "Nationwide Mail-In Module Service",
  alternates: { canonical: "/mail-in-service" },
};
export default async function MailInPage() {
  const urls = await requestSiteUrls();
  return (
    <>
      <PageIntro
        eyebrow="Mail-in service"
        title="Specialist module support. Wherever you are."
        description="Send your automotive module to our Hawaii-based lab. Start with compatibility, receive clear instructions, and follow your order through its return journey."
      />
      <section className="m-page-mail-steps">
        <div className="m-container">
          <MailInSteps />
        </div>
      </section>
      <section className="m-container m-page-section m-detail-grid">
        <div>
          <h2>Start with the right information.</h2>
          <ul className="m-check-list">
            {[
              "Vehicle make, model, and year",
              "Module category and exact catalog part number",
              "A clear photo of the complete module label",
              "A description of the fault and the work requested",
              "Original and donor details for cloning inquiries",
            ].map((text) => (
              <li key={text}>
                <Check />
                {text}
              </li>
            ))}
          </ul>
          <ActionLink href={`${urls.order}/order/vehicle`} icon="package">
            Start a Mail-In Request
          </ActionLink>
        </div>
        <div className="m-note">
          <strong>Pack with care. Ship with instructions.</strong>Protect connectors, use a suitable
          protective bag and cushioning, and include the order packing slip. Wait for your order’s
          shipping instructions before sending anything. Some services require both the original and
          donor modules; others may need programming on the vehicle after installation.
        </div>
      </section>
      <section className="m-container m-page-section m-faq">
        <p className="m-eyebrow">GOOD TO KNOW</p>
        <h2>Your mail-in questions, answered.</h2>
        {MAIL_FAQS.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
    </>
  );
}
