import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/shell";
import "./marketing.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://best-auto-repair.com"),
  title: {
    default: "Best Auto Repair | Auto Service & Car Electronics in Kapolei",
    template: "%s | Best Auto Repair",
  },
  description:
    "Auto repair and automotive electronics in Kapolei, Oahu. Explore diagnostics, module services, and nationwide mail-in support. Call +1 (808) 743-4377.",
  openGraph: {
    siteName: "Best Auto Repair",
    type: "website",
    images: [
      {
        url: "/images/marketing/hero.webp",
        width: 1660,
        height: 948,
        alt: "Automotive service and electronics",
      },
    ],
  },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
