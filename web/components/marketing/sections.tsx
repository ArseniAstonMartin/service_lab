import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Cpu,
  LockKeyhole,
  Package,
  Settings,
  ShieldCheck,
  UsersRound,
  Zap,
} from "lucide-react";
import { MARKETING_SERVICES, MAIL_STEPS } from "@/lib/marketing";
import { ActionLink, NationwideMap, PhotoTile, ServiceIcon } from "./ui";

export function ServiceCards() {
  return (
    <div className="m-services-grid">
      {MARKETING_SERVICES.map((service) => (
        <article className="m-service-card" key={service.slug}>
          <Link href={`/services/${service.slug}`} tabIndex={-1} aria-hidden="true">
            <PhotoTile index={service.image} label={service.title} />
          </Link>
          <div className="m-service-body">
            <span className={`m-service-icon m-icon-${service.icon}`}>
              <ServiceIcon name={service.icon} />
            </span>
            <h3>
              <Link href={`/services/${service.slug}`}>{service.title}</Link>
            </h3>
            <p>{service.short}</p>
            <Link className="m-text-link" href={`/services/${service.slug}`}>
              Learn More <ArrowRight size={14} />
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export function MailInSteps() {
  return (
    <div className="m-mail-steps">
      {MAIL_STEPS.map((step, index) => (
        <div className="m-mail-step" key={step.title}>
          <div className="m-step-photo">
            <PhotoTile index={step.image} label={step.title} />
            <span>{index + 1}</span>
          </div>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          {index < 2 && <ArrowRight className="m-step-arrow" aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}

export function TwoWays({ orderUrl }: { orderUrl: string }) {
  return (
    <section className="m-two-ways m-wide" aria-label="Two ways to work with us">
      <article className="m-local-panel">
        <div>
          <p className="m-eyebrow">TWO WAYS TO WORK WITH US</p>
          <h2>Local Auto Service</h2>
          <p>
            Visit us in Kapolei for vehicle care and diagnostics. Call ahead so we can give your
            vehicle the attention it deserves.
          </p>
          <ul>
            {[
              "Maintenance & repair assessment",
              "Advanced diagnostics",
              "Service matched to your vehicle",
              "Clear recommendations before work begins",
            ].map((text) => (
              <li key={text}>
                <Check />
                {text}
              </li>
            ))}
          </ul>
          <ActionLink href={`${orderUrl}/order/vehicle`} secondary icon="none">
            Book Local Service
          </ActionLink>
        </div>
      </article>
      <article className="m-nation-panel">
        <NationwideMap />
        <div>
          <h2>
            Nationwide Mail-In
            <br />
            Electronics Service
          </h2>
          <p>
            Send your module to our Hawaii-based lab for a supported programming, cloning, or reset
            service.
          </p>
          <ul>
            {[
              "ECU, TCU, BCM, SRS and cluster inquiries",
              "Part-number compatibility checks",
              "Careful handling and return packing",
              "Support from request to return",
            ].map((text) => (
              <li key={text}>
                <Check />
                {text}
              </li>
            ))}
          </ul>
          <ActionLink href={`${orderUrl}/order/vehicle`} secondary icon="none">
            Send a Module
          </ActionLink>
        </div>
      </article>
    </section>
  );
}

export function WhyChooseUs() {
  const reasons = [
    {
      icon: Zap,
      title: "Clear Turnaround",
      text: "Timing discussed for your specific module and service.",
    },
    {
      icon: Settings,
      title: "Advanced Tools",
      text: "Dedicated diagnostic and automotive programming equipment.",
    },
    {
      icon: ShieldCheck,
      title: "Professional Diagnostics",
      text: "A considered approach to mechanical and electronic faults.",
    },
    {
      icon: LockKeyhole,
      title: "Secure Handling",
      text: "Your modules are handled with care and checked before return.",
    },
  ];
  return (
    <section className="m-why m-container">
      <div className="m-section-heading">
        <div>
          <p className="m-eyebrow">WHY CHOOSE BEST AUTO REPAIR</p>
          <h2>Trusted Expertise. Real Results.</h2>
        </div>
        <p>
          Vehicle care and automotive electronics expertise, working together. Visit us locally or
          send your module from across the country.
        </p>
      </div>
      <div className="m-reasons">
        {reasons.map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <span>
              <Icon size={27} strokeWidth={1.7} />
            </span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ClosingBanner({ orderUrl }: { orderUrl: string }) {
  return (
    <section className="m-closing m-wide">
      <div>
        <p className="m-eyebrow">GET STARTED TODAY</p>
        <h2>Keep Your Vehicle Running at Its Best</h2>
        <p>
          Request local service or send your module for a supported
          <br className="m-desktop-break" /> programming, cloning, or reset operation.
        </p>
        <div className="m-actions">
          <ActionLink href={`${orderUrl}/order/vehicle`}>Book Service</ActionLink>
          <ActionLink href={`${orderUrl}/order/vehicle`} secondary icon="package">
            Send a Module
          </ActionLink>
        </div>
      </div>
      <div className="m-closing-icons">
        <span>
          <Settings />
          Auto Repair
        </span>
        <span>
          <Cpu />
          Electronic Service
        </span>
        <span>
          <UsersRound />
          Nationwide Support
        </span>
      </div>
    </section>
  );
}

export function TrustStrip() {
  return (
    <div className="m-trust-strip">
      <span>
        <ShieldCheck />
        Professional
        <br />
        &amp; Trusted
      </span>
      <span>
        <BadgeCheck />
        Advanced
        <br />
        Equipment
      </span>
      <span>
        <Package />
        In-Shop &amp;
        <br />
        Mail-In Service
      </span>
    </div>
  );
}
