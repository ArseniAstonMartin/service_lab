# ECU Service Lab — Automotive Module Compatibility & Repair Service Platform

B2B/B2C digital intake and reverse-logistics platform for an automotive
electronics engineering lab on Oahu, Hawaii, repairing/cloning/reprogramming
vehicle ECUs, ECMs and SRS modules. Built on Oracle APEX.

Source of truth for scope: `PRD - Automotive Module Compatibility & Repair
Service.md`. Task breakdown and status: `tasks.json`. Session log:
`progress.md`.

## Stack

- Oracle APEX 26.1.3 on apex.oracle.com (Free Evaluation Workspace, public shared instance)
- SQL Workshop / SQLcl for schema and package deployment
- PL/SQL packages for all business logic
- ORDS for the Stripe webhook
- APEX_MAIL for transactional email, APEX_WEB_SERVICE for Stripe API calls
- Stripe Payment Links for payment collection

## Applications

| App    | ID    | Purpose                                      | Auth                  |
|--------|-------|-----------------------------------------------|------------------------|
| f92606 | 92606 | Public app — wizard, confirmation, tracking    | No Authentication      |
| f94517 | 94517 | Admin app — orders, review queue, pricing      | Oracle APEX Accounts  |

App IDs 100/200 were this project's original naming convention (the
"f100"/"f200" shorthand still shows up in some task-tracking notes), but
those specific IDs were already taken by other apps in this shared
apex.oracle.com workspace (WKSP_HAWAIIAUTOMOTIVE) -- App Builder assigned
92606 and 94517 instead when the apps were created (TASK-009).

## Repository layout

```
database/
  ddl/        Tables, constraints, indexes, triggers, views — NNN_name.sql, applied in order
  packages/   pkg_*.pks / pkg_*.pkb — one spec + body per package
  seed/       Reference and test data (MERGE-based, re-runnable)
  ords/       ORDS REST module definitions (e.g. the Stripe webhook)
  tests/      Standalone .sql test scripts (constraint/negative tests, package unit tests)
  install.sql Master script: ddl -> packages -> seed -> ords
apex/
  f92606.sql  Export of the public app
  f94517.sql  Export of the admin app
```

## Environment setup checklist (TASK-001)

These steps need to be run once, interactively, against the target APEX
workspace by whoever holds the Oracle Cloud / APEX credentials — they can't
be completed from an automated coding session without that access. Record
the results below (or in a follow-up commit) once done.

**Status: verified 2026-09-23.** Platform is **apex.oracle.com** (Free
Evaluation Workspace, a public shared Oracle APEX instance) — the OCI/DBA/
VCN/network-ACL steps below (item 4) don't apply here: there is no DBA or
network ACL layer for an individual workspace to request against on this
platform, and outbound HTTPS for APEX_WEB_SERVICE / APEX_MAIL is enabled by
default for all workspaces.

1. **APEX / DB version** — in App Builder, go to Help → About to confirm the
   APEX version and database version. Record both here:
   - APEX version: **26.1.3**
   - Database version: shared Autonomous Database behind apex.oracle.com (not
     separately provisioned/visible to this workspace)
2. **Workspace / parsing schema** — in SQL Workshop → SQL Commands, run:
   ```sql
   SELECT USER FROM dual;
   ```
   Record the workspace name and parsing schema:
   - Workspace: **WKSP_HAWAIIAUTOMOTIVE**
   - Verified 2026-09-23 with `SELECT sysdate, user FROM dual;` in SQL Workshop
     → SQL Commands — executed successfully.
3. **Required grants** — confirm the parsing schema can use the packages
   below (a failing test call means a missing grant to note here):
   ```sql
   -- DBMS_CRYPTO
   SELECT DBMS_CRYPTO.RANDOMBYTES(16) FROM dual;
   -- APEX_WEB_SERVICE (should not raise ORA-06550/PLS-00201)
   BEGIN NULL; END;
   /
   -- APEX_MAIL
   BEGIN NULL; END; -- replace with an APEX_MAIL.SEND smoke test once TASK-027 lands
   /
   -- ORDS
   -- Confirm ORDS is enabled for the workspace under
   -- Workspace Utilities -> RESTful Services
   ```
   Missing grants: none found blocking `SELECT ... FROM dual`. The DBMS_CRYPTO/
   APEX_WEB_SERVICE/APEX_MAIL/ORDS smoke tests above will be run for real as
   part of TASK-011 (pkg_security, first DBMS_CRYPTO use) and TASK-027 (first
   APEX_MAIL use) — note any ORA-06550/missing-grant error here if one turns up.
4. **Network ACL** — an ACL (or an Autonomous Database network access
   control list entry) must allow outbound HTTPS to `api.stripe.com` and to
   the SMTP relay host used for transactional email (see TASK-027). Request
   this from the DBA/Oracle Cloud admin if not already present. Status:
   **N/A on apex.oracle.com** — this is a public shared evaluation instance
   with no DBA-managed VCN/ACL layer exposed to individual workspaces;
   outbound HTTPS from APEX_WEB_SERVICE/APEX_MAIL is available by default.
   Re-verify with a real APEX_WEB_SERVICE call to api.stripe.com once
   TASK-030 (pkg_stripe) lands.
5. **Applying DDL/packages/seed** — once the DDL/package/seed files exist:
   - Open SQL Workshop → SQL Scripts → Upload and run `database/install.sql`
     (upload the whole `database/` folder structure, or run each `@@`
     target's contents via SQLcl `@database/install.sql` from that
     directory so relative paths resolve).
   - Review the script output for errors before continuing.
