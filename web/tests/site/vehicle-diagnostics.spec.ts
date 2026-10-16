import { expect, test } from "@playwright/test";

// Smoke test for the Vehicle Diagnostics category (requiresPartNumber
// false): no part number/photo step, matched automatically, price is
// "Quote after review" until an admin configures the DIAGNOSTIC tier.
// Never submits an order.
test("Vehicle Diagnostics skips part number/photo and reaches shipping as a quote-after-review service", async ({
  page,
}) => {
  await page.goto("/order/vehicle");
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Ford", exact: true }).click();
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "F-150", exact: true }).click();
  await page.getByRole("combobox").nth(2).click();
  await page.getByRole("option", { name: "2020", exact: true }).click();

  // Selecting Vehicle Diagnostics removes the part number/photo section.
  await page.getByRole("button", { name: "Vehicle Diagnostics", exact: true }).click();
  await expect(page.getByText("Part number & photo", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Part Number", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No part number needed", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Vehicle Diagnostics is available for your vehicle.")).toBeVisible();

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/order\/service$/);
  const service = page.getByRole("radio", { name: /Vehicle Diagnostics/ });
  await expect(service).toBeVisible();
  await expect(service).toContainText("Quote after review");
  await service.click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page).toHaveURL(/\/order\/details$/);
  await page.locator("#description").fill("Dashboard warning light check; no order will be submitted.");
  await page.locator("#question-symptoms").fill("ABS and traction control lights on intermittently.");
  await page.locator("#question-when_started").fill("Started about a week ago, happens randomly.");
  for (const group of await page.getByRole("radiogroup").all()) {
    if (!(await group.locator('[aria-pressed="true"]').count())) {
      await group.getByRole("button", { name: "No", exact: true }).click();
    }
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page).toHaveURL(/\/order\/shipping$/);
  await expect(page.getByText(/Quote after review\. Your selected service is supported/)).toBeVisible();
  await expect(page.getByText("$0.00", { exact: true })).toHaveCount(0);
});
