import { expect, test, type Page } from "@playwright/test";

// Reads the configured coverage database. Never uploads files or submits orders.
async function chooseTesla(page: Page, category: string) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("ecu-wizard-state")) {
      sessionStorage.setItem("ecu-wizard-state", JSON.stringify({
        stickerPhotoUrl: "https://test.public.blob.vercel-storage.com/tesla-test.png",
      }));
    }
  });
  await page.route("https://test.public.blob.vercel-storage.com/**", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"),
  }));
  await page.goto("/order/vehicle");
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Tesla", exact: true }).click();
  await page.getByRole("combobox").nth(1).click();
  await expect(page.getByRole("option", { name: "All", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "MODEL Y", exact: true }).click();
  await page.getByRole("combobox").nth(2).click();
  await expect(page.getByRole("option", { name: "2000", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "2024", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: category, exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

test("Tesla battery coverage reaches service, questions and quote review", async ({ page }) => {
  await chooseTesla(page, "Battery/BMS");
  await page.getByLabel("Part Number", { exact: true }).fill("1598486-00-D");
  await page.getByRole("button", { name: "Check compatibility" }).click();
  await expect(page.getByText("Found it — 1 service confirmed for this part.")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const service = page.getByRole("radio", { name: /Tesla Battery Reset/ });
  await expect(service).toContainText("Quote after review");
  await expect(page.getByText("Crash Data Reset", { exact: true })).toHaveCount(0);
  await service.click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator("#description").fill("Coverage regression check; no order will be submitted.");
  await page.locator("#question-battery_fault_history").fill("Module needs review after a battery replacement.");
  await page.locator("#question-battery_error_codes").fill("Unknown; will provide diagnostics.");
  await page.getByRole("radiogroup", { name: /original 16V/ }).getByRole("button", { name: "Yes" }).click();
  // Existing common follow-up questions may also be required by the catalog.
  for (const group of await page.getByRole("radiogroup").all()) {
    if (!await group.locator('[aria-pressed="true"]').count()) await group.getByRole("button", { name: "No", exact: true }).click();
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/\/order\/shipping$/);
  await expect(page.getByText(/Quote after review\. Your selected service is supported/)).toBeVisible();
  await expect(page.getByText("$0.00", { exact: true })).toHaveCount(0);
});

test("Tesla SRS uses canonical OEM numbers and rejects battery numbers", async ({ page }) => {
  await chooseTesla(page, "Airbag/SRS");
  await page.getByLabel("Part Number", { exact: true }).fill("1598486-00-D");
  await page.getByRole("button", { name: "Check compatibility" }).click();
  await expect(page.getByText(/We don't have this part number confirmed yet/)).toBeVisible();
  await page.getByLabel("Part Number", { exact: true }).fill("1512876-00-D");
  await page.getByRole("button", { name: "Check compatibility" }).click();
  await expect(page.getByText("Found it — 1 service confirmed for this part.")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Crash Data Reset/ })).toBeVisible();
  await expect(page.getByText("Tesla Battery Reset", { exact: true })).toHaveCount(0);
});
