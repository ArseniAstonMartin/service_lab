import { expect, test } from "@playwright/test";

// Seeds the handoff record directly (lib/wizard/order-result.ts) instead
// of placing a real order -- same "never submit for real" discipline as
// tesla.spec.ts/vehicle-diagnostics.spec.ts.
test("confirmation shows Return to home and Place another order buttons", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "ecu-order-result",
      JSON.stringify({
        orderNumber: "123",
        trackingToken: "test-token",
        status: "awaiting_payment",
        matched: true,
        categoryName: "ECM/PCM",
        isCloning: false,
        originalPartNumber: null,
        donorPartNumber: null,
      }),
    );
  });
  await page.goto("http://order.localhost:3000/order/confirmation");

  await expect(page.getByRole("heading", { name: "Order submitted" })).toBeVisible();

  const homeLink = page.getByRole("link", { name: "Return to home", exact: true });
  await expect(homeLink).toHaveAttribute("href", "http://localhost:3000");
  const anotherOrderLink = page.getByRole("link", { name: "Place another order", exact: true });
  await expect(anotherOrderLink).toHaveAttribute("href", "/order/vehicle");
});