6. **Importing the apps** — after `apex/f92606.sql` and `apex/f94517.sql` exist
   (TASK-009), import each via App Builder → Import, or SQLcl:
   ```
   apex import apex/f92606.sql
   apex import apex/f94517.sql
   ```
7. **Exporting an app after a change** — anytime an app (f92606/f94517) is
   changed in App Builder, re-export and commit it:
   ```
   apex export -applicationid 92606 -dir apex
   apex export -applicationid 94517 -dir apex
   ```
   Never hand-edit `apex/f92606.sql` or `apex/f94517.sql` directly.

## From-scratch install

1. Provision or select an Oracle Autonomous Database (ATP) workspace.
2. Complete the checklist above (TASK-001).
3. Run `database/install.sql` (see step 5 above) once the DDL/package/seed
   scripts referenced by it exist.
4. Import `apex/f92606.sql` and `apex/f94517.sql` (see step 6 above).
5. Create an admin user for f94517 under Administration → Manage Users (no
   public self sign-up — see TASK-034).

## Bulk compatibility import (TASK-044)

`pkg_import` loads a CSV file of known-good vehicle/Part Number/service
combinations into the live compatibility catalog (`COMPATIBILITY_ENTRY`/
`COMPATIBILITY_SERVICE`, both with `SOURCE = 'IMPORT'`) in three steps —
`pkg_import.start_batch` (stage), `validate_batch` (mark each row VALID/
INVALID with a reason), `apply_batch` (MERGE the VALID rows in). A staging
table, `COMPAT_IMPORT_STG`, holds every row between these steps so a bad
row can be diagnosed — and, once TASK-045's f94517 Page 31 exists, previewed
— before anything is committed to the live catalog.

### CSV format

One row per (vehicle, category, Part Number) combination, six columns:

| Column           | Required | Format                                                                 |
|-------------------|----------|-------------------------------------------------------------------------|
| `MAKE`            | yes      | Free text, ≤ 50 characters.                                             |
| `MODEL`           | yes      | Free text, ≤ 50 characters.                                             |
| `YEAR`            | yes      | A single 4-digit model year, 1980–2100 — **not** a range. A Make/Model spanning several years needs one row per year (matching how `VEHICLE_REF` itself stores one row per model year, not a `YEAR_FROM`/`YEAR_TO` range). |
| `CATEGORY`        | yes      | One of the 5 fixed module categories (`Airbag/SRS`, `ECM/PCM`, `TCM/TCU`, `BCM`, `Instrument Cluster`) — matched case-insensitively. |
| `PART_NUMBER`     | yes      | The Part Number this row confirms compatibility for, ≤ 100 characters. Normalized to `UPPER(TRIM())` on write, same as everywhere else in this schema. |
| `SERVICE_NAMES`   | yes      | One or more `SERVICE.NAME` values confirmed supported for this Part Number, **pipe-separated** (e.g. `Cloning\|VIN Write`) — matched case-insensitively against services in the row's own `CATEGORY` only; a service name that exists but belongs to a different category is still an error. |

Example:

```csv
MAKE,MODEL,YEAR,CATEGORY,PART_NUMBER,SERVICE_NAMES
Toyota,Camry,2018,ECM/PCM,89661-0XXXX,Cloning|VIN Write
Honda,Civic,2019,Airbag/SRS,77960-TBA-A01,Crash Data Reset
```

### Workflow

1. Parse the uploaded CSV into `pkg_import.t_row_input_tab` (one entry per
   data row, header excluded) and call `start_batch` — returns a
   `BATCH_ID` (format `IMPB-<timestamp>-<random>`) and stages every row as
   `PENDING`, unvalidated.
2. Call `validate_batch(batch_id)`. Every `PENDING` row becomes `VALID` or
   `INVALID`; an `INVALID` row's `ERROR_TEXT` lists every problem found
   with it (missing/oversized field, bad year, unknown category, unknown
   or wrong-category service name, ...), not just the first.
3. (TASK-045) Preview the batch — `TABLE(pkg_import.get_batch_rows(batch_id))`
   — so an admin can see each row's status/error before committing.
4. Call `apply_batch(batch_id, applied_count, skipped_count)`. Every
   `VALID` row is MERGEd into `VEHICLE_REF`/`COMPATIBILITY_ENTRY`/
   `COMPATIBILITY_SERVICE` and marked `APPLIED`; every non-`VALID` row is
   left alone and counted in `skipped_count`. Safe to call more than once
   on the same batch (a second call applies nothing further, since no
   `VALID` rows remain) and safe to import overlapping data across several
   batches over time — every write is a `MERGE` on the same natural/unique
   keys those tables already enforce, so nothing is ever duplicated.

Two provenance rules worth knowing when mixing imports with admin review
(`pkg_review.confirm_compatibility`, TASK-040):

- An import **never downgrades** an entry an admin already confirmed
  (`SOURCE = 'ADMIN_CONFIRMED'`) back to `'IMPORT'` — an admin's explicit
  per-order confirmation is treated as the stronger signal, in either
  direction (`pkg_review` DOES upgrade an `'IMPORT'` entry to
  `'ADMIN_CONFIRMED'` when an admin confirms it).
- An import's service links are **additive only** — it adds a link if
  missing, but never removes one that's already there. This is the
  opposite of `pkg_review.confirm_compatibility`, which fully replaces the
  linked-service set for the one order it's confirming; an import is
  understood as "here is more confirmed data", not "here is the complete,
  authoritative list".

## Always Free considerations (TASK-050)

An Always Free ATP instance can be reclaimed after a period of inactivity.
Mitigation and the paid-upgrade path will be documented here once TASK-050
is implemented.
