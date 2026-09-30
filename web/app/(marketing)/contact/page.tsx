import type { Metadata } from "next";
import { Clock3, MapPin } from "lucide-react";
import { BUSINESS } from "@/lib/marketing";
import { PageIntro } from "@/components/marketing/ui";
import { ContactForm } from "@/components/marketing/contact-form";
export const metadata: Metadata = {
  title: "Contact & Location",
  alternates: { canonical: "/contact" },
};
export default function ContactPage() {
  return (
    <>
      <PageIntro
        eyebrow="About & contact"
        title="Let’s get you moving."
        description="Tell us what your vehicle needs. Use the form below for service and module inquiries, or find our location and hours."
      />
      <section className="m-container m-page-section m-contact-grid">
        <div className="m-contact-details">
          <div>
            <MapPin />
            <div>
              <h2>Find us in Kapolei</h2>
              <p>
                {BUSINESS.address}
                <br />
                {BUSINESS.locality}
              </p>
              <a href={BUSINESS.mapsUrl} target="_blank" rel="noreferrer">
                Get directions ↗
              </a>
            </div>
          </div>
          <div>
            <Clock3 />
            <div>
              <h2>{BUSINESS.hours}</h2>
              <p>{BUSINESS.hoursDetail}</p>
            </div>
          </div>
        </div>
        <ContactForm />
      </section>
    </>
  );
}
