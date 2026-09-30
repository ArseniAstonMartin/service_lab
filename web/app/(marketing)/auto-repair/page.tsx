import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { BatteryCharging, Check, Disc3, Monitor, Power, Zap } from "lucide-react";
import { ActionLink, PageIntro } from "@/components/marketing/ui";
export const metadata: Metadata = {
  title: "Mobile Car Repair & Diagnostics in Kapolei",
  alternates: { canonical: "/auto-repair" },
};

/**
 * Scoped to this page only — a small, fixed list of the mobile-repair
 * services requested for this specific card layout. Not the same list
 * as MARKETING_SERVICES (lib/marketing.ts), which drives the sitewide
 * /services catalog, header dropdown, and home page; that list covers a
 * broader (and partly module-electronics) set of offerings and isn't
 * touched here.
 */
const MOBILE_SERVICES = [
  {
    icon: Monitor,
    title: "Mobile Car Diagnostics",
    text: "Warning lights and drivability issues diagnosed on-site with professional scan tools.",
  },
  {
    icon: Disc3,
    title: "Brake Pad Replacement",
    text: "Worn brake pads replaced at your location, front or rear.",
  },
  {
    icon: Power,
    title: "Starter Replacement",
    text: "A no-crank or intermittent-start issue traced and the starter replaced on-site.",
  },
  {
    icon: BatteryCharging,
    title: "Alternator Replacement",
    text: "Charging-system faults diagnosed and the alternator replaced where you are.",
  },
  {
    icon: Zap,
    title: "Electrical Troubleshooting",
    text: "Wiring, sensor, and electrical-fault diagnosis for issues other shops can't pin down.",
  },
] as const;

export default function AutoRepairPage() {
  return (
    <>
      <PageIntro
        eyebrow="Mobile auto service"
        title="We come to you — repair and diagnostics on your schedule."
        description="On-site mobile diagnostics and repair across Oahu. Tell us what's going on and we'll bring the right tools to your driveway, workplace, or roadside."
      />
      <section className="m-container m-page-section m-detail-grid">
        <div>
          <h2>Let’s talk about your vehicle.</h2>
          <p>
            Whether you are tracking down a warning light or need a repair done without a shop
            visit, start by telling us what you are experiencing. We will discuss the next steps
            and arrange a mobile appointment at your location.
          </p>
          <ul className="m-check-list">
            {[
              "On-site diagnostics — no shop visit required",
              "Brake, starter, and alternator replacement at your location",
              "Electrical fault-finding and troubleshooting",
              "Electronic module and immobilizer support",
            ].map((text) => (
              <li key={text}>
                <Check />
                {text}
              </li>
            ))}
          </ul>
          <ActionLink href="/contact">Request Mobile Service</ActionLink>
        </div>
        <div>
          <Image
            className="m-wide-photo"
            src="/images/marketing/road.webp"
            width={2172}
            height={724}
            alt="A car on the road, representing mobile, on-location vehicle service"
          />
          <div className="m-callout">
            <h3>Serving Kapolei & Oahu</h3>
            <p>
              By appointment.
              <br />
              Tell us your location when you reach out — we bring the diagnostic and repair
              equipment to you.
            </p>
            <Link href="/contact">Contact us ↗</Link>
          </div>
        </div>
      </section>
      <section className="m-container m-page-section">
        <div className="m-section-heading">
          <div>
            <p className="m-eyebrow">WHAT WE COVER ON-SITE</p>
            <h2>Popular mobile services</h2>
          </div>
          <p>
            A starting point, not the full list — tell us what your vehicle needs and we’ll let
            you know if it’s a good fit for a mobile visit.
          </p>
        </div>
        <div className="m-mobile-services">
          {MOBILE_SERVICES.map(({ icon: Icon, title, text }) => (
            <div className="m-mobile-service-card" key={title}>
              <span>
                <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
