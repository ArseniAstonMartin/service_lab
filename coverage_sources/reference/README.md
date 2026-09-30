# Vehicle identity references

`tesla-vehicles.json` records model/year observations from the official
[NHTSA vPIC API](https://vpic.nhtsa.dot.gov/api/), including each query URL and
retrieval time. The Tesla Airbag and Battery Reset workbooks omit model/year;
this independent reference supplies real choices for the checkout dropdowns.

These records identify vehicles only. They do **not** establish part fitment,
module availability, or supported operations. Module coverage remains tied to
the exact make, category, OEM part number and explicit operation in the vendor
workbook. Unknown applicability stays in a hidden brand-level container.

Refresh from `web/` with:

```sh
node scripts/coverage/fetch-tesla-vehicles.mjs
npm run coverage:tesla
```

Review snapshot changes before applying an import. The snapshot makes normal
imports deterministic and offline; it is hashed in the import manifest. The
2026-09-30 snapshot contains 56 vehicle identities across eight model names.
