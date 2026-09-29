import Image from "next/image";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { BUSINESS } from "@/lib/marketing";
import { ActionLink, PageIntro } from "@/components/marketing/ui";
export const metadata: Metadata = {
  title: "Local Auto Repair in Kapolei",
  alternates: { canonical: "/auto-repair" },
};
export default function AutoRepairPage() {
  return (
    <>
      <PageIntro
        eyebrow="Local auto service"
        title="Your next mile starts with the right care."
        description="Mechanical care and electronic diagnostics in Kapolei, Oahu. Call to discuss your vehicle and arrange a visit."
      />
      <section className="m-container m-page-section m-detail-grid">
        <div>
          <h2>Let’s talk about your vehicle.</h2>
          <p>
            Whether you are planning maintenance or tracking down a warning light, start by telling
            us what you are experiencing. We will discuss the next steps and arrange an appointment.
          </p>
          <ul className="m-check-list">
            {[
              "Maintenance and mechanical repair inquiries",
              "Vehicle diagnostics and warning-light assessment",
              "Electronic module and immobilizer support",
              "Hybrid battery assessment inquiries",
            ].map((text) => (
              <li key={text}>
                <Check />
                {text}
              </li>
            ))}
          </ul>
          <ActionLink href={BUSINESS.phoneHref} icon="none">
            {BUSINESS.phone}
          </ActionLink>
        </div>
        <div>
          <Image
            className="m-wide-photo"
            src="/images/marketing/workshop.webp"
            width={1536}
            height={1024}
            alt="Automotive workshop illustration"
          />
          <div className="m-callout">
            <h3>Visit by appointment</h3>
            <p>
              {BUSINESS.address}
              <br />
              {BUSINESS.locality}
              <br />
              Call to arrange a visit.
            </p>
            <a href={BUSINESS.mapsUrl} target="_blank" rel="noreferrer">
              Get directions ↗
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
