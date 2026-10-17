import { expect, test, type Page } from "@playwright/test";

// Reads the configured coverage database. Never uploads files or submits orders.
async function chooseTesla(page: Page, category: string, options: { seedPhoto?: boolean } = {}) {
  const { seedPhoto = true } = options;
  await page.addInitScript((seed) => {
    if (seed && !sessionStorage.getItem("ecu-wizard-state")) {
      sessionStorage.setItem("ecu-wizard-state", JSON.stringify({
        stickerPhotoUrl: "https://test.public.blob.vercel-storage.com/tesla-test.png",
      }));
    }
  }, seedPhoto);
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
  // Vehicle, module, and part number/photo are now one combined step
  // (/order/vehicle) instead of three separate pages, so there's no
  // "Next" between picking the vehicle and picking the module.
  await page.getByRole("button", { name: category, exact: true }).click();
}

test("Tesla battery coverage reaches service, questions and current admin pricing", async ({ page }) => {
  await chooseTesla(page, "Battery/BMS");
  await page.getByLabel("Part Number", { exact: true }).fill("1598486-00-D");
  await page.getByRole("button", { name: "Check compatibility" }).click();
  await expect(page.getByText("Found it — 1 service confirmed for this part.")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const service = page.getByRole("radio", { name: /Tesla Battery Reset/ });
  await expect(service).toBeVisible();
  const requiresQuote = await page.evaluate(() => JSON.parse(sessionStorage.getItem("ecu-wizard-state")!).matchResult.services[0].priceCents === null);
  if (requiresQuote) await expect(service).toContainText("Quote after review");
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
  if (requiresQuote) {
    await expect(page.getByText(/Quote after review\. Your selected service is supported/)).toBeVisible();
  } else {
    await expect(page.getByText("Total", { exact: true })).toBeVisible();
  }
  await expect(page.getByText("$0.00", { exact: true })).toHaveCount(0);
  // A real part-number category ships a module back -- the return
  // address section is still here, unlike Vehicle Diagnostics.
  await expect(page.getByRole("heading", { name: "Contact & return address" })).toBeVisible();
  await expect(page.getByLabel("Return address — street", { exact: true })).toBeVisible();
  await expect(page.getByText("Shipping your module", { exact: false })).toHaveCount(0);
});

test("Tesla SRS uses canonical OEM numbers and rejects battery numbers", async ({ page }) => {
  await chooseTesla(page, "Airbag/SRS");
  await page.getByLabel("Part Number", { exact: true }).fill("1598486-00-D");
  await page.getByRole("button", { name: "Check compatibility" }).click();
  await expect(
    page.getByText(
      "We couldn't confirm this part number in our system yet. To help us verify compatibility, please upload a photo of your module with part number visible.",
    ),
  ).toBeVisible();
  await page.getByLabel("Part Number", { exact: true }).fill("1512876-00-D");
  await page.getByRole("button", { name: "Check compatibility" }).click();
  await expect(page.getByText("Found it — 1 service confirmed for this part.")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Crash Data Reset/ })).toBeVisible();
  await expect(page.getByText("Tesla Battery Reset", { exact: true })).toHaveCount(0);
});

test("Tesla SRS: Continue requires a photo only once a check comes back not-matched", async ({ page }) => {
  await chooseTesla(page, "Airbag/SRS", { seedPhoto: false });
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  const checkButton = page.getByRole("button", { name: "Check compatibility", exact: true });

  // Hidden and not required before any check has run.
  await expect(page.getByText(/upload a photo of your module/)).toHaveCount(0);
  await page.getByLabel("Part Number", { exact: true }).fill("1598486-00-D");
  // Typing a part number alone is enough to enable both buttons -- no
  // photo needed yet.
  await expect(continueButton).toBeEnabled();
  await expect(checkButton).toBeEnabled();

  // Clicking Continue itself (not just the preview button) runs the
  // check -- and a fresh not-matched result stays on this page instead
  // of navigating on, revealing the now-required photo upload.
  await continueButton.click();
  await expect(page).toHaveURL(/\/order\/vehicle$/);
  await expect(
    page.getByText(
      "We couldn't confirm this part number in our system yet. To help us verify compatibility, please upload a photo of your module with part number visible.",
    ),
  ).toBeVisible();
  await expect(continueButton).toBeDisabled();
});
