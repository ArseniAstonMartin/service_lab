# Marketing visual assets

The layout reference is [`Main Page.PNG`](../Main%20Page.PNG). Its original
brand and unverified performance claims were replaced with Best Auto Repair's
supplied identity, appointment-only hours and part-specific service language.

Four custom images were generated with the built-in image generation tool on
2026-09-29. They are illustrative automotive scenes, not photographs of this
business, staff or premises. No third-party stock images or logo files are used.
Original PNGs remain in the local Codex generated-images directory; deployed
copies use WebP quality 85, about 660 KiB combined. This format conversion uses
Sharp; it does not alter the generated scenes.

## Generation briefs and saved assets

- [`hero.webp`](../web/public/images/marketing/hero.webp): premium widescreen
  automotive photograph; silver luxury sedan in front three-quarter view on
  the right, modern dark workshop at the far right, distant mountains and soft
  blue morning sky. Silver, slate and ice-blue palette. Bright, low-detail space
  on the left for the headline. No text, logos, watermarks, people or UI.
- [`services.webp`](../web/public/images/marketing/services.webp): one contact
  sheet containing exactly eight square workshop photographs in a four-column,
  two-row grid, without gutters or labels. Top row: mechanic at a wheel on a
  lift, diagnostic laptop inside a car, deployed steering-wheel airbag, silver
  ECU. Bottom row: circuit board, hybrid battery, smart key, open foam-lined
  shipping box containing an ECU. Cool, consistent lighting and centered subjects.
  CSS selects the individual tiles without separate downloads.
- [`workshop.webp`](../web/public/images/marketing/workshop.webp): wide 16:9
  photograph of a clean industrial service bay, bright white and cool grey,
  black car on a blue lift on the right; airy, softly blurred left half for copy.
  No people, signs or logos. Used as an illustrative local-service background.
- [`road.webp`](../web/public/images/marketing/road.webp): very wide premium
  automotive photograph; dark graphite sedan in rear three-quarter view on the
  right of a winding mountain road at sunset, golden horizon and cool blue
  shadows. Dark, low-detail left half for the closing call to action. No text
  or logos.

## Visual verification

`node web/tests/site/capture.mjs` (from the repository root with the server
running) captures the landing at 1440px, 1068px and 390px, plus contact and
directory pages. Default output: `/tmp/best-auto-repair-screenshots/`.
Use `SITE_SCREENSHOTS` to select another output directory. Keep screenshots
and originals out of runtime bundles.
