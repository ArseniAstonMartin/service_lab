// Run with the production server running: node tests/site/capture.mjs
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const output = process.env.SITE_SCREENSHOTS ?? "/tmp/best-auto-repair-screenshots";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
try {
  for (const [name, width, height, path] of [
    ["desktop", 1440, 1000, "/"],
    ["reference-width", 1068, 1000, "/"],
    ["mobile", 390, 844, "/"],
    ["contact-mobile", 390, 844, "/contact"],
    ["directory", 1440, 1000, "/ecu-models"],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"}${path}`);
    await page.locator("main").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      await Promise.all(Array.from(document.images, (img) => img.decode()));
    });
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    console.log(
      `${name}: ${output}/${name}.png; overflow=${await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
