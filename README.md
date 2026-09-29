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

`prisma/seed.ts` never writes sample vehicles or entries when
`VERCEL_ENV=production`, even if `SEED_SAMPLE=true`. Real coverage is
normalized from `coverage_sources/` (OBD Star G3) by
`web/scripts/convert-coverage.mjs`:

```
cd web
npm run coverage:convert   # writes web/data/*.csv (gitignored)
npm run coverage:apply     # upserts vehicles + entries via Prisma
```

Or upload `web/data/compatibility-import.csv` at
`/admin/compatibility/import`. Mapping is lossy:

- **CRASH RESET / AIRBAG** — Brand + OEM part number → Airbag/SRS
  (`Crash Data Reset`, plus `SRS Module Repair` when the dump lists
  write/erase). No model/year in the dump, so rows are stored on a
  sentinel vehicle (`Model=All`, `Year=2000`) hidden from the public
  picker. `checkCompatibility` / `placeOrder` fall back to the same
  category + part number on any vehicle.
- **ODO / CAR** — Brand + Model + Year + dashboard type → Instrument
  Cluster (`Cluster Repair`). Dashboard type is used as the part
  number when no OEM PN is listed.
- **ECU Advanced** — rows with model, year, and a part/type, mapped
  by System (ECM/TCM/BCM/cluster/airbag).
- **IMMO** — make/model/year only (no services) so the wizard lists
  real vehicles. IMMO, RFID, oil reset, flasher chip lists, moto, and
  Xhorse ECU-model lists are not imported as services.

Do not run `SEED_SAMPLE=true` against the production database.

### Firewall

`web/firewall.config.json` is the Vercel WAF rate-limit payload for
the public Server Actions, `/api/uploads/token` and `/track/*`. Publish
it on the `ecu-service-lab` project (Vercel dashboard → Firewall, or
`vercel firewall` with a token that can write the team scope).
