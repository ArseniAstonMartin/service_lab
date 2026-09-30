# Best Auto Repair — Automotive Service & Module Compatibility Platform

B2B/B2C digital intake and reverse-logistics platform for an automotive
electronics engineering lab on Oahu, Hawaii, repairing/cloning/reprogramming
vehicle ECUs, ECMs and SRS modules.

Source of truth for scope: `PRD - Automotive Module Compatibility & Repair
Service.md`. Task breakdown, status and session log (`tasks.json` /
`progress.md`) are tracked in the linked Claude Project, not in this repo.

> **Note:** this project was originally built on Oracle APEX + PL/SQL
> (apex.oracle.com). That implementation was functionally complete but has
> been retired in favor of a Next.js + Prisma + Supabase + Vercel rebuild,
> starting fresh from TASK-001. The old `apex/` and `database/` directories
> have been removed; the APEX build is only recoverable from git history
> (see commits before the rebuild).

## Stack

- Next.js (App Router) + TypeScript — one app for the public wizard, admin
  panel and API
- Tailwind CSS + shadcn/ui
- Prisma ORM on Supabase PostgreSQL (pooled connection for runtime, direct
  connection for migrations)
- Supabase Auth (email/password), admin only
- Vercel Blob with client uploads through signed tokens
- Stripe Node SDK — Payment Links + webhook Route Handler
- Resend for transactional email
- Hosting: Vercel (git-push deploys, preview deployments)

## Repository layout

```
web/
  app/(public)/   Public wizard, confirmation, tracking pages
  app/admin/      Admin panel (orders, review queue, pricing, compatibility)
  app/api/        Route Handlers (Stripe webhook, Blob upload token)
  lib/domain/     Pure business-rule functions (no framework imports)
  lib/actions/    Server Actions
  lib/email/      Email templates and the send helper
  components/ui/  shadcn/ui components
  components/wizard/, components/admin/
  prisma/         Schema and migrations
```

## Admin authentication

Admin access uses Supabase Auth (email/password). There is no public
sign-up flow — admin accounts are created manually.

**Disable public sign-ups** in the Supabase dashboard: Authentication →
Providers → Email → turn off "Allow new users to sign up". This must be
done once per environment (the Supabase project is shared across
Preview/Production in this setup).

**Create an admin user** in the Supabase dashboard: Authentication →
Users → **Add user** → email + password (auto-confirm), or **Send
invite**. Admins are Supabase Auth users, not Prisma rows — do not
insert into `auth.users` by hand, and there is no seed/bypass script.

Then open `/admin/login` (local: `http://localhost:3000/admin/login`,
production: `https://ecu-service-lab.vercel.app/admin/login`) and sign in
with that email and password. Any user that exists in this project's
Supabase Auth is treated as an admin — there is no separate role table
(public sign-up is disabled, so only dashboard-created users can log in).

Middleware (`middleware.ts`) refreshes the session on every request and
redirects unauthenticated visits to `/admin/*` pages to `/admin/login`.
Server Actions and Route Handlers are **not** covered by middleware — each
one that needs admin access must call `requireAdmin()` from
`lib/supabase/require-admin.ts` explicitly.

## Getting started

