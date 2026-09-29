import assert from "node:assert/strict";
import test from "node:test";
import { routeForHost, siteUrls, SITE_HOSTS } from "../../lib/domain/site-routing";
import { contactSchema, parseDirectorySearch } from "../../lib/domain/contact";

test("production hosts separate marketing, checkout and protected admin", () => {
  assert.equal(routeForHost(SITE_HOSTS.marketing, "/").kind, "next");
  assert.equal(routeForHost(SITE_HOSTS.order, "/").pathname, "/order/vehicle");
  assert.deepEqual(routeForHost(SITE_HOSTS.admin, "/orders/42"), {
    kind: "rewrite",
    pathname: "/admin/orders/42",
    admin: true,
    loginPath: "/login",
  });
  assert.equal(routeForHost(SITE_HOSTS.admin, "/login").pathname, "/admin/login");
  assert.equal(
    routeForHost(SITE_HOSTS.order, "/services").origin,
    `https://${SITE_HOSTS.marketing}`,
  );
});

test("old deep links retain their path on the right host", () => {
  assert.equal(
    routeForHost(SITE_HOSTS.marketing, "/track/token/slip").origin,
    `https://${SITE_HOSTS.order}`,
  );
  assert.equal(
    routeForHost(SITE_HOSTS.marketing, "/order/compatibility").pathname,
    "/order/compatibility",
  );
  const admin = routeForHost(SITE_HOSTS.marketing, "/admin/orders/42");
  assert.equal(admin.origin, `https://${SITE_HOSTS.admin}`);
  assert.equal(admin.pathname, "/orders/42");
  assert.equal(routeForHost(SITE_HOSTS.admin, "/admin/orders").pathname, "/orders");
  assert.equal(routeForHost(SITE_HOSTS.admin, "/admin/orders", "POST").admin, true);
});

test("webhooks, upload endpoints and shared assets are never rewritten", () => {
  for (const host of Object.values(SITE_HOSTS)) {
    for (const path of [
      "/api/webhooks/stripe",
      "/api/uploads/token",
      "/_next/image",
      "/images/marketing/hero.webp",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      assert.equal(routeForHost(host, path).kind, "next", `${host}${path}`);
    }
  }
});

test("host and path boundaries prevent accidental routing and host reflection", () => {
  assert.equal(routeForHost(SITE_HOSTS.marketing, "/administrator").kind, "next");
  assert.equal(routeForHost(SITE_HOSTS.marketing, "/orders").kind, "next");
  assert.equal(routeForHost("admin.best-auto-repair.com.evil.test", "/").admin, false);
  assert.equal(routeForHost("ADMIN.BEST-AUTO-REPAIR.COM:443", "/").admin, true);
  assert.equal(siteUrls("evil.test").order, `https://${SITE_HOSTS.order}`);
  assert.equal(siteUrls("preview.vercel.app.evil.test").admin, `https://${SITE_HOSTS.admin}`);
  assert.equal(routeForHost("www.best-auto-repair.com", "/about").kind, "next");
});

test("local subdomains and Vercel previews stay in their own environment", () => {
  assert.equal(siteUrls("admin.localhost:3000").order, "http://order.localhost:3000");
  assert.equal(routeForHost("admin.localhost:3000", "/pricing").pathname, "/admin/pricing");
  assert.equal(siteUrls("feature-abc.vercel.app").order, "https://feature-abc.vercel.app");
  assert.equal(routeForHost("feature-abc.vercel.app", "/admin/orders").admin, true);
  assert.equal(routeForHost("localhost:3000", "/admin/login").loginPath, "/admin/login");
});

test("contact inputs reject header injection, bad recipients and unbounded messages", () => {
  const valid = {
    name: "Test Customer",
    email: "customer@example.com",
    phone: "",
    topic: "Diagnostics",
    message: "Please help diagnose a warning light.",
    website: "",
  };
  assert.equal(contactSchema.safeParse(valid).success, true);
  for (const change of [
    { name: "Name\r\nBcc: injected" },
    { email: "not-email" },
    { topic: "Injected topic" },
    { message: "short" },
    { message: "a".repeat(3001) },
  ]) {
    assert.equal(contactSchema.safeParse({ ...valid, ...change }).success, false);
  }
});

test("directory parameters tolerate malformed or repeated URL values", () => {
  assert.deepEqual(parseDirectorySearch({ q: ["a", "b"], make: ["x"], page: "Infinity" }), {
    q: "",
    make: "",
    page: 1,
  });
  assert.deepEqual(parseDirectorySearch({ q: "  77960  ", make: " Honda ", page: "2" }), {
    q: "77960",
    make: "Honda",
    page: 2,
  });
  assert.equal(parseDirectorySearch({ q: "x".repeat(200), page: "-4" }).q.length, 100);
});
