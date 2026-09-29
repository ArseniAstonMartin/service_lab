import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/ui";
import { ServiceCards, ClosingBanner } from "@/components/marketing/sections";
import { requestSiteUrls } from "@/lib/site-urls";
export const metadata: Metadata = { title: "Services", alternates: { canonical: "/services" } };
export default async function ServicesPage() {
  const urls = await requestSiteUrls();
  return (
    <>
      <PageIntro
        eyebrow="Our services"
        title="Complete care. From the road to the circuit board."
        description="Explore local vehicle services and specialist module support. Every electronic operation is checked against your specific module before it is confirmed."
      />
      <section className="m-container m-page-section">
        <ServiceCards />
      </section>
      <ClosingBanner orderUrl={urls.order} />
    </>
  );
}
