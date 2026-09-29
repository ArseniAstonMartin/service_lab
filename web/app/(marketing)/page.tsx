import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requestSiteUrls } from "@/lib/site-urls";
import { ActionLink } from "@/components/marketing/ui";
import {
  ClosingBanner,
  MailInSteps,
  ServiceCards,
  TrustStrip,
  TwoWays,
  WhyChooseUs,
} from "@/components/marketing/sections";
export const metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const urls = await requestSiteUrls();
  return (
    <>
      <section className="m-hero">
        <Image
          className="m-hero-image"
          src="/images/marketing/hero.webp"
          fill
          priority
          sizes="100vw"
          alt="Silver sports sedan outside a modern automotive workshop"
        />
        <div className="m-hero-shade" />
        <div className="m-container m-hero-content">
          <p className="m-eyebrow">MODERN VEHICLE SOLUTIONS</p>
          <h1>
            Auto Service &amp;
            <br />
            Car Electronics
            <br />
            <span>in One Place</span>
          </h1>
          <p className="m-hero-description">
            Complete auto care and advanced automotive electronics services. Visit us locally or
            mail in your control modules for supported programming, cloning, and reset services.
          </p>
          <div className="m-actions">
            <ActionLink href={`${urls.order}/order/vehicle`}>Book Service</ActionLink>
            <ActionLink href={`${urls.order}/order/vehicle`} secondary icon="package">
              Send a Module
            </ActionLink>
          </div>
          <TrustStrip />
        </div>
      </section>
      <section className="m-services-section">
        <div className="m-container m-section-heading">
          <div>
            <p className="m-eyebrow">OUR SERVICES</p>
            <h2>Complete Automotive Solutions</h2>
          </div>
          <p>
            From everyday vehicle care to specialist module services,
            <br className="m-desktop-break" /> find the right next step for your vehicle.
          </p>
          <Link className="m-text-link" href="/services">
            View All Services <ArrowRight size={16} />
          </Link>
        </div>
        <div className="m-wide">
          <ServiceCards />
        </div>
      </section>
      <section className="m-mail-section">
        <div className="m-container m-mail-layout">
          <div className="m-mail-intro">
            <p className="m-eyebrow">MAIL-IN SERVICE</p>
            <h2>
              Send Your Module
              <br />
              From Anywhere
            </h2>
            <p>
              Can’t visit in person? No problem. Our nationwide mail-in service connects you with
              automotive electronics support from wherever you are.
            </p>
            <ActionLink href={`${urls.order}/order/vehicle`} icon="package">
              Send a Module
            </ActionLink>
          </div>
          <MailInSteps />
        </div>
      </section>
      <TwoWays orderUrl={urls.order} />
      <WhyChooseUs />
      <ClosingBanner orderUrl={urls.order} />
    </>
  );
}
