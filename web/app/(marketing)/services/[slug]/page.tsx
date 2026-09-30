import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { MARKETING_SERVICES } from "@/lib/marketing";
import { requestSiteUrls } from "@/lib/site-urls";
import { ActionLink, PageIntro, PhotoTile } from "@/components/marketing/ui";
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
            {service.local ? "Contact Us to Arrange a Visit" : "Check Your Module"}
          </ActionLink>
        </div>
        <div className="m-detail-photo">
          <PhotoTile index={service.image} label={service.title} />
          <div className="m-callout">
            <h3>
              {service.local ? "Here for you in Kapolei" : "Not sure if your module is supported?"}
            </h3>
            <p>
              {service.local
                ? "Visit by appointment at 91-1018 Lipo St, Kapolei, Hawaii."
                : "Start with the catalog part number on the label. If we cannot confirm a match, your request goes to manual review."}
            </p>
            <Link href="/contact">Contact us ↗</Link>
          </div>
        </div>
      </section>
    </>
  );
}
