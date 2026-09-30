import test from "node:test";
import assert from "node:assert/strict";
import { decideMatch } from "../../lib/domain/compatibility";
import { quote } from "../../lib/domain/quote";

test("confirmed coverage remains selectable while an administrator sets its price", () => {
  const service = { id: "battery", name: "Tesla Battery Reset", priceCents: null };
  assert.deepEqual(decideMatch({ id: "part" }, [service]), {
    matched: true, entryId: "part", services: [service],
  });
  assert.equal(decideMatch({ id: "part" }, []).matched, false);
});

test("unconfigured service prices cannot produce payment quotes", () => {
  for (const price of [0, -100, NaN, 1.5]) {
    assert.throws(() => quote(price, 2500), /positive service price/);
  }
  assert.throws(() => quote(10000, -1), /shipping fee/);
  assert.deepEqual(quote(10000, 2500), {
    servicePriceCents: 10000, returnShippingFeeCents: 2500, totalCents: 12500,
  });
});
