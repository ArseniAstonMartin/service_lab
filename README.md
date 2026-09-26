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

**Create an admin user**: Supabase dashboard → Authentication → Users →
"Add user" → set an email and password (or "Send invite"). Any user that
exists in Supabase Auth can log in at `/admin/login` — there is currently
no separate admin role/claim, so anyone with a Supabase Auth account for
this project is treated as an admin.

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

Verify a sending domain in Resend (SPF + DKIM at the DNS host), then
set `RESEND_FROM_EMAIL` (for example
`ECU Service Lab <orders@send.example.com>`) and `RESEND_API_KEY` in
Vercel. Until a domain is verified the app falls back to Resend's
`onboarding@resend.dev` test sender, which only delivers to the
account owner.

### Database backups (Supabase)

**Decision:** production requires a paid Supabase plan so automatic
daily backups are on. The Free tier has no automatic backups and is
not acceptable once real customer orders live here. Pro (or any paid
tier that includes daily backups / PITR) is the chosen plan.

The current "Hawaii Service Lab" org (`vsawotguarbbamwcvkew`) is still
on **Free**. Upgrade it in the Supabase dashboard before taking paid
orders.

### Compatibility data

`prisma/seed.ts` never writes sample vehicles or entries when
`VERCEL_ENV=production`, even if `SEED_SAMPLE=true`. Import the real
dataset through `/admin/compatibility/import` (Excel/CSV in the
canonical columns: Make, Model, Year, Category, Part Number, plus one
column per service name). Files under `coverage_sources/` are raw
programmer-tool dumps and are not that format — normalize them before
import. Do not run `SEED_SAMPLE=true` against the production database.

### Firewall

`web/firewall.config.json` is the Vercel WAF rate-limit payload for
the public Server Actions, `/api/uploads/token` and `/track/*`. Publish
it on the `ecu-service-lab` project (Vercel dashboard → Firewall, or
`vercel firewall` with a token that can write the team scope).
