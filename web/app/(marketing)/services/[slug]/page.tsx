import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { MARKETING_SERVICES, MOBILE_SERVICES } from "@/lib/marketing";
import { requestSiteUrls } from "@/lib/site-urls";
import { ActionLink, PageIntro, PhotoTile, ServiceIcon } from "@/components/marketing/ui";
export function generateStaticParams() {
  return MARKETING_SERVICES.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = MARKETING_SERVICES.find((s) => s.slug === slug);
  return {
    title: service?.title ?? "Service",
    description: service?.short,
    alternates: { canonical: `/services/${slug}` },
  };
}
export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = MARKETING_SERVICES.find((s) => s.slug === slug);
  if (!service) notFound();
  const urls = await requestSiteUrls();
  // The old standalone /auto-repair page (mobile framing + a 5-card
  // service grid) was merged into this shared template rather than kept
  // as its own route -- special-cased here since no other service needs
  // the extra card-grid section. The banner (PhotoTile at service.image)
  // is deliberately untouched: it's the same image this page already
  // used before the merge.
  const isAutoRepair = slug === "auto-repair";
  return (
    <>
      <PageIntro eyebrow={service.title} title={service.intro} description={service.description} />
      <section className="m-container m-page-section m-detail-grid">
        <div>
          <h2>How we can help</h2>
          <ul className="m-check-list">
            {service.details.map((detail) => (
              <li key={detail}>
                <Check />
                {detail}
              </li>
            ))}
          </ul>
          <div className="m-note">
            <strong>Before you get started</strong>
            {service.prepare}
          </div>
          <ActionLink
            href={service.local ? "/contact" : `${urls.order}/order/vehicle`}
            icon={service.local ? "calendar" : "package"}
          >
            {service.local
              ? isAutoRepair
                ? "Request Mobile Service"
                : "Contact Us to Arrange a Visit"
              : "Check Your Module"}
          </ActionLink>
        </div>
        <div className="m-detail-photo">
          <PhotoTile index={service.image} label={service.title} />
          <div className="m-callout">
            <h3>
              {isAutoRepair
                ? "We come to you"
                : service.local
                  ? "Here for you in Kapolei"
                  : "Not sure if your module is supported?"}
            </h3>
            <p>
              {isAutoRepair
                ? "By appointment. Tell us your location when you reach out — we bring the diagnostic and repair equipment to you."
                : service.local
                  ? "Visit by appointment at 91-1018 Lipo St, Kapolei, Hawaii."
                  : "Start with the catalog part number on the label. If we cannot confirm a match, your request goes to manual review."}
            </p>
            <Link href="/contact">Contact us ↗</Link>
          </div>
        </div>
      </section>
      {isAutoRepair ? (
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
            {MOBILE_SERVICES.map(({ icon, title, text }) => (
              <div className="m-mobile-service-card" key={title}>
                <span>
                  <ServiceIcon name={icon} size={22} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
