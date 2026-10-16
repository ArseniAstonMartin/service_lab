import type { Metadata } from "next";
import { Clock3, MapPin, Phone } from "lucide-react";
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
        description="Tell us what your vehicle needs. Call to arrange a local appointment or use the form for service and module inquiries."
      />
      <section className="m-container m-page-section m-contact-grid">
        <div className="m-contact-details">
          <div>
            <Phone />
            <div>
              <h2>Give us a call</h2>
              <a href={BUSINESS.phoneHref}>{BUSINESS.phone}</a>
              <p>For appointments and service questions.</p>
            </div>
          </div>
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
