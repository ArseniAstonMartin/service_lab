import { expect, test } from "@playwright/test";

test("desktop landing, dropdown and cross-host booking links", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Car Electronics");
  await expect(page.locator(".m-service-card")).toHaveCount(7);
  await expect.poll(() => page.locator(".m-hero-image").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(
    page.getByRole("link", { name: "Book Service", exact: true }).first(),
  ).toHaveAttribute("href", "http://order.localhost:3000/order/vehicle");
  await page.getByRole("button", { name: "Services", exact: true }).click();
  await page
    .locator("#services-menu")
    .getByRole("link", { name: "ECU / TCU / BCM Cloning" })
    .click();
  await expect(page).toHaveURL(/\/services\/module-cloning$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your original data. A compatible replacement.",
  );
  expect(errors).toEqual([]);
});

test("mobile navigation, appointment details and contact validation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Contact", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "By appointment" })).toBeVisible();
  await expect(page.getByText("Call to arrange a visit.", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /808.*743.*4377/ }).first()).toHaveAttribute(
    "href",
    "tel:+18087434377",
  );
  await page.getByRole("button", { name: "Send Message" }).click();
  expect(
    await page
      .locator("#contact-name")
      .evaluate((element: HTMLInputElement) => element.validity.valueMissing),
  ).toBe(true);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("directory uses real coverage and preserves manual-review cases", async ({ page }) => {
  await page.goto("/ecu-models");
  await expect(page.locator(".m-directory-table tbody tr")).toHaveCount(20);
  await expect(page.locator(".m-directory-status")).toContainText("matching entries");
  await expect(page.locator(".m-directory-table")).not.toContainText("All · 2000");
  await page.locator("#directory-query").fill("NO-MATCH-TEST-9X");
  await page.getByRole("button", { name: "Search Directory" }).click();
  await expect(page.getByRole("heading", { name: "No matching modules found." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a Compatibility Review" })).toBeVisible();
});

test("production host routing preserves queries and protects admin", async ({ request }) => {
  const redirects = [
    [
      "best-auto-repair.com",
      "/order/vehicle?ref=home",
      "https://order.best-auto-repair.com/order/vehicle?ref=home",
    ],
    [
      "best-auto-repair.com",
      "/admin/orders?status=pending_review",
      "https://admin.best-auto-repair.com/orders?status=pending_review",
    ],
    ["order.best-auto-repair.com", "/", "/order/vehicle"],
    ["admin.best-auto-repair.com", "/orders", "/login"],
    ["admin.best-auto-repair.com", "/admin/pricing", "/pricing"],
  ];
  for (const [host, path, location] of redirects) {
    const response = await request.get(path, { headers: { host }, maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain(location);
  }
  const login = await request.get("/login", { headers: { host: "admin.best-auto-repair.com" } });
  expect(login.status()).toBe(200);
  expect(await login.text()).toContain("Best Auto Repair admin panel");
  expect(login.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const robots = await request.get("/robots.txt", {
    headers: { host: "order.best-auto-repair.com" },
  });
  expect(await robots.text()).toContain("Disallow: /");
});

test("order subdomain loads the existing vehicle selection", async ({ page }) => {
  await page.goto("http://order.localhost:3000/");
  await expect(page).toHaveURL(/\/order\/vehicle$/);
  await expect(page.getByRole("heading", { name: "What's your vehicle?" })).toBeVisible();
  await expect(page.getByRole("combobox").first()).toBeEnabled();
});
