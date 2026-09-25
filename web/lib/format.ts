/**
 * UI-facing formatting helpers. Money is stored and computed in integer
 * cents everywhere in the database and server code (see tasks.json's
 * "money" convention); this is the one place that turns cents into a
 * dollar string for display, so every screen formats prices the same way.
 */

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number): string {
  return currencyFormatter.format(cents / 100);
}
