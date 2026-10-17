import { expect, test } from "@playwright/test";

// Drives the full /book-mobile-service wizard UI. Never actually clicks
// Submit: that would both write a real row to the live database and
// POST to the real external n8n webhook, same "never submits for
// real" discipline tests.site/tesla.spec.ts and
// vehicle-diagnostics.spec.ts already apply to the ECU order flow.

test("contact step requires valid fields before moving on", async ({ page }) => {
  await page.goto("http://order.localhost:3000/book-mobile-service/contact");
  await expect(page.getByRole("heading", { name: "Let's get started." })).toBeVisible();

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // Required-field validation blocks navigation -- still on step 1.
  await expect(page).toHaveURL(/\/book-mobile-service\/contact$/);
  await expect(page.getByText("Required").first()).toBeVisible();

  await page.getByLabel("First name", { exact: true }).fill("Leilani");
  await page.getByLabel("Last name", { exact: true }).fill("Kahale");
  await page.getByLabel("Email", { exact: true }).fill("leilani@example.com");
  await page.getByLabel("Phone number", { exact: true }).fill("808-555-0100");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/book-mobile-service\/vehicle$/);
});

test("deep-linking to a later step without earlier data redirects back", async ({ page }) => {
  await page.goto("http://order.localhost:3000/book-mobile-service/services");
  await expect(page).toHaveURL(/\/book-mobile-service\/contact$/);
});

test("vehicle step enables Continue only once make/model/year are all set", async ({ page }) => {
  await page.goto("http://order.localhost:3000/book-mobile-service/contact");
  await page.getByLabel("First name", { exact: true }).fill("Leilani");
  await page.getByLabel("Last name", { exact: true }).fill("Kahale");
  await page.getByLabel("Email", { exact: true }).fill("leilani@example.com");
  await page.getByLabel("Phone number", { exact: true }).fill("808-555-0100");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page).toHaveURL(/\/book-mobile-service\/vehicle$/);
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  await expect(continueButton).toBeDisabled();

  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Ford", exact: true }).click();
  await expect(continueButton).toBeDisabled();
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "F-150", exact: true }).click();
  await expect(continueButton).toBeDisabled();
  await page.getByRole("combobox").nth(2).click();
  await page.getByRole("option", { name: "2020", exact: true }).click();
  await expect(continueButton).toBeEnabled();

  await continueButton.click();
  await expect(page).toHaveURL(/\/book-mobile-service\/services$/);
});

test("services step: accordion opens descriptions, plus adds to the selected list, cross removes", async ({
  page,
}) => {
  await page.goto("http://order.localhost:3000/book-mobile-service/contact");
  await page.getByLabel("First name", { exact: true }).fill("Leilani");
  await page.getByLabel("Last name", { exact: true }).fill("Kahale");
  await page.getByLabel("Email", { exact: true }).fill("leilani@example.com");
  await page.getByLabel("Phone number", { exact: true }).fill("808-555-0100");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Ford", exact: true }).click();
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "F-150", exact: true }).click();
  await page.getByRole("combobox").nth(2).click();
  await page.getByRole("option", { name: "2020", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page).toHaveURL(/\/book-mobile-service\/services$/);
  // No selected-services section, note field, or Submit button yet --
  // nothing has been added.
  await expect(page.getByText("Selected services", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);

  // Accordion: clicking the row opens the description, without adding it.
  const oilChangeRow = page.getByRole("button", { name: "Oil & Filter Change", exact: true });
  await oilChangeRow.click();
  await expect(
    page.getByText("Fresh oil and a new filter, matched to your vehicle's manufacturer interval."),
  ).toBeVisible();
  await expect(page.getByText("Selected services", { exact: true })).toHaveCount(0);

  // Plus adds it to the selected list at the top.
  await page.getByRole("button", { name: "Add Oil & Filter Change", exact: true }).click();
  await expect(page.getByText("Selected services", { exact: true })).toBeVisible();
  const selectedItem = page.getByRole("listitem").filter({ hasText: "Oil & Filter Change" });
  await expect(selectedItem).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeVisible();

  // Adding it again is a no-op (no duplicate row).
  await expect(page.getByRole("button", { name: "Oil & Filter Change added", exact: true })).toBeDisabled();
  await expect(page.getByRole("listitem").filter({ hasText: "Oil & Filter Change" })).toHaveCount(1);

  // Add a second service too.
  await page.getByRole("button", { name: "Add Tire Rotation", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Tire Rotation" })).toBeVisible();

  // The cross icon on the selected-list entry removes it.
  await selectedItem.getByRole("button", { name: "Remove Oil & Filter Change" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Oil & Filter Change" })).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: "Tire Rotation" })).toBeVisible();

  // The note field exists once at least one service is selected.
  await page.getByLabel(/Anything we should know/).fill("Please call ahead; gate code is 1234.");
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
});
