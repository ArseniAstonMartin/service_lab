export const SITE_HOSTS = {
  marketing: "best-auto-repair.com",
  order: "order.best-auto-repair.com",
  admin: "admin.best-auto-repair.com",
} as const;

export type Site = keyof typeof SITE_HOSTS;
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function siteUrls(host?: string | null): Record<Site, string> {
  const authority = (host ?? "").toLowerCase();
  if (/^(?:(?:order|admin)\.)?localhost(?::\d+)?$/.test(authority)) {
    const port = authority.match(/:\d+$/)?.[0] ?? "";
    return {
      marketing: `http://localhost${port}`,
      order: `http://order.localhost${port}`,
      admin: `http://admin.localhost${port}`,
    };
  }
  if (/^127\.0\.0\.1(?::\d+)?$/.test(authority)) {
    return {
      marketing: `http://${authority}`,
      order: `http://${authority}`,
      admin: `http://${authority}`,
    };
  }
  // Preview deployments keep all routes together and never send testing traffic
  // or credentials to production. Only platform hostnames are accepted here.
  if (/^[a-z0-9-]+\.vercel\.app$/.test(authority)) {
    return {
      marketing: `https://${authority}`,
      order: `https://${authority}`,
      admin: `https://${authority}`,
    };
  }
  return {
    marketing: `https://${SITE_HOSTS.marketing}`,
    order: `https://${SITE_HOSTS.order}`,
    admin: `https://${SITE_HOSTS.admin}`,
  };
}

export type RoutingDecision = {
  kind: "next" | "rewrite" | "redirect";
  pathname: string;
  origin?: string;
  admin: boolean;
  loginPath: string;
};

export function routeForHost(host: string, pathname: string, method = "GET"): RoutingDecision {
  const hostname = host.toLowerCase().split(":")[0];
  const urls = siteUrls(host);
  const isAdminHost = hostname === SITE_HOSTS.admin || hostname === "admin.localhost";
  const isOrderHost = hostname === SITE_HOSTS.order || hostname === "order.localhost";
  const isMarketingHost =
    hostname === SITE_HOSTS.marketing || hostname === `www.${SITE_HOSTS.marketing}`;
  const base = { pathname, admin: false, loginPath: isAdminHost ? "/login" : "/admin/login" };
  // Preserve existing Stripe webhook and Blob upload URLs on every host.
  if (
    under(pathname, "/api") ||
    under(pathname, "/_next") ||
    /\.(?:webp|png|jpg|svg|ico|woff2|css|js)$/.test(pathname) ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  )
    return { ...base, kind: "next" };
  const orderPath = under(pathname, "/order") || under(pathname, "/track");
  if ((isMarketingHost || isAdminHost) && orderPath)
    return { ...base, kind: "redirect", origin: urls.order };
  if ((isMarketingHost || isOrderHost) && under(pathname, "/admin"))
    return { ...base, kind: "redirect", origin: urls.admin, pathname: pathname.slice(6) || "/" };
  if (isAdminHost) {
    if (under(pathname, "/admin") && (method === "GET" || method === "HEAD"))
      return { ...base, kind: "redirect", pathname: pathname.slice(6) || "/" };
    const internalPath = under(pathname, "/admin")
      ? pathname
      : `/admin${pathname === "/" ? "" : pathname}`;
    return {
      ...base,
      kind: internalPath === pathname ? "next" : "rewrite",
      pathname: internalPath,
      admin: true,
    };
  }
  if (isOrderHost) {
    if (pathname === "/") return { ...base, kind: "redirect", pathname: "/order/vehicle" };
    if (!orderPath) return { ...base, kind: "redirect", origin: urls.marketing };
  }
  // Serve www as a marketing alias: Vercel may already redirect the apex
  // there. Redirecting it back in middleware would create a platform loop.
  // localhost / Vercel preview retain the original path-based admin access.
  return { ...base, kind: "next", admin: under(pathname, "/admin") };
}
