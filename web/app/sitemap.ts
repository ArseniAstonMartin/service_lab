import type { MetadataRoute } from "next";
import { MARKETING_SERVICES } from "@/lib/marketing";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/services",
    "/ecu-models",
    "/mail-in-service",
    "/about",
    "/contact",
    ...MARKETING_SERVICES.map((service) => `/services/${service.slug}`),
  ].map((path) => ({
    url: `https://best-auto-repair.com${path}`,
    changeFrequency: "monthly",
    priority: path ? 0.7 : 1,
  }));
}
