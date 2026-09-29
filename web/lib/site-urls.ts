import "server-only";
import { headers } from "next/headers";
import { siteUrls } from "@/lib/domain/site-routing";

export async function requestSiteUrls() {
  return siteUrls((await headers()).get("host"));
}

/** Used outside requests for mail/payment links. Production defaults are split. */
export function notificationSiteUrls() {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL)
    return siteUrls(process.env.VERCEL_URL);
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SITE_URL) {
    return siteUrls(new URL(process.env.NEXT_PUBLIC_SITE_URL).host);
  }
  return siteUrls();
}
