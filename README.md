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
