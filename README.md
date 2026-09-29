# ECU Service Lab — Automotive Module Compatibility & Repair Service Platform

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

The production Vercel project is `ecu-service-lab`. The chosen
production URL is `https://ecu-service-lab.vercel.app` (no custom
domain). `NEXT_PUBLIC_SITE_URL` in the Production environment is set
to that URL so payment links, tracking links and emails use it. If a
custom domain is added later, point `NEXT_PUBLIC_SITE_URL` at
`https://<domain>` and redeploy.

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
(`ECU Service Lab <orders@best-auto-repair.com>`). Set
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
