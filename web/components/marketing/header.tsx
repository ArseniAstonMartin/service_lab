"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Menu, Search, X } from "lucide-react";
import { MARKETING_SERVICES } from "@/lib/marketing";

export function MarketingHeader({ orderUrl }: { orderUrl: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    setMobileOpen(false);
    setServicesOpen(false);
  }, [pathname]);
  return (
    <header className="m-header">
      <a className="m-skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="m-header-inner">
        <Link href="/" className="m-brand" aria-label="Best Auto Repair home">
          <span>
            Best <b>Auto Repair</b>
          </span>
          <small>AUTO REPAIR · ELECTRONICS · PROGRAMMING</small>
        </Link>
        <button
          className="m-mobile-toggle"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          aria-controls="marketing-navigation"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X /> : <Menu />}
        </button>
        <nav
          id="marketing-navigation"
          className={`m-nav ${mobileOpen ? "is-open" : ""}`}
          aria-label="Main navigation"
        >
          <div
            className="m-dropdown"
            onKeyDown={(event) => {
              if (event.key === "Escape") setServicesOpen(false);
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setServicesOpen(false);
            }}
          >
            <button
              aria-expanded={servicesOpen}
              aria-controls="services-menu"
              onClick={() => setServicesOpen(!servicesOpen)}
            >
              Services <ChevronDown size={12} />
            </button>
            {servicesOpen && (
              <div id="services-menu" className="m-dropdown-panel">
                <Link href="/services">
                  All services <ArrowRight size={15} />
                </Link>
                {MARKETING_SERVICES.map((service) => (
                  <Link key={service.slug} href={`/services/${service.slug}`}>
                    {service.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Link href="/ecu-models">ECU &amp; Models</Link>
          <Link href="/mail-in-service">Mail-in Service</Link>
          <Link href="/services/auto-repair">Auto Repair</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <form className="m-header-search" action="/ecu-models" role="search">
          <Search size={16} aria-hidden="true" />
          <input
            name="q"
            aria-label="Search modules or part numbers"
            placeholder="Search modules, part numbers…"
            maxLength={100}
          />
        </form>
        <a className="m-header-book" href={`${orderUrl}/order/vehicle`}>
          Book Service
        </a>
      </div>
    </header>
  );
}
