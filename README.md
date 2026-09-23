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

| App  | ID  | Purpose                                    | Auth                  |
|------|-----|---------------------------------------------|------------------------|
| f100 | 100 | Public app — wizard, confirmation, tracking | No Authentication       |
| f200 | 200 | Admin app — orders, review queue, pricing   | Oracle APEX Accounts    |

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
  f100.sql    Export of the public app
  f200.sql    Export of the admin app
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
6. **Importing the apps** — after `apex/f100.sql` and `apex/f200.sql` exist
   (TASK-009), import each via App Builder → Import, or SQLcl:
   ```
   apex import apex/f100.sql
   apex import apex/f200.sql
   ```
7. **Exporting an app after a change** — anytime an app (f100/f200) is
   changed in App Builder, re-export and commit it:
   ```
   apex export -applicationid 100 -dir apex
   apex export -applicationid 200 -dir apex
   ```
   Never hand-edit `apex/f100.sql` or `apex/f200.sql` directly.

## From-scratch install

1. Provision or select an Oracle Autonomous Database (ATP) workspace.
2. Complete the checklist above (TASK-001).
3. Run `database/install.sql` (see step 5 above) once the DDL/package/seed
   scripts referenced by it exist.
4. Import `apex/f100.sql` and `apex/f200.sql` (see step 6 above).
5. Create an admin user for f200 under Administration → Manage Users (no
   public self sign-up — see TASK-034).

## Always Free considerations (TASK-050)

An Always Free ATP instance can be reclaimed after a period of inactivity.
Mitigation and the paid-upgrade path will be documented here once TASK-050
is implemented.
