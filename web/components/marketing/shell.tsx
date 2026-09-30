import Link from "next/link";
import { MapPin, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { requestSiteUrls } from "@/lib/site-urls";
import { BUSINESS } from "@/lib/marketing";
import { MarketingHeader } from "./header";

export async function MarketingShell({ children }: { children: ReactNode }) {
  const urls = await requestSiteUrls();
  return (
    <div className="marketing-site">
      <MarketingHeader orderUrl={urls.order} />
      <main id="main-content">{children}</main>
      <footer className="m-footer">
        <div className="m-container m-footer-inner">
          <div>
            <Link href="/" className="m-brand">
              <span>
                Best <b>Auto Repair</b>
              </span>
            </Link>
            <p>Local expertise. Nationwide module service.</p>
          </div>
          <div>
            <a href={BUSINESS.mapsUrl} target="_blank" rel="noreferrer">
              <MapPin size={15} /> {BUSINESS.address}, {BUSINESS.locality}
              <ArrowUpRight size={13} />
            </a>
            <span>By appointment · Contact us to arrange a visit</span>
          </div>
          <div className="m-footer-links">
            <Link href="/mail-in-service">Mail-in service</Link>
            <Link href="/contact">Contact us</Link>
            <a href={`${urls.admin}/admin`}>Staff sign in</a>
          </div>
        </div>
        <div className="m-footer-bottom m-container">
          <span>© {new Date().getFullYear()} Best Auto Repair. All rights reserved.</span>
          <span>Kapolei, Oahu · Serving customers across the U.S.</span>
        </div>
      </footer>
    </div>
  );
}
