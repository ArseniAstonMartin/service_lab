# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ECU Service Lab: an intake and reverse-logistics platform for an automotive electronics lab. Customers use a public wizard to check module compatibility and place a repair, cloning or reprogramming order. Admins review, price and track orders. `PRD.md` is the scope source of truth. `tasks.json` and `progress.md` sit at the repo root but are not committed (see Workflow below). The app was rebuilt from Oracle APEX, and the old implementation exists only in git history.

All code lives in `web/`, a single Next.js 15 App Router app (React 19, TypeScript, Tailwind + shadcn/ui, Prisma on Supabase Postgres, Supabase Auth, Vercel Blob, Stripe, Resend). It is deployed on Vercel as project `ecu-service-lab` (https://ecu-service-lab.vercel.app).

## Commands

Run everything from `web/`:

```
npm run dev                  # local dev server (http://localhost:3000)
npm run build                # prisma generate + next build — must pass before a task is done
npm run lint                 # next lint
npx prisma migrate dev --name <name>   # create a new migration after editing schema.prisma
npm run db:seed              # prisma/seed.ts (sample data only when SEED_SAMPLE=true; never in production)
npm run coverage:convert     # coverage_sources/*.xlsx -> web/data/*.csv (gitignored)
npm run coverage:apply       # upsert converted coverage into vehicles/compatibility entries
```

The project has no test runner. The `lib/domain` functions are pure so that they can be unit tested, but no tests exist yet. For setup, copy `.env.example` to `.env.local`. `DATABASE_URL` is the pgbouncer transaction pooler used at runtime. `DIRECT_URL` is the session pooler that migrations use. `vercel-build` runs `prisma migrate deploy` only in production.

## Architecture

**Layering** (from `tasks.json` conventions):
- `lib/domain/`: pure business rules (status transitions, match decision, quote, part-number normalization, CSV import validation, tokens). These files have no Prisma, Next or Stripe imports and declare their own minimal types, such as `OrderStatusValue` mirroring the Prisma enum. Keep that mirror in sync by hand.
- `lib/actions/`: Server Actions (`"use server"`). These handle zod validation, Prisma calls and orchestration. All in-app forms and admin mutations go through here.
- `lib/services/`: shared server-side orchestration that several actions or routes use: status changes, payment links, order emails and compatibility lookup.
- `app/api/`: only two Route Handlers exist, the Stripe webhook (`webhooks/stripe`) and the Blob client-upload token (`uploads/token`). Don't add others for ordinary mutations.

**Order status is written only by `advanceOrderStatus()`** in `lib/services/order-status.ts`. It re-reads the current status inside a transaction, validates the move with `lib/domain/status.ts` (a linear flow: `pending_review → awaiting_payment → payment_received → block_received → in_progress → ready_shipped_back → completed`) and appends `OrderStatusHistory`. After commit it runs side effects registered for the target status. A side-effect failure is logged but never rolls back the status change.

**Side effects register at module load time.** `lib/services/payment.ts` registers `awaiting_payment` (creates a Stripe Payment Link and emails it). `lib/services/order-emails.ts` registers `block_received` and `ready_shipped_back`. A registration takes effect only if some module imports that file, so any code that moves an order into one of these statuses must side-effect-import the matching service (`import "@/lib/services/payment";`), as `place-order.ts` and `confirm-compatibility.ts` do.

**Order flow:**
1. The wizard (`app/(public)/order/*`: vehicle → module → compatibility → service → details → shipping → confirmation) keeps state only in client `sessionStorage` through `components/wizard/wizard-store.tsx`. Step guards wait for `isHydrated` before redirecting.
2. `placeOrder` trusts nothing from the client. It re-derives the match (`lookupCompatibility` + `decideMatch`), recomputes the quote from `PriceTier` and the `return_shipping_fee_cents` `AppSetting`, and re-validates required questions against `QuestionDefinition`. It is idempotent through the client-generated `idempotencyKey`.
3. With a match (an entry exists and has at least one linked service), the order gets a price snapshot and moves automatically to `awaiting_payment`, which sends the payment link. Without a match it stays in `pending_review` until an admin runs confirm-compatibility.
4. The Stripe webhook handles only `checkout.session.completed` (order id in `session.metadata.orderId`). It records the event id in `StripeEvent` before processing, for dedupe, and always returns 200 once the event is recorded. A stuck order is fixed manually, not by a Stripe retry.
5. Customers follow the order at `/track/[token]` using the unguessable `trackingToken`.

**Compatibility data** is `CompatibilityEntry` (vehicle + category + normalized part number) linked to `Service` through `CompatibilityService`. Crash/airbag coverage has no model or year, so it is stored on a sentinel vehicle (`Model=All`, `Year=2000`) that the public picker hides. The lookup in `lib/services/compatibility-lookup.ts` falls back to category + part number on any vehicle. The README has the full lossy mapping from the `coverage_sources/` spreadsheets.

**Auth:** any Supabase Auth user counts as an admin, and there is no role table. `middleware.ts` guards only `/admin/*` pages. Every admin Server Action and Route Handler must call `requireAdmin()` from `lib/supabase/require-admin.ts` itself.

## Conventions

- Money is stored as integer cents everywhere on the server and formatted as dollars only in the UI.
- Every Server Action and Route Handler validates input with zod. Never trust price, match or status values sent by the client.
- Server-only modules import `"server-only"`. Log errors through `lib/log.ts` (`logServerError`), which sanitizes the output.
- Schema changes go through `prisma/schema.prisma` plus a new `prisma migrate dev` migration. Never edit an applied migration, and don't use `db push`. The tables have RLS enabled (migration `enable_rls`), and Prisma connects as the privileged Postgres role.
- Prisma ids are `BigInt`. Convert them to strings before they cross to the client.
- Never run `SEED_SAMPLE=true` against the production database.

## Workflow (from `tasks.json` `agent_instructions`)

- Work on one task at a time: the highest-priority `pending` task whose dependencies are all `done`. Commit after each logical change, and prefix commit messages with the task id (`TASK-0XX: ...`).
- When a task is done, change only that task's `status` in `tasks.json` and add one 1–2 line entry to `progress.md` (`## YYYY-MM-DD — TASK-XXX: <name>`). Don't create scratch copies of these files or edit other tasks.
- Write all code, comments, commits and docs in English.
