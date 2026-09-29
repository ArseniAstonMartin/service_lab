import Image from "next/image";
import type { Metadata } from "next";
import { PageIntro, ActionLink } from "@/components/marketing/ui";
import { WhyChooseUs } from "@/components/marketing/sections";
export const metadata: Metadata = { title: "About Us", alternates: { canonical: "/about" } };
export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="About Best Auto Repair"
        title="Local vehicle care. A closer look at the details."
        description="Based in Kapolei, Hawaii, Best Auto Repair brings vehicle service and automotive electronics together, with local appointments and a nationwide module mail-in process."
      />
      <section className="m-container m-page-section m-detail-grid">
        <div>
          <h2>
            Clear information.
            <br />
            Carefully matched service.
          </h2>
          <p>
            A control module is more than a box with a connector. Part numbers, hardware, software,
            and the requested operation all matter. Our process starts with understanding your
            vehicle and checking the details.
          </p>
          <p>
            For local customers, that starts with a conversation and an appointment. For mail-in
            customers, it starts with a label photo and a compatibility request. In both cases, the
            aim is the same: establish the right next step before work begins.
          </p>
          <ActionLink href="/contact" icon="none">
            Let’s Talk
          </ActionLink>
        </div>
        <Image
          className="m-wide-photo"
          src="/images/marketing/workshop.webp"
          width={1536}
          height={1024}
          alt="Illustration of a modern automotive service environment"
        />
      </section>
      <WhyChooseUs />
    </>
  );
}