```
cd web
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

`npm run build` must pass before any task is marked `done` — see the
Project's `tasks.json` `agent_instructions`.

## Production launch

The production Vercel project is `ecu-service-lab`, with application root
`web/`. One deployment serves all three hosts:

| Host | Routes |
| --- | --- |
| `best-auto-repair.com` / `www.best-auto-repair.com` | Marketing, services, directory, contact |
| `order.best-auto-repair.com` | `/` redirects to `/order/vehicle`; existing `/order/*` and `/track/*` |
| `admin.best-auto-repair.com` | `/orders`, `/pricing`, etc. rewrite to protected `/admin/*` routes |

Middleware preserves query strings when moving old checkout/admin links to
their intended host. APIs, webhooks and assets remain accessible at their
existing paths. Admin authentication uses host-only Supabase cookies;
mutations retain `requireAdmin()` guards. Moving between domains does not
copy a checkout session or share admin cookies.

Production payment-return and email links use the explicit hosts in
`web/lib/domain/site-routing.ts`. Vercel previews keep all flows on their own
preview hostname. Set `NEXT_PUBLIC_SITE_URL=https://best-auto-repair.com` in
Production; local development uses `http://localhost:3000`.

**Domain configuration:** all three requested hosts resolve to Vercel as of
2026-09-29. The apex currently redirects to `www.best-auto-repair.com` in
Vercel. To keep the apex visible, change that domain to serve this project's
Production environment directly and optionally redirect `www` to the apex.
Do not redirect the order/admin hosts to the marketing domain. Domain changes
require project access; this code change does not modify Vercel settings.
Follow [Vercel's domain setup instructions](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
and use the exact DNS records shown for this project.

### Marketing development and checks

`web/app/(marketing)/` holds public pages; `web/components/marketing/` contains
shared navigation, service cards and layout. Business details and service copy
live in `web/lib/marketing.ts`. The directory queries existing compatibility
records with pagination; unconfirmed operations remain marked for manual review.
Generated visual prompts and asset paths are recorded in
[`docs/marketing-assets.md`](docs/marketing-assets.md).

```sh
cd web
npm run site:test       # routing and public-input regression tests
npm run coverage:test   # existing catalog regression tests
npm run build
npm run start          # leave running in a separate terminal
npm run site:e2e        # Chrome: marketing, directory, checkout, admin redirects
node tests/site/capture.mjs  # desktop/mobile screenshots under /tmp
```

Local subdomains are `order.localhost:3000` and `admin.localhost:3000`.
Chrome resolves these without a hosts-file edit. Browser tests use installed
Google Chrome by default; set `PLAYWRIGHT_CHANNEL=chromium` after installing
Playwright Chromium to use that browser instead. They read the configured
coverage database and do not create orders or send email.

The contact form sends to the existing private `ADMIN_NOTIFICATION_EMAIL`
through Resend, with a honeypot, strict field validation and an atomic limit of
five submissions per hashed IP per hour in `app_settings`. Configure the
recipient, `RESEND_API_KEY` and verified sender before accepting inquiries.
No public email address is shown; failed delivery directs customers to the
business phone number. Hours are by appointment, with no assumed schedule.

### Stripe

The webhook Route Handler is `POST /api/webhooks/stripe` and only
handles `checkout.session.completed`. A **test-mode** endpoint for
`https://ecu-service-lab.vercel.app/api/webhooks/stripe` is already
registered on the Hawaii Service Lab Stripe sandbox. Register the same
URL on the **live** Stripe account before taking real payments, then
replace `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Vercel
Production with the live values. The sandbox webhook signing secret is
already stored in Vercel as `STRIPE_WEBHOOK_SECRET`. `STRIPE_SECRET_KEY`
is still an empty placeholder.

### Email (Resend)

**Decision:** `best-auto-repair.com` is verified in Resend (SPF/DKIM
published) and is now the default `RESEND_FROM_EMAIL`
(`Best Auto Repair <orders@best-auto-repair.com>`). Set
`RESEND_FROM_EMAIL` plus `RESEND_API_KEY` in Vercel Production to send
from this domain; environments without it verified (e.g. a different
Resend account for local dev) should override `RESEND_FROM_EMAIL` back
to Resend's own `onboarding@resend.dev` test sender, which only
delivers to the Resend account owner.

### Database backups (Supabase)

**Decision:** stay on the Free plan for now (no automatic daily
backups). The "Hawaii Service Lab" org (`vsawotguarbbamwcvkew`) is
Free. Upgrade to Pro (or any paid tier with daily backups / PITR) in
the Supabase dashboard before relying on this database for paid
orders you cannot afford to lose.

### Compatibility data

The authoritative customer workflow is in `Requirements.md`: an OEM part
number and a specific supported operation are required to offer a service.
Use `web/scripts/coverage-import.ts` to recursively inspect every XLSX/XLS
sheet in `coverage_sources/`, validate locally, and replace the live catalog:

```
cd web
npm run coverage:import -- --dry-run    # local only; default mode
npm run coverage:test                  # parser/validation regression tests
npm run coverage:import -- --inspect    # read-only database counts
npm run coverage:import -- --verify     # exact source/DB comparison + query plan
npm run coverage:import -- --replace    # backup + atomic purge/reload
# Explicitly empty compatibility without reloading (also backs up first):
npm run coverage:import -- --purge-only
```

`coverage:convert` aliases the dry run; `coverage:apply` aliases replacement.

### Targeted Tesla coverage repair

From `web/`, run `npm run coverage:tesla` for a local preview, then
`npm run coverage:tesla -- --apply` to back up and reconcile only Tesla import
records in one transaction. Re-running preserves IDs, admin-confirmed entries,
existing prices, historical order state and all other makes. Private backups,
source coordinates and verification reports live in `web/data/coverage-import/tesla-*`.
Deploy the accompanying checkout changes **before** applying unpriced services.

The Airbag workbook contains 23 SRS rows (22 distinct OEM parts), one VCFRONT
body controller retained for review under BCM, and one unsupported TAS row
quarantined. Combined Tesla/Bosch cells are normalized to their Tesla OEM number;
the complete source cell remains in the audit report. Battery Reset's four
Tesla parts (`1598486-00-D`, `1598486-00-F`, `1598486-00-G`, `1598486-99-D`)
map to **Battery/BMS → Tesla Battery Reset**, only with explicit BMS, 16V and
crash-erase support. Read/write or DTC support alone cannot grant this service.

Neither workbook provides model/year. The independent NHTSA reference in
`coverage_sources/reference/` supplies dropdown identities without inventing
part fitment. Matching still requires the same make, exact OEM part, category
and supported operation; unknown combinations require review.

The new `TESLA_BAT` price tier starts unconfigured. Customers see **Quote after
review**, and orders remain `pending_review` without a payment link or price
snapshot. Admins set the amount or service tier in `/admin/pricing`; imports
never overwrite it. A positive service price is required before confirming
payment. Battery Reset has its own questions and concerns the supported 16V
low-voltage management module, not high-voltage battery-pack repair.
They no longer consume the legacy generated CSVs. The old conversion/apply
script paths delegate to this same pipeline. Curated CSVs can still use
the admin import screen, which now also validates part numbers.

Each run creates a private, gitignored `web/data/coverage-import/<timestamp>/`
directory: `normalized.json` (including file hashes, all sheet headers, source
coordinates, raw identifiers and connection methods), `rejected-rows.json`,
and `report.json`. Replacement additionally saves `backup.json` before any
deletion. Reports contain no connection secrets; backups include lookup data
and order relation IDs, not customer contact/payment data.

- **Parts:** only explicit Part Number/Part No. columns in recognized module
  layouts are eligible. ECU families, dashboard types and chips never become
  OEM identifiers. Unknown categories/layouts and ambiguous identifiers are
  reported, not guessed. Missing data and out-of-scope capabilities are
  counted separately from invalid part numbers.
- **Services:** explicit, unqualified `Erase Crash` support enables Crash Data
  Reset; explicit ECM `Write VIN` support enables ECM VIN Write. Memory writes
  do not imply repair/cloning. Recognized annotations (PARTIALLY, BETA, DIAG
  ONLY, CAN, KLINE) are retained in provenance; affected entries have no
  automatic services. Conflicting duplicates use the intersection of support.
- **Applicability:** SRS sources without model/year use the existing private
  `Model=All, Year=2000` storage convention. These are not real vehicles and
  never appear in dropdowns. Lookup requires the same make, category and exact
  part number. Other incomplete applicability is held in the rejection report.
- **Vehicles:** automotive IMMO, ODO and ECU Advanced sheets can contribute
  make/model/year independently of service coverage. Open year ranges expand
  only for this directory through the recorded run year; month-specific,
  reversed or excessive ranges are rejected. These vehicles do not establish
  service support. The existing `(make, model, year)` unique index supports the
  hierarchy; make/model grouping executes in PostgreSQL, not in JavaScript.
- **Replacement:** uses 3,000-row `createMany`/`createManyAndReturn` batches
  inside one Prisma transaction. Validation precedes deletion; failure rolls
  back the purge. Reference categories, pricing and orders are preserved.
  Order-owned vehicles remain; identical compatibility identities retain IDs
  and order links. Obsolete matches are detached, with original links in the
  backup. Historical vehicle spelling aliases are consolidated into an imported
  equivalent with the same year, preserving the order's vehicle meaning.
  An explicit replacement resets admin-confirmed compatibility too.

Rerunning the same sources produces the same logical catalog without duplicate
entries. The transaction locks writes briefly; reads retain the previous
committed catalog. No migration or sequence reset is needed. Use a direct or
session-pooler `DIRECT_URL` for this administrative job. Never run
`SEED_SAMPLE=true` against production.

### Firewall

`web/firewall.config.json` is the Vercel WAF rate-limit payload for
the public Server Actions, `/api/uploads/token` and `/track/*`. Publish
it on the `ecu-service-lab` project (Vercel dashboard → Firewall, or
`vercel firewall` with a token that can write the team scope).
