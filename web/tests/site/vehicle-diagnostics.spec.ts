import { expect, test } from "@playwright/test";

// Smoke test for the Vehicle Diagnostics category (requiresPartNumber
// false): part number/photo section hidden, one "Continue" click skips
// /order/service entirely (only one Service exists for this category)
// straight to /order/details, matched automatically, price is "Quote
// after review" until an admin configures the DIAGNOSTIC tier. Never
// submits an order.
test("Vehicle Diagnostics skips part number/photo and /order/service, landing on Details in one click", async ({
  page,
}) => {
  await page.goto("/order/vehicle");

  // Part number/photo section is hidden by default, before any category
  // is picked -- it should only ever appear for a category that needs one.
  await expect(page.getByText("Part number & photo", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check compatibility", exact: false })).toHaveCount(0);

  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Ford", exact: true }).click();
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "F-150", exact: true }).click();
  await page.getByRole("combobox").nth(2).click();
  await page.getByRole("option", { name: "2020", exact: true }).click();

  await page.getByRole("button", { name: "Vehicle Diagnostics", exact: true }).click();
  await expect(page.getByText("Part number & photo", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Part Number", { exact: true })).toHaveCount(0);
  // No optional preview button either -- nothing to preview for this category.
  await expect(page.getByRole("button", { name: "Check compatibility", exact: false })).toHaveCount(0);

  // One click: no separate "check" confirmation step, and /order/service
  // is skipped entirely (only one Service in this category).
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/order\/details$/);

  // No module-specific wording or questions for this category: the
  // description label is swapped, and the generic FOLLOW_UP set ("...
  // after this module is reinstalled") is excluded entirely -- neither
  // applies when there's no module involved.
  await expect(page.getByText("Describe what's going on with your vehicle")).toBeVisible();
  await expect(page.getByText("what happened to the module", { exact: false })).toHaveCount(0);
  await expect(page.getByText("after this module is reinstalled", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("radiogroup")).toHaveCount(0);

  await page.locator("#description").fill("Dashboard warning light check; no order will be submitted.");
  await page.locator("#question-symptoms").fill("ABS and traction control lights on intermittently.");
  await page.locator("#question-when_started").fill("Started about a week ago, happens randomly.");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page).toHaveURL(/\/order\/shipping$/);
  await expect(page.getByText(/Quote after review\. Your selected service is supported/)).toBeVisible();
  await expect(page.getByText("$0.00", { exact: true })).toHaveCount(0);

  // No module ever gets shipped back for this category: no return
  // address section at all (heading says just "Contact"), and the
  // free-shipping line (which only ever made sense for a mailed-in
  // module anyway) is gone from this step entirely, for every category.
  await expect(page.getByRole("heading", { name: "Contact", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contact & return address" })).toHaveCount(0);
  await expect(page.getByLabel("Return address — street", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("ZIP code", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Shipping your module", { exact: false })).toHaveCount(0);
  // The pre-existing stickerPhotoUrl-required guard blocked every
  // Vehicle Diagnostics submission outright (state.stickerPhotoUrl is
  // correctly null for this category, not a missing field) -- confirms
  // Place order is actually reachable, without clicking it for real.
  await expect(page.getByRole("button", { name: "Place order", exact: true })).toBeEnabled();
});

test("a regular (part-number) category still shows the optional preview button, separate from Continue", async ({
  page,
}) => {
  await page.goto("/order/vehicle");
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Ford", exact: true }).click();
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "F-150", exact: true }).click();
  await page.getByRole("combobox").nth(2).click();
  await page.getByRole("option", { name: "2020", exact: true }).click();

  await page.getByRole("button", { name: "ECM/PCM", exact: true }).click();
  await expect(page.getByText("Part number & photo", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Check compatibility (optional)", exact: true }),
  ).toBeVisible();
  // Continue exists and is disabled until the part number/photo are
  // filled -- it's the required action, but it's never enabled without
  // the fields a part-number category actually needs.
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
});
