import type { MetadataRoute } from "next";
import { headers } from "next/headers";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "";
  if (host !== "best-auto-repair.com" && host !== "www.best-auto-repair.com")
    return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/order", "/track", "/api"] },
    sitemap: "https://best-auto-repair.com/sitemap.xml",
  };
}
