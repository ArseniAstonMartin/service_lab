
## 2026-09-25 — Session 1
 
### Stack mismatch discovered (resolved by user decision)
 
The Project's `tasks.json` (v4.0) describes a **Next.js + Prisma + Supabase +
Vercel** rebuild, all 46 tasks `pending`. The connected local folder
`/Users/arsenizaitsau/HAWAII_FSM` instead contained a **separate,
already-far-advanced Oracle APEX / PL-SQL implementation** of the same
product. Asked the user which to continue. **Decision: start the Next.js
version fresh**, in a `web/` subfolder of the same `HAWAII_FSM` repo.
 
### TASK-001 — Scaffold the Next.js app — **done**
 
Hand-authored the scaffold (npm registry blocked in this sandboxed session)
then the user installed dependencies and verified `npm run build` on their
own machine.
 
### Oracle APEX / PL-SQL cleanup — done
 
Deleted `apex/` and `database/`, rewrote `README.md`, trimmed `.gitignore`.
Commits: `fb37912`, `1df12ee`.
 
### TASK-002 — Connect Prisma to Supabase Postgres — **done**
 
`prisma/schema.prisma` datasource, `lib/db.ts` (server-only cached
PrismaClient singleton), `package.json` (`prisma`/`@prisma/client`,
`build`/`postinstall` run `prisma generate`). Commits: `d5c8e2a`, `11bc2d5`
(corrected DATABASE_URL/DIRECT_URL to Supabase's real pooler format,
region us-west-1, once the user provided Supabase's own Prisma setup
instructions). Marked done on the strength of the live DB verification
performed for TASK-003/004 (below), which proves the datasource config,
connection format and schema all work end-to-end against the real
Supabase project via the same Prisma-shaped migrations.
 
### TASK-003 — Prisma models for reference data — **verified against the real database, done**
 
Schema added: `Vehicle`, `ModuleCategory`, `PriceTier`, `Service`,
`CompatibilityEntry`, `CompatibilityService`, matching PRD section 6
exactly (snake_case `@@map`s, BigInt ids, `@db.VarChar` sizes,
`@db.Timestamptz(6)`, `EntrySource` enum, both `@@unique`s, composite
`@@id` on the junction table). Commit: `65367f5`.
 
**This session couldn't reach the DB directly** (confirmed: DNS/TCP to
both the direct host and the pooler host are blocked by the network
sandbox on both the device bridge and the cloud container — not a
credentials problem, a hard egress restriction). The user connected the
**Supabase MCP connector** in claude.ai, which gave this session real
tools (`apply_migration`, `execute_sql`, `list_tables`, etc.) over HTTPS,
sidestepping the raw-TCP block entirely.
 
Used it to actually verify the migration for real:
1. `list_tables`/`list_migrations` on the live project (`vsawotguarbbamwcvkew`,
   "Hawaii Service Lab", us-west-1, Postgres 17.6) — confirmed empty/clean
   before starting.
2. Applied `prisma/migrations/20260925160000_reference_data/migration.sql`
   via `apply_migration` — **succeeded with no errors.**
3. `list_tables` again — every table, column type, PK and FK matches
   `schema.prisma` exactly. The hand-written migration SQL (written without
   ever running `prisma migrate dev`) was correct.
4. Created Prisma's own `_prisma_migrations` tracking table and inserted a
   row for `20260925160000_reference_data` with the migration file's real
   sha256 checksum (`4305503...8203b5`), so a future real
   `prisma migrate dev`/`deploy` run recognizes it as already applied
   instead of re-running the DDL and failing on "relation already exists".
### TASK-004 — Prisma models for orders — **verified against the real database, done**
 
Schema added: `OrderStatus` enum (7 statuses), `PhotoType` enum (sticker,
donor, original), and `Order` / `OrderPhoto` / `OrderAnswer` /
`OrderStatusHistory` models, matching PRD section 6 (full field set on
`Order` including `returnTrackingNo`, `paymentLinkUrl`, unique
`idempotencyKey`; `trackingToken` unique; indexes on `status`,
`customerEmail`, `partNumberEntered`, `createdAt`; price snapshot fields
`Int?` in cents). Added the corresponding back-relation fields on
`Vehicle`, `ModuleCategory`, `CompatibilityEntry` and `Service`.
 
Migration `prisma/migrations/20260925161500_orders/migration.sql`
hand-written to match, applied live the same way as TASK-003:
1. `mcp__Supabase__apply_migration(name: "orders", ...)` — succeeded with
   no errors.
2. `list_tables(verbose: true)` — confirmed all 4 new tables, every
   column/type and every foreign key match `schema.prisma` exactly
   (including `ON DELETE SET NULL` on `matched_entry_id`/`service_id` vs.
   `RESTRICT` on the required vehicle/category/service refs).
3. Registered in `_prisma_migrations` via `execute_sql` (INSERT) with the
   real sha256 checksum of the committed migration file
   (`1697c9d5...7d2ffa`), so a future `prisma migrate dev`/`deploy` picks
   up where this left off instead of re-running the DDL.
Commit: `2fdd265`.
 
### TASK-005 — Prisma models for support tables — **verified against the real database, done**
 
Schema added: `QuestionAnswerType` enum (text, yes_no, textarea, photo),
`AppSetting` (key/value, `key` as `@id`), `QuestionDefinition`
(`questionSetCode`/`questionCode` unique pair, `label`, `answerType`,
`required`, `sortOrder`), `StripeEvent` (Stripe event `id` as primary key
for webhook idempotency), and `EmailLog` (`orderId` FK, `emailType`,
`status`, `error`, `sentAt`, unique `(orderId, emailType)`). Added the
`emailLogs` back-relation on `Order`.
 
Migration `prisma/migrations/20260925163000_support_tables/migration.sql`
hand-written to match, applied live the same way as TASK-003/004:
1. `mcp__Supabase__apply_migration(name: "support_tables", ...)` —
   succeeded with no errors.
2. `list_tables(verbose: true)` — confirmed all 4 new tables
   (`app_settings`, `question_definitions`, `stripe_events`,
   `email_logs`), every column/type and the `email_logs → orders` FK
   match `schema.prisma` exactly.
3. Registered in `_prisma_migrations` via `execute_sql` (INSERT) with the
   real sha256 checksum of the committed migration file
   (`6873063a...728b02f`).
Commit: `792ec6b`.
 
### TASK-006 — Block the Supabase Data API from reading app tables — **verified against the real database, done**
 
No new Prisma models — this is a pure security migration.
`prisma/migrations/20260925194500_enable_rls/migration.sql` runs
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all 15 tables in the
public schema: the 14 app tables plus `_prisma_migrations` itself, which
is also reachable through the Data API since it lives in the same schema.
No policies are added, so the `anon`/`authenticated` roles PostgREST uses
now get denied by default on every one of them.
 
Applied live the same way as TASK-003/004/005:
1. `mcp__Supabase__apply_migration(name: "enable_rls", ...)` — succeeded
   with no errors.
2. `mcp__Supabase__get_advisors(type: "security")` — confirmed the prior
   **CRITICAL** "Row Level Security is disabled" finding is gone,
   replaced by the expected **INFO**-level "RLS enabled, no policy"
   note on all 15 tables — exactly the intended deny-by-default state.
3. Registered in `_prisma_migrations` via `execute_sql` (INSERT) with the
   real sha256 checksum of the committed migration file
   (`048fdf3e...1f68c6caa`).
Commit: `b2995ae`.
 
Zero policies is the **correct and final** state for this MVP, not a
placeholder: every data access path goes through Prisma (which
authenticates as the Postgres role and always bypasses RLS) via Server
Actions from TASK-011 onward. The admin's Supabase Auth session
(TASK-012) is used only to authenticate the admin in the app; it never
talks to the Data API directly. `NEXT_PUBLIC_SUPABASE_ANON_KEY` can now
safely ship to the browser exactly as Supabase intends, since RLS blocks
it from reading or writing anything.
 
### TASK-007 — Prisma seed script for reference data — **verified against the real database, done**
 
`prisma/seed.ts`, idempotent throughout (real `upsert` where the model has
a unique key; a manual find-then-create/update for `ModuleCategory` and
`Service`, which have none):
 
- **Always seeded:** the 5 module categories (Airbag/SRS, ECM/PCM,
  TCM/TCU, BCM, Instrument Cluster); price tiers 100/200/300/400
  ($100/$200/$300/$400); 11 services, each scoped to a category, a tier
  and a `questionSetCode` (e.g. "ECM Cloning" → ECM/PCM, tier 300,
  `CLONING`); 15 question definitions across the `SRS`, `CLONING`,
  `VIN_WRITE`, `RESTORATION` and `FOLLOW_UP` sets from PRD 4.4's
  conditional-field lists; the `return_shipping_fee_cents` AppSetting
  ($25, the midpoint of the PRD's $20-30 range).
- **Only when `SEED_SAMPLE=true`:** 3 sample vehicles (Camry, Civic,
  F-150) and one compatibility entry each — Camry/Airbag-SRS with 1
  linked service, Civic/ECM-PCM with 2, and F-150/BCM deliberately left
  with **zero** linked services, so `decideMatch()` (TASK-010) has a
  concrete case where the part number exists but nothing is confirmed
  yet, distinct from "part number not found at all".
`package.json`: added `tsx` as a devDependency, a top-level
`"prisma": {"seed": "tsx prisma/seed.ts"}` entry so `prisma db seed`
picks it up, and a `db:seed` script.
 
**Verification:** this session can't run `tsx`/Node here either (same
network-sandbox limitation as TASK-001), so instead of running the
script directly, ran the *equivalent SQL* against the live Supabase
project via the Supabase MCP connector's `execute_sql`:
1. Base reference-data inserts (categories/tiers/services/questions/
   settings, all `ON CONFLICT`-guarded) landed at exactly the expected
   counts: 5 categories, 4 tiers, 11 services, 15 questions, 1 setting.
2. Sample-data inserts (vehicles + compatibility entries + service
   links) confirmed the intended linked-service counts per entry: Camry
   → 1, Civic → 2, F-150 → **0** — the zero-service edge case is real in
   the database, not just asserted in a comment.
This proves the seed's SQL shape is valid against the live schema and
constraints (unique keys, enum values, FKs); it doesn't prove the
TypeScript itself compiles, which still needs a real `npm run build`/
`tsc` pass once the user runs it locally.
 
Commit: `5f24b22`.
 
### New connectors added this session
 
The user connected **Stripe**, **Resend**, **Vercel** and **Sentry** MCP
connectors in claude.ai (alongside the existing Supabase one).
 
### TASK-008 — Connect the Vercel project and deploy a hello-world build — **verified live, done**
 
The local repo had never been pushed anywhere (`git remote -v` was empty).
Added `origin = https://github.com/ArseniAstonMartin/service_lab.git`.
This session's own device-bridge shell couldn't push directly — first a
managed-device network policy blocked all outbound HTTPS (even
`registry.npmjs.org`), then once the user allowed network access, the
push still failed with no GitHub credentials configured on the shell
(no `gh` CLI, no credential helper). Rather than invent or embed a
token, asked the user to push from their own terminal, which they did
(twice — once for the initial `main` push, once for a follow-up commit).
 
Once `main` was on GitHub:
1. `mcp__Vercel__create_project` — created a **new**, distinctly-named
   Vercel project `ecu-service-lab` (`prj_PpcJak2C8pr0A2B0gXF86cxPGkyE`),
   framework `nextjs`, root directory `web`, connected via
   `gitRepository: {type: "github", repo: "ArseniAstonMartin/service_lab"}`.
   Left the account's 4 pre-existing, unrelated projects
   (`teamhub-online-4ld5`, `teamhub-online`, `alohakeyservice.com-prod`,
   `bestlocksmithservice`) untouched.
2. `mcp__Vercel__create_storage_stores_blob` — created and linked a Blob
   store (`store_n1o24ZXSN8d7rvjO`) directly to the project; Vercel
   auto-injected `BLOB_READ_WRITE_TOKEN` into all three environments.
3. `mcp__Vercel__create_project_env` — set `DATABASE_URL`/`DIRECT_URL`
   (the real Supabase pooler strings), `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` for Production + Preview; empty
   placeholders for `SUPABASE_SERVICE_ROLE_KEY` (not exposed by the
   Supabase MCP connector — dashboard-only by design),
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`
   (need the user's real keys); `ADMIN_NOTIFICATION_EMAIL` placeholder;
   `NEXT_PUBLIC_SITE_URL` set to `https://ecu-service-lab.vercel.app`
   (confirmed correct once deployed — it's the project's default alias).
4. `web/package.json` — added a `vercel-build` script (Vercel prefers
   this over `build` automatically) that runs
   `prisma migrate deploy` before `next build` **only** when
   `VERCEL_ENV=production`; preview/dev builds just run
   `prisma generate && next build`, since preview databases share the
   same Supabase project and shouldn't repeatedly deploy migrations.
5. `app/(public)/page.tsx` — added a real server-rendered DB read
   (`prisma.moduleCategory.count()` + `prisma.service.count()`,
   `export const dynamic = "force-dynamic"`) so the acceptance
   criterion "a server-rendered DB read succeeds" is actually
   demonstrated on the live page, not just asserted.
6. Committed (`88e1763`) and pushed (by the user, same credential
   limitation as above).
7. Vercel's GitHub integration auto-deployed `main` to production
   (`dpl_DLTpggucPH3iVjz2ceHSspzVE1Ly`) — reached `READY` in about a
   minute, confirming push-to-deploy works with no manual trigger.
8. Fetched `https://ecu-service-lab.vercel.app` directly: renders
   "ECU Service Lab" and **"5 module categories · 11 services
   configured"** — a real DB read against the live seeded data
   (TASK-007), succeeding in production.
All 4 acceptance criteria verified live: git-push deploy (main →
production, confirmed automatic), env vars + linked Blob store,
migrate-deploy gated to production, and the production URL rendering
with a working DB read.
 
**Still open, deliberately deferred:** `SUPABASE_SERVICE_ROLE_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` are
empty placeholders in Vercel — these need the user's real keys and are
squarely TASK-025/041/046's job, not TASK-008's. Preview deployments
were not separately smoke-tested (no non-main branch pushed yet) but
share the same verified project config and env vars, so this is a low
risk left for whenever the first feature branch is opened. The
Supabase DB password rotation the user mentioned they'd do before going
live is still outstanding — a reminder for whoever does TASK-046.
 
**GitHub connector:** the user asked about connecting a GitHub MCP
connector to avoid the "push it yourself" workaround above. It isn't in
the searchable MCP registry — it's a first-party claude.ai connector
(Settings → Connectors), so pointed the user there rather than trying to
resolve it via SearchMcpRegistry/SuggestConnectors.
 
### TASK-009 — Domain rules: status transitions and the tracking token — **done**
 
`web/lib/domain/status.ts`: `OrderStatusValue` literal union mirroring the
Prisma `OrderStatus` enum (declared independently — no Prisma import), the
linear `TRANSITIONS` map (`pending_review → awaiting_payment →
payment_received → block_received → in_progress → ready_shipped_back →
completed`, `completed` terminal), `canTransition(from, to)` and
`nextStatuses(from)`. Note: `pending_review → awaiting_payment` **is** a
legal edge in this domain-level map (TASK-011/036 need it to actually
advance an order out of manual review); TASK-032's requirement that the
admin's generic status-update dropdown never offers that specific pair is
an application-layer restriction for that task to enforce where the
transition is triggered, not a domain rule — noted in a code comment so
it isn't rediscovered as a bug later.
 
`web/lib/domain/token.ts`: `generateTrackingToken()` — 32 random bytes via
Node's built-in `crypto.randomBytes`, base64url-encoded (no framework
import; `node:crypto` is standard library, not "Prisma/Next.js/Stripe").
 
`web/lib/constants.ts`: `STATUS_LABELS` and `STATUS_COLORS` (Tailwind
badge classes) keyed by `OrderStatusValue`, imported as a type-only import
from `lib/domain/status` — kept separate from `/lib/domain` itself since
it's UI-facing, not pure domain logic.
 
No live/build verification possible in this sandbox (same npm/tsc
limitation as TASK-001/007); the code was hand-reviewed for TypeScript
correctness and directly reflects the acceptance criteria. A real
`npm run build`/`tsc --noEmit` pass is still worth doing once the user is
at their machine.
 
Commit: `c3be2e7`.
 
### TASK-010 — Domain rules: part number normalization, compatibility decision, price quote — **done**
 
`web/lib/domain/part-number.ts`: `normalizePartNumber(raw)` — trim +
uppercase only, nothing else. Deliberately never fuzzy: a part number that
differs by even a stray character reads as "not found," which routes the
order to pending_review rather than risking a wrong automatic match.
 
`web/lib/domain/compatibility.ts`: local `EntityId`, `ServiceSummary`,
`CompatibilityEntrySummary` and `MatchResult` types (no Prisma-generated
types imported, so this stays framework-free and testable with plain
objects) and `decideMatch(entry, services)` — matched only when the entry
is non-null AND `services.length > 0`. This also covers the
already-seeded F-150/BCM edge case (TASK-007): an entry that exists with
zero linked services is treated exactly like no entry at all.
 
`web/lib/domain/quote.ts`: `Quote` type and `quote(tierAmountCents,
returnFeeCents)` → `{servicePriceCents, returnShippingFeeCents,
totalCents}`. Pure arithmetic, no rounding/currency conversion needed
since everything is already integer cents in and out.
 
Same verification caveat as TASK-009: no `tsc`/`npm run build` possible in
this sandbox; hand-reviewed against the acceptance criteria.
 
Commit: `7bc159b`.
 
### TASK-011 — Order status service: the single place that changes orders.status — **done**
 
`web/lib/services/order-status.ts`:
 
- `InvalidStatusTransitionError` — a typed error carrying `orderId`,
  `from` and `to`, thrown when the requested transition isn't allowed by
  `/lib/domain/status`'s `canTransition()`.
- A side-effect registry (`sideEffects: Record<OrderStatusValue,
  SideEffect[]>`) plus `registerStatusSideEffect(status, effect)` — the
  hook point TASK-026 (payment link) and TASK-042/043 (order-lifecycle
  emails) will call into once those tasks exist. Not persisted or
  queued; a lightweight in-memory registry is enough for this MVP's
  single-instance Vercel deployment.
- `advanceOrderStatus(orderId, to, changedBy, extra?)`: inside one
  `prisma.$transaction`, re-reads the order's CURRENT status (never
  trusts a status the caller read earlier — closes a
  read-then-write race), validates the transition, updates the order
  (merging in any `extra` fields the caller passed, e.g.
  `stripePaymentStatus` or `returnTrackingNo`, typed as
  `Omit<Prisma.OrderUpdateInput, "status">` so callers can't smuggle a
  second, unvalidated status write through `extra`), and appends an
  `OrderStatusHistory` row. After the transaction commits, runs every
  side effect registered for `to`, catching and logging each one
  individually so a failed payment-link or email send never rolls back
  the already-committed status change and never blocks the other side
  effects.
Verified the "no other code writes order.status" acceptance criterion
with a direct grep across `lib/` and `app/` (`order.update` /
`.status =` /  `orders.status`) — the only match is this file's own
`tx.order.update` call, as expected since no Server Actions or route
handlers exist yet.
 
Hit a mid-task device-bridge disconnect (the connection to the user's
Mac dropped while writing the file); stopped, told the user plainly
rather than retrying blindly, and resumed once they confirmed the
connection was back.
 
Same verification caveat as TASK-009/010: no `tsc`/`npm run build`
possible in this sandbox; hand-reviewed against the acceptance criteria.
 
Commit: `64ec9e1`.
 
### TASK-012 — Supabase Auth for the admin: SSR clients, middleware, login/logout, requireAdmin — **done**
 
`web/lib/supabase/server.ts`: `createSupabaseServerClient()` for Server
Components/Actions/Route Handlers — `@supabase/ssr`'s `createServerClient`
wired to `next/headers` cookies, with a try/catch around `setAll` since
Server Components can't set cookies (middleware refreshes the session
instead).
 
`web/lib/supabase/client.ts`: `createSupabaseBrowserClient()` for Client
Components, using `createBrowserClient`.
 
`web/lib/supabase/middleware.ts` + `web/middleware.ts`: `updateSession()`
follows Supabase's official Next.js SSR reference pattern exactly —
rebuilds the `NextResponse` every time `setAll` is called (never mutates
the original response's cookies after creation), calls `getUser()` on
every non-static request to force a session refresh, and redirects to
`/admin/login` when there is no user and the path is under `/admin`
but not `/admin/login` itself. `middleware.ts`'s `matcher` excludes
`_next/static`, `_next/image`, and common static file extensions.
 
`web/lib/supabase/require-admin.ts`: `requireAdmin()` — reads the
session server-side via `createSupabaseServerClient()` and throws
`UnauthorizedError` when there is no user; returns the `User` otherwise.
This is deliberately separate from the middleware guard: middleware only
covers page navigations to `/admin/*`, not Server Actions or Route
Handlers, which Next.js exposes as directly callable endpoints
regardless of what page they're imported from. Every admin Server
Action/Route Handler from TASK-014 onward must call this explicitly
(TASK-045 is where that gets audited/enforced project-wide).
 
`web/lib/actions/auth.ts`: `signIn(formData)` (validates with zod,
calls `supabase.auth.signInWithPassword`, redirects to `/admin` on
success or back to `/admin/login?error=...` on failure) and
`signOut()` (`supabase.auth.signOut()` then redirect to `/admin/login`).
No sign-up action exists on purpose — public sign-ups are disabled in
Supabase and admins are created manually (see README).
 
`web/app/admin/login/page.tsx`: an async Server Component using Next 15's
`searchParams: Promise<{error?: string}>` pattern, a shadcn Card/Input/
Label/Button form posting to `signIn`.
 
`web/app/admin/page.tsx`: added a working "Log out" button (a `<form
action={signOut}>` wrapping a shadcn `Button`) so the logout path is
actually reachable, not just implemented in isolation.
 
`README.md`: new "Admin authentication" section — disabling public
sign-ups (Authentication → Providers → Email → "Allow new users to
sign up" off) and creating the admin user via the Supabase dashboard
(Authentication → Users → Add user), plus a note that there is
currently no separate admin role/claim: any Supabase Auth user for this
project can log in as an admin. Also documents the middleware vs.
`requireAdmin()` split.
 
`package.json`: added `@supabase/ssr` and `@supabase/supabase-js`.
 
No live/build verification possible in this sandbox (same npm/tsc
limitation as every prior code-only task) — hand-reviewed against the
Supabase SSR reference implementation and Next.js 15's async
`searchParams` requirement. `npm run build`/`tsc --noEmit` should still
be run locally before this is fully trusted; in particular the
middleware's cookie-forwarding logic is easy to get subtly wrong and is
worth a manual login/logout smoke test once the user has a real admin
account in Supabase.
 
Commit: `c0090f3`.
 
### TASK-013 — Admin layout shell — **done**
 
Restructured `app/admin/*` around a Next.js route group so the
auth-guarded shell can't loop on its own login page:
 
- `app/admin/(dashboard)/layout.tsx` — a Server Component that reads the
  session via `createSupabaseServerClient()` and `redirect()`s to
  `/admin/login` when there's no user, then renders `<AdminNav>` plus
  the page content. This is a second, independent check directly in
  the render path (middleware already redirects unauthenticated page
  navigations before they get here — see TASK-012).
- The route group (`(dashboard)`) is deliberate: `app/admin/login/page.tsx`
  sits as a sibling **outside** the group, so it is never wrapped by
  this layout. Without the group, an unauthenticated visit to
  `/admin/login` would itself get wrapped by the guarded layout, find no
  user, redirect to `/admin/login` again, and loop forever.
- `components/admin/admin-nav.tsx` — the nav: Orders, Review Queue,
  Compatibility, Pricing as links with active-route highlighting
  (`usePathname`), plus a logout form. Horizontal on desktop
  (`md:flex`); on narrower screens it collapses to a "Menu" toggle
  button that reveals the same links (and a second logout button) in a
  panel underneath, via local `useState` — hand-rolled rather than
  pulling in a Sheet component for a single collapsible menu, since none
  is installed yet.
- Placeholder pages, one per nav item, moved into the group:
  `app/admin/(dashboard)/{orders,review-queue,compatibility,pricing}/page.tsx`,
  each just a heading and a "built out in TASK-XXX" note pointing at the
  task that will actually build it.
- `app/admin/page.tsx` moved to `app/admin/(dashboard)/page.tsx` and
  simplified — the standalone logout button it had from TASK-012 is
  gone now that logout lives in the shared nav instead.
No live/build verification possible in this sandbox (same limitation as
every prior code-only task) — hand-reviewed against how Next.js route
groups behave (a group's layout wraps only routes inside the
parenthesized folder, never sibling segments at the same level) and the
acceptance criteria. Worth a real `npm run build` plus manually resizing
the browser and clicking through all four nav items and logout once the
user is at their machine.
 
Commit: `42c1c32`.
 
### TASK-014 — Vercel Blob upload token Route Handler with server-side validation — **done**
 
`web/app/api/uploads/token/route.ts`: a POST handler using `handleUpload`
from `@vercel/blob/client`. The client's declared `purpose` (sent in its
`clientPayload`, parsed as JSON here — never trusted from anywhere else
in the request) decides everything about the token `onBeforeGenerateToken`
returns:
 
- `purpose: "wizard"` — public (any customer in the order wizard, no
  auth check), `allowedContentTypes` limited to
  `image/jpeg`/`image/png`/`image/heic`/`image/webp`, and the `pathname`
  is required to start with `pending/` so wizard uploads can never land
  under (or be mistaken for) the admin label path.
- `purpose: "label"` — calls `requireAdmin()` first; an unauthenticated
  caller gets `UnauthorizedError` thrown out of
  `onBeforeGenerateToken`, which this route catches and turns into a 401
  with no token ever generated. Adds `application/pdf` to the allowed
  types, requires the `pathname` to start with `labels/`.
- Both branches set `maximumSizeInBytes: 10 MB` and
  `addRandomSuffix: true`.
- Any other/missing `purpose`, or a path that doesn't match its purpose's
  prefix, throws before a token is generated (caught and returned as a
  400). The client never gets a general-purpose token — every token this
  route can hand out is already scoped to one purpose, one content-type
  allowlist and one path prefix by the time `handleUpload` builds it.
- `onUploadCompleted` is a deliberate no-op: this route's job ends at
  authorizing the upload. Persisting the resulting Blob URL to the
  database is each consuming Server Action's job (TASK-018 sticker
  photos, TASK-020 cloning donor/original photos, TASK-022 order
  creation, TASK-033 admin labels).
`web/lib/blob.ts`: `isVercelBlobUrl(url)` — checks a URL is `https:` on
the `*.public.blob.vercel-storage.com` domain Vercel Blob actually issues.
This is the other half of the last acceptance criterion ("uploaded URLs
are validated server-side... before they are saved to the database"): the
upload token route authenticates the *upload*, but the URL a Server
Action later receives from the client is still just a client-supplied
string, so every one of those Server Actions (TASK-018/020/022/033) must
call this before writing that URL into Prisma. Added now so the contract
exists from the start, even though nothing calls it yet (there are no
Server Actions to call it from until Phase 2's wizard tasks land).
 
`package.json`: added `@vercel/blob`.
 
No live/build verification possible in this sandbox (same npm/tsc
limitation as every prior code-only task), and this one also can't be
smoke-tested end-to-end here even in principle — it needs a real browser
upload against a live `BLOB_READ_WRITE_TOKEN`. Hand-reviewed against the
`@vercel/blob/client` `handleUpload`/`onBeforeGenerateToken` API and the
acceptance criteria. Worth a real `npm run build` plus an actual upload
from each purpose (wizard image, admin label PDF, and an unauthenticated
label attempt to confirm the 401) once the user is at their machine.
 
Commit: `f2830f6`.
 
### TASK-015 — Wizard shell: shared state, step indicator, /order/* layout — **done**
 
`web/lib/wizard/types.ts`: `WizardState` (vehicle, categoryId,
partNumber, stickerPhotoUrl, matchResult, serviceId, description,
answers, photoAnswers, contact, idempotencyKey) and
`initialWizardState`. Explicitly documented as client/session state
only — never imported by `/lib/domain` and never trusted server-side;
every Server Action that later consumes it (checkCompatibility,
placeOrder, ...) revalidates on the server regardless of what the
wizard sent.
 
`web/components/wizard/wizard-store.tsx`: `WizardProvider` (React
Context, chosen over pulling in zustand as a new dependency for this)
plus `useWizard()`. State starts as `initialWizardState` on every
render, then hydrates from `sessionStorage` in a `useEffect` after
mount — this avoids any SSR/client mismatch, since the wizard has no
real state to render on the server anyway. Every change after hydration
writes back to `sessionStorage`, wrapped in try/catch (private
browsing or quota can throw; the wizard keeps working in memory for the
current page load either way). `reset()` clears both the in-memory
state and `sessionStorage`, for TASK-023's confirmation page to call
once an order is placed.
 
`web/components/wizard/step-indicator.tsx`: renders all 7 wizard steps
(Vehicle → Module → Part → Service → Details → Shipping → Done),
highlighting the current one purely from `usePathname()` — no
dependency on wizard state, so it renders correctly even before
`WizardProvider` has hydrated.
 
`web/app/(public)/order/layout.tsx`: wraps every `/order/*` step in
`WizardProvider`, renders the step indicator in a header, and
constrains content to a narrow (`max-w-2xl`) column with no desktop-only
affordances — mobile-first, matching how a customer will actually use
this (photographing a part number sticker with a phone).
 
`web/app/(public)/page.tsx`: added a "Start an order" button linking to
`/order/vehicle`. That route doesn't have a page yet — building it is
TASK-016's job — so it 404s for now; this task only wires up the shell
and the entry point.
 
No live/build verification possible in this sandbox (same limitation as
every prior code-only task) — hand-reviewed against the acceptance
criteria and standard Next.js Client Component / Context patterns.
Worth a real `npm run build` plus manually checking that wizard state
survives a reload and a back/forward navigation, and that no SSR
hydration warning appears in the console, once the user is at their
machine.
 
Commit: `ee4a832`.
 
### TASK-016 — /order/vehicle — cascading Make → Model → Year selection — **done**
 
`web/lib/actions/vehicle.ts` (Server Actions): `getMakes()`,
`getModels(make)`, `getYears(make, model)` — each queries
`prisma.vehicle.findMany` filtered by `compatibilityEntries: { some: {} }`,
so every level of the cascade only ever lists values that actually lead
to a vehicle with real compatibility data, never a dead-end combination.
`getModels`/`getYears` return `[]` immediately when their required parent
argument(s) are empty, rather than issuing a query with a meaningless
filter. Results are `distinct` on the relevant column and sorted
(alphabetical for make/model, descending for year — newest vehicles
first).
 
`web/components/wizard/vehicle-selector.tsx` (Client Component): three
shadcn `Select`s wired to `useWizard()`. `handleMakeChange` writes a full
`{make, model: "", year: null}` vehicle object (never a partial update),
so choosing a new make always resets model and year together — the
cascading-reset requirement. `handleModelChange` resets year the same
way. Downstream option lists (`models`, `years`) are fetched via the
Server Actions above in `useEffect`s keyed on `make`/`model`, wrapped in
`useTransition` so the selects show a pending state without blocking
input; this also means wizard state re-hydrated from `sessionStorage`
(TASK-015) correctly re-populates the right downstream lists on reload,
since the effects re-run from whatever `make`/`model` came back out of
storage. `canContinue = Boolean(make && model && year)`; the Next button
is disabled until all three are chosen and no fetch is pending.
 
`web/app/(public)/order/vehicle/page.tsx`: a Server Component
(`export const dynamic = "force-dynamic"`) that calls `getMakes()`
directly (not through a fetch/API round-trip) and passes the result into
`<VehicleSelector makes={makes} />` as the initial make list.
 
The Next button routes to `/order/module` (TASK-017), which doesn't exist
yet — same deliberate incremental pattern as TASK-015's link to
`/order/vehicle` — so it currently 404s until TASK-017 is built.
 
No live/build verification possible in this sandbox (same npm/tsc
limitation as every prior code-only task), and this one additionally
can't be smoke-tested here even in principle — the cascading selects
need a live Supabase connection with real compatibility data, not just
a compiled bundle. Hand-reviewed against the acceptance criteria: parent
resets on change, only-values-with-entries filtering via
`compatibilityEntries: { some: {} }` at every level, and state
persistence through `useWizard()`. Worth a real `npm run build` plus
manually exercising the three selects against the live seeded Supabase
data (Camry/Civic/F-150) once the user is at their machine.
 
Commit: `14a0290`.
 
### TASK-017 — /order/module — module category selection — **done**
 
`web/lib/actions/module.ts`: `getModuleCategories()` Server Action —
returns every `ModuleCategory` sorted by name, with its Prisma `BigInt`
id stringified. Stringifying is required here (not just tidy): a BigInt
can't cross the Server Component → Client Component prop boundary or be
`JSON.stringify`'d into `sessionStorage` by the wizard store, both of
which this value has to survive.
 
`web/components/wizard/module-selector.tsx` (Client Component): the
categories render as `Card`s in a responsive grid (2 columns on phones,
3 from `sm:` up), each with a `lucide-react` icon keyed by the exact
category name from the seed data (TASK-007) — Airbag/SRS → ShieldAlert,
ECM/PCM → Cpu, TCM/TCU → Settings2, BCM → CircuitBoard, Instrument
Cluster → Gauge — falling back to a generic wrench icon for any category
not in that map, so a category added later in the database (before this
map is updated) still renders instead of crashing. Cards are
`role="button"`/keyboard-activatable (Enter/Space), not just clickable
divs. Selecting a card writes `categoryId` (the stringified id) into
`useWizard()`; the selected card gets a primary-colored ring/background.
`canContinue = Boolean(categoryId)`; Next is disabled until then and
routes to `/order/compatibility` (TASK-018, not yet built — same
incremental-404 pattern as TASK-015/016).
 
`web/app/(public)/order/module/page.tsx`: a Server Component
(`export const dynamic = "force-dynamic"`) that calls
`getModuleCategories()` directly and renders `<ModuleSelector
categories={categories} />`.
 
No live/build verification possible in this sandbox (same npm/tsc
limitation as every prior code-only task), and — like TASK-016 — this
can't be smoke-tested here even in principle since it needs the live
Supabase category data, not just a compiled bundle. Hand-reviewed
against the acceptance criteria (cards with icons, Next disabled until
chosen) and against the actual 5 category names from the TASK-007 seed
script, so the icon map isn't guessing at unseen category strings.
Worth a real `npm run build` plus a manual click-through against the
live seeded categories once the user is at their machine.
 
Commit: `b05ae1b`.
 
### TASK-018 — /order/compatibility — Part Number, sticker photo upload, checkCompatibility — **done**
 
`web/lib/actions/compatibility.ts`: `checkCompatibility(input)` Server
Action, zod-validated (`vehicle: {make, model, year}`, `categoryId`,
`partNumber`, `stickerPhotoUrl`, the last rejected outright with
`isVercelBlobUrl()` — TASK-014's `lib/blob.ts` — if it isn't a real Blob
URL). Looks up the `Vehicle` by its unique `(make, model, year)` key,
then the `CompatibilityEntry` by its unique `(vehicleId, categoryId,
partNumber)` key using `normalizePartNumber`'s exact-match normalization
(TASK-010) — never fuzzy — loads its linked services with prices via
`CompatibilityService → Service → PriceTier`, and returns
`/lib/domain/compatibility`'s `decideMatch()` result. There is no
"matched" flag anywhere in the input: the action always re-derives the
answer from a live Prisma lookup, exactly per the acceptance criteria and
PRD 4.2's "the system never silently guesses."
 
`web/components/wizard/file-upload.tsx`: a reusable `FileUpload` that
uploads straight to Vercel Blob from the browser via `@vercel/blob/
client`'s `upload()`, hitting the TASK-014 token route
(`handleUploadUrl: "/api/uploads/token"`, `clientPayload: {purpose}`).
Shows a thumbnail preview once done, a progress bar while uploading
(from `onUploadProgress`), and an error state with retry. Takes
`purpose`/`pathPrefix` props so it's reusable as-is for TASK-020's
cloning donor/original photos and TASK-033's admin return labels.
 
`web/components/wizard/compatibility-form.tsx`: the Part Number input
(required, with helper text distinguishing the catalog P/N from the
S/N), a small illustrative reference-sticker diagram next to the upload
(PRD 4.2 calls for a reference image; no real photo asset exists, so
this is a labeled mock rather than an actual photo), and the
`FileUpload` for the label photo (required per PRD 4.2, purpose
`"wizard"`, prefix `pending/stickers`). "Check compatibility" stays
disabled until both a part number and an uploaded photo are present,
and calls `checkCompatibility`. The result renders either a
matched-services notice with a **Continue → /order/service**, or a
manual-review notice ("submitted for manual review... our team will
follow up") with **Continue → /order/details** (skipping service
selection, per the acceptance criteria). Editing the part number or
re-uploading the photo after a check clears the stored result, so a
customer can never Continue on a stale answer.
 
`web/app/(public)/order/compatibility/page.tsx`: renders the form; no
server-side data fetch needed for this step (unlike TASK-016/017's
pages, which load the initial option lists).
 
No live/build verification possible in this sandbox (same npm/tsc
limitation as every prior code-only task), and this task can't be
smoke-tested here even in principle — it needs a real browser upload
against a live `BLOB_READ_WRITE_TOKEN` and a live Supabase compatibility
entry to hit either branch. Hand-reviewed against the acceptance
criteria and PRD section 4.2. Worth a real `npm run build` plus a manual
pass once at a dev machine: upload a photo, check a known-matched part
number (e.g. the seeded Camry/Airbag-SRS entry) and an unknown one, and
confirm both Continue destinations and that editing the inputs clears a
stale result.
 
Commit: `8ea2cf5`.
 
### TASK-019 — /order/service — pick one confirmed service — **done**
 
`web/lib/format.ts`: `formatCents(cents)` — the first shared money
formatter in the app (`Intl.NumberFormat` for USD), added here since
this is the first screen that displays a price to a customer. Future
screens (TASK-021 review, TASK-028 tracking page, admin pricing/order
detail) should reuse this rather than formatting cents ad hoc, per the
"money" convention in tasks.json.
 
`web/components/wizard/service-selector.tsx` (Client Component): an
accessible `role="radiogroup"` of cards built directly from
`state.matchResult.services` — the TASK-018 match result already sitting
in wizard state, never a fresh server query, since PRD 4.3 scopes this
step to "only what was just confirmed for the exact part number."
Exactly one card is selectable (keyboard-activatable, `aria-checked`
reflects the selection), showing the service name and
`formatCents(priceCents)`; Next stays disabled until `serviceId` is set,
then routes to `/order/details`. If `matchResult.services` is empty
(e.g. a direct deep link to this URL, since TASK-024's step guards don't
exist yet), it shows a "go back" message instead of an empty radiogroup
— a temporary safety fallback, not the eventual guard.
 
`web/app/(public)/order/service/page.tsx`: renders the selector; no
server data needed, same as TASK-018's page.
 
No npm/tsc available in this sandbox; hand-reviewed against the
acceptance criteria. Needs a real `npm run build` plus a manual pass
(pick a service, confirm Next enables, confirm the price formatting)
once at a dev machine, alongside an actual matched compatibility check
from TASK-018 to populate `matchResult.services` in the first place.
 
Commit: `cb25933`.
 
### TASK-020 — /order/details — description + data-driven dynamic questions — **done**
 
`web/components/ui/textarea.tsx`: the standard shadcn `Textarea`
primitive — hadn't been installed yet; needed here for the description
field and for `textarea`-type dynamic questions.
 
`web/lib/actions/questions.ts`: `getQuestions(serviceId)` Server Action
(zod-validated). Loads the `Service` (with its `questionSetCode`), then
`QuestionDefinition` rows for that set ordered by `sortOrder`. **Judgment
call, documented in code comments:** the `Service` model has only one
`questionSetCode` field with no per-service flag for whether PRD 4.4's
generic "requires follow-up work after reinstalling the module"
`FOLLOW_UP` question set applies. There's no schema flag to check this
precisely without a schema change outside this task's scope, so
`getQuestions` always appends the `FOLLOW_UP` set after the service's own
set — for every service — except when the service's own
`questionSetCode` already **is** `"FOLLOW_UP"` (avoids asking the same
questions twice). This is a principled default rather than a hardcoded
per-category/name guess, since every seeded service ends with
reinstalling the module; it's flagged here so it isn't mistaken for an
oversight later if a future service shouldn't get it.
 
`web/components/wizard/dynamic-question.tsx`: one reusable
`DynamicQuestion` component covering all four `QuestionAnswerType`
values from a single `QuestionDefinition` prop — `text` → `Input`,
`textarea` → the new `Textarea`, `yes_no` → two toggle `Button`s
("yes"/"no"), `photo` → the TASK-018 `FileUpload` component reused as-is
(`purpose="wizard"`, `pathPrefix="pending/answers"`). No per-page
hardcoded fields, per tasks.json's "data-driven, not hardcoded per page"
convention.
 
`web/components/wizard/details-form.tsx`: the description `Textarea`
(always required, independent of any service). When `state.serviceId` is
set (the matched path), it calls `getQuestions` and renders one
`DynamicQuestion` per definition; on the pending-review path (no
`serviceId`) it renders only the description field, per the acceptance
criteria. Answers are kept in one local `values` map keyed by
`questionCode` and split back into `answers`/`photoAnswers` on submit
according to each question's `answerType`. `fieldErrors` block Next
until every `required` question has a non-empty answer, shown inline
under each field.
 
`web/app/(public)/order/details/page.tsx`: renders `<DetailsForm />`; no
server-side data fetch in the page itself (the form fetches questions
client-side once `serviceId` is known, same pattern as TASK-016's
client-driven cascading fetches).
 
No live/build verification possible in this sandbox (same npm/tsc
limitation as every prior code-only task), and this task additionally
can't be smoke-tested here even in principle — it needs a live Supabase
`QuestionDefinition` lookup for a real service's question set and a real
Blob upload for any `photo`-type question. Hand-reviewed against the
acceptance criteria and PRD 4.4's question sets. Worth a real
`npm run build` plus a manual pass once at a dev machine: submit the
pending-review path (description only), then a matched service whose
set includes at least one of each answer type (e.g. an ECM Cloning
service, which should surface `CLONING`'s photo questions plus
`FOLLOW_UP`), and confirm required-field validation blocks Next until
answered.
 
Commit: `69163e3`.
 
### TASK-021 — /order/shipping — contact details, order review, price quote — **done**
 
`web/lib/actions/shipping.ts`:
- `getQuote(serviceId)` recomputes the price quote entirely
  server-side — loads `Service.priceTier.amountCents` and the live
  `return_shipping_fee_cents` AppSetting, then calls TASK-010's
  `quote()`. Deliberately never trusts the `priceCents` already sitting
  in wizard state from TASK-018's match result, per tasks.json's "never
  trust price data from the client — recompute it on the server"
  convention; the return shipping fee especially can have changed
  since the compatibility check (via TASK-044's future admin pricing
  screen).
- `getCategoryName(categoryId)` resolves the module category id held in
  wizard state to a display name, since that's all wizard state has for
  it (TASK-017 only stores the id).
`web/components/wizard/shipping-form.tsx`:
- An order-review card lists every prior selection collected so far —
  vehicle, module (name resolved via `getCategoryName`), part number,
  service (matched path only), description — each with an **Edit**
  link back to the wizard step that collected it.
- A price card shows the service price + return shipping = total
  breakdown (via `getQuote`) on the matched path, or a manual-review
  notice ("we'll confirm the price once that's done, before anything
  is charged") on the pending-review path — plus fixed copy stating
  inbound shipping to the lab is free and that no payment is taken now
  (the Stripe link arrives by email later, once TASK-026/043 exist).
- The contact form itself uses the shadcn `Form` primitives with
  `react-hook-form` + a `zod` resolver, per the acceptance criteria:
  name, email, phone, street, city, state (regex `^[A-Z]{2}$`,
  defaulting to `"HI"`), ZIP (`^\d{5}(-\d{4})?$`) — all required. This
  is the first wizard step to use `react-hook-form` (the earlier steps
  used plain local state); `components/ui/form.tsx` was already
  scaffolded in TASK-001 but unused until now.
`web/app/(public)/order/shipping/page.tsx`: renders the form.
 
**Environment note:** this session's device-bridge shell turned out to
have `node`/`tsc`/`node_modules` present (unlike earlier assumptions),
but the installed `node_modules` predates several dependencies added to
`package.json` since TASK-002 (no `@prisma/client`, no `prisma` CLI
actually installed there) — running `npx prisma generate` confirmed
this by fetching an unrelated, newer `prisma` version instead of the
project's pinned one. Reinstalling the whole tree from this session was
out of scope for this task, so this remains hand-reviewed rather than
compiled, same as every prior code task; a real `npm install && npm run
build` is still needed once the user is at their machine. This task
also can't be smoke-tested here even in principle — it needs a live
Supabase `Service`/`PriceTier`/`AppSetting` lookup for `getQuote` and
`getCategoryName`. Worth a manual pass covering both the matched path
(price breakdown) and the pending-review path (manual-review notice),
the Edit links, and the state/ZIP validation.
 
A stale, zero-byte `.git/index.lock` from an earlier interrupted command
blocked `git add`/`commit` for this task; requested file-delete
permission for the connected folder (granted) and removed it before
committing.
 
Commit: `a9ce099`.
 
### TASK-022 — placeOrder Server Action — matched and pending-review paths — **done**
 
`web/lib/actions/place-order.ts`: `placeOrder(input)`, zod-validated
(vehicle, categoryId, partNumber, stickerPhotoUrl, serviceId,
description, answers, photoAnswers, contact, idempotencyKey).
 
- **Idempotency:** looks up an existing order by `idempotencyKey`
  first; a repeat submit (double-click, back button, a retried
  request) returns that order instead of creating a duplicate.
- **Re-derives the match entirely server-side** — the exact same
  Vehicle → CompatibilityEntry → CompatibilityService lookup and
  `decideMatch()` rule `checkCompatibility` (TASK-018) itself uses,
  inlined here rather than called as a sub-action so this function
  also gets the vehicle's own id (`Order.vehicleId` is required, and
  `checkCompatibility`'s return value doesn't carry it). The client's
  own match result and selected `serviceId` play no part in this
  decision; a submitted `serviceId` is only honored when it is one of
  the services this fresh lookup just confirmed.
- **Matched path:** re-validates every required question/photo for the
  selected service against the LIVE `QuestionDefinition` rows (own
  question set + `FOLLOW_UP`, TASK-020's rule) — not just whatever the
  client happened to submit — rejecting a payload missing a required
  answer or carrying a non-Blob-URL photo. Snapshots the quote via
  TASK-010's `quote()` using the live `PriceTier` amount and
  `return_shipping_fee_cents` AppSetting (never the client's
  remembered price). Creates the order, its sticker photo, any
  answer/photo rows, and the initial `pending_review` history row in
  one `prisma.$transaction`, then calls TASK-011's `advanceOrderStatus`
  to move it to `awaiting_payment` as a **separate**, already-
  established transition (not folded into the creation transaction).
- **Pending-review path:** creates the order with
  `matchedEntryId`/`serviceId`/all three price fields left `null` and
  no answer/photo rows beyond the sticker — any answers/photos the
  client sent are ignored, since there's no service yet to validate
  them against, matching TASK-020's "pending-review path shows only
  the description."
- **Photo-type answers** map to the Order/OrderPhoto schema's fixed
  `PhotoType` enum (`sticker`/`donor`/`original` — no generic value) by
  `questionCode`, via a small `photoTypeForQuestionCode()` helper.
  Documented as a judgment call, the same shape as TASK-020's
  `questionSetCode` gap: only `"donor_photo"` and `"original_photo"`
  exist in the seed data today, so those are the only two mappings;
  any other photo question code throws rather than silently
  mis-tagging the photo.
- Returns `{orderNumber, trackingToken, status}` — `orderNumber` is the
  order's own `id`, stringified: this schema has no separate
  order-number column, so the id fills that role, consistent with how
  every other task (TASK-023/028/030/031) refers to "the order number."
**Environment note:** same `node_modules`/`package.json` mismatch as
TASK-021 (no working local `prisma generate`), so this is hand-reviewed
against the acceptance criteria and the existing
`checkCompatibility`/`order-status` patterns rather than compiled; a
real `npm install && npm run build` is still needed once the user is at
their machine. Also can't be smoke-tested here even in principle — it
needs a live Supabase database with real seeded compatibility data to
exercise both paths. Worth a manual pass covering: a matched order
(confirms `awaiting_payment` + all snapshot fields land correctly), a
pending-review order (confirms the null price fields), a repeat submit
with the same `idempotencyKey` (confirms no duplicate order), and a
tampered `serviceId` not in the confirmed list (confirms rejection).
 
Commit: `44cfca6`.
 
### TASK-023 — /order/confirmation — screen after submit — **done**
 
This is also where `placeOrder` (TASK-022) finally gets wired into the
UI — nothing called it until now.
 
`web/lib/wizard/order-result.ts`: a small, deliberately separate
sessionStorage record (`OrderResult`: `orderNumber`, `trackingToken`,
`status`, `matched`, `categoryName`, `isCloning`,
`originalPartNumber`/`donorPartNumber`) plus `writeOrderResult`/
`readOrderResult`. Not folded into `WizardState`/`wizard-store.tsx`: it
has to survive the wizard reset that clears everything else, and it's
written once and read once rather than round-tripped through
`update()`.
 
`web/components/wizard/shipping-form.tsx`: its submit handler is now
the real order submission, not just a save-and-continue. After the
contact form validates, it assembles the full `PlaceOrderInput`
directly from wizard state (`vehicle`, `categoryId`, `partNumber`,
`stickerPhotoUrl`, `serviceId`, `description`, `answers`,
`photoAnswers`, the just-validated `contact`, `idempotencyKey`) and
calls `placeOrder()`. On success it captures an `OrderResult` —
including whether this was a cloning order (`answers.original_photo`/
`donor_photo` present) and the original/donor part numbers from
`answers` — via `writeOrderResult()` **before** calling
`useWizard().reset()`, since the confirmation page has nothing of its
own left to read once that reset runs, then navigates to
`/order/confirmation`. The submit button reads "Place order" now
(previously "Review & continue", when it only saved contact info and
navigated), shows a spinner while pending, and a request that throws
(missing wizard state, a rejected `placeOrder` call) shows an inline
error and re-enables the button rather than navigating anywhere.
 
`web/components/wizard/confirmation.tsx` +
`web/app/(public)/order/confirmation/page.tsx`: reads the handoff
record on mount (not wizard state, which is already gone by the time
this renders) and shows:
- the order number (and module/category name, if known);
- a copyable tracking link, `/track/[token]` — TASK-028 hasn't built
  that page yet, so it 404s for now, the same incremental pattern used
  at every prior wizard step;
- text that differs by path: "check your email for a secure payment
  link" (matched) vs. "your part... is going to manual review"
  (pending-review);
- for cloning orders, which modules to ship ("your original module" +
  "the donor module", each with its part number when the customer gave
  one) — for every other order, a plain "just the module you're having
  serviced" notice;
- a fallback "we couldn't find an order to confirm... start a new
  order" card if the handoff record is missing (e.g. someone links
  straight to `/order/confirmation` with nothing just submitted).
**Judgment call:** "which modules to ship" is decided from whether the
wizard's `photoAnswers` contains `original_photo`/`donor_photo` —
the two cloning-only photo questions from TASK-020/022's seed data —
rather than from the module category or service name, since neither
the wizard state nor `PlaceOrderResult` carries the selected service's
`questionSetCode`. This mirrors TASK-022's own
`photoTypeForQuestionCode()` judgment call in spirit (same two
question codes, same underlying schema gap).
 
**Not in scope here:** wizard step guards for deep-linking straight to
this page (or any other step) with no real order behind it — that is
TASK-024's job; this task's fallback card is a stand-in, not the
eventual guard.
 
**Environment note:** ran `npx tsc --noEmit` in this session (the
device-bridge shell has `node`/`tsc`, per TASK-021's discovery) — it
still fails, but every failure is the same pre-existing environment gap
noted in TASK-021/022 (`@prisma/client`, `@supabase/ssr`,
`@vercel/blob/client` all unresolved because `node_modules` predates
those `package.json` dependencies) plus a few unrelated pre-existing
`any`-parameter warnings in older files. None of the errors are in any
file this task touched (`shipping-form.tsx`, `confirmation.tsx`,
`order-result.ts`, or the new confirmation `page.tsx`) — confirmed by
checking the full error list line by line. Real compilation still isn't
possible here; hand-reviewed against the acceptance criteria instead. A
real `npm install && npm run build` is still needed once the user is at
their machine, along with a manual pass covering both paths (matched
and pending-review), a cloning order (confirms both modules listed with
their part numbers), a non-cloning order, and reloading the
confirmation page (should keep showing the same order, not blank out).
 
Commit: `39b692b`.
 
### TASK-024 — Wizard step guards — **done**
 
`web/lib/wizard/guards.ts`: `redirectTargetFor(step, state)` — a pure
function covering all 6 guarded steps (everything but
`/order/confirmation`, which has no wizard state left to check by the
time it renders — see TASK-023). For each step it checks only what a
PRIOR step should already have collected, and returns either `null`
("this step is fine to render") or the path of the earlier step to
send the customer back to:
- `/order/module` needs a `vehicle`.
- `/order/compatibility` needs a `vehicle` and a `categoryId`.
- `/order/service` needs a **successful** match (`matchResult.matched`
  with at least one confirmed service) — per this task's acceptance
  criteria, phrased as "redirects to /order/compatibility unless the
  store holds a successful match" rather than a deeper chain back
  through module/vehicle; a missing vehicle or category also fails
  this same check and still lands on `/order/compatibility`, whose own
  guard (above) takes it further back if needed.
- `/order/details` needs a compatibility check to have actually run
  (`matchResult !== null`), and if matched, a `serviceId` chosen.
- `/order/shipping` needs all of the above plus a saved `description`
  (only written to wizard state once `/order/details`' Next is
  clicked — this step is where `placeOrder` is finally called, so it
  has the most to check).
`web/components/wizard/use-step-guard.ts`: `useStepGuard(step)` — the
client hook each step's component now calls. Reads `state` and the new
`isHydrated` flag (below) from `useWizard()`; while not yet hydrated it
treats nothing as decided (checking earlier would see
`initialWizardState` on every single page load, before the real data
has even been read from sessionStorage, and misfire a redirect every
time). Once hydrated, if `redirectTargetFor` returns a target it calls
`router.replace(target)` in a `useEffect`. Returns whether the step is
clear to render, so the calling component can render `null` for that
one frame instead of flashing a step it's about to leave.
 
`web/components/wizard/wizard-store.tsx`: exposes the store's existing
internal hydration flag as `isHydrated` on `WizardContextValue` — it
already existed (used to gate the sessionStorage read/write effects)
but wasn't visible to consumers outside the provider until now.
 
Wired into all 6 step components (`vehicle-selector`, `module-selector`,
`compatibility-form`, `service-selector`, `details-form`,
`shipping-form`): each calls `useStepGuard("<step>")` right after
`useWizard()` and renders `null` until it returns `true`.
`service-selector.tsx`'s temporary "go back" fallback message — added
in TASK-019 and explicitly flagged there as "a temporary safety
fallback, not the eventual guard" — is now replaced by the real
redirect.
 
**Environment note:** ran `npx tsc --noEmit` — the only errors in any
file this task touched are two pre-existing `MatchResult`/
`WizardMatchResult` type-mismatch errors in `compatibility-form.tsx`
(present since before this task, at shifted line numbers because of
the added guard lines) — no new errors introduced. Real compilation is
still blocked by the same `node_modules`/`package.json` mismatch noted
in TASK-021/022/023. Worth a manual pass once at a dev machine:
reloading mid-wizard on each step (should stay put, not bounce back),
using browser back after placing an order, and deep-linking straight
to `/order/service` and `/order/shipping` with an empty
`sessionStorage` (should land on `/order/compatibility` and
`/order/vehicle` respectively, following the guard chain back).
 
Commit: `90d2acc`.
 
### TASK-025 — Stripe client wrapper and createPaymentLink — **done**
 
`web/lib/stripe.ts`: a `server-only` module exporting a single `stripe`
client (`new Stripe(env.STRIPE_SECRET_KEY)`) plus `createPaymentLink`.
`apiVersion` is deliberately left unset (documented in a code comment)
rather than pinned to a literal string, since the installed `stripe`
SDK version already fixes it, and hand-picking a version string here
would drift from whatever the SDK actually expects.
 
`createPaymentLink(order: PayableOrder)` calls
`stripe.paymentLinks.create()` with:
- two `price_data` line items built inline (no pre-created Stripe
  `Price` objects) — "ECU Service Lab — Order #<id> service" at
  `order.servicePriceCents`, and "Return shipping" at
  `order.returnShippingFeeCents`, both `currency: "usd"`;
- `metadata: {orderId, trackingToken}` — the only correlation TASK-027's
  webhook handler will have back to the order, since Stripe's own
  Payment Link object has no notion of "this is order #123";
- `after_completion: {type: "redirect", redirect: {url: ".../track/
  [token]"}}` built from `env.NEXT_PUBLIC_SITE_URL` and
  `order.trackingToken`.
`PayableOrder` is a small, narrow type (`id: bigint`, `trackingToken`,
`servicePriceCents: number`, `returnShippingFeeCents: number` — all
non-nullable) rather than the full nullable-priced Prisma `Order` model.
**Judgment call:** this makes it a compile-time error to call
`createPaymentLink` with an order whose price snapshot isn't set yet,
pushing the "is this order actually eligible for a payment link"
responsibility onto TASK-026's caller (which has the real order and its
current status in hand) rather than adding a redundant runtime null
-check inside this function.
 
**Deliberately out of scope, reserved for TASK-026:** any database
reads or writes, any eligibility check (order status, an existing link
already on the order), and wiring this into `advanceOrderStatus`'s
side-effect registry from TASK-011. This task only wraps the Stripe API
call itself.
 
`web/package.json`: added `"stripe": "^17.5.0"` to `dependencies`.
`.env.example` already listed `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`
since TASK-001, so no changes were needed there.
 
**Environment note:** same category of gap as every prior task since
TASK-012 — `npx tsc --noEmit` reports `Cannot find module 'stripe'` for
`lib/stripe.ts`, because this session's `node_modules` predates several
dependencies added to `package.json` over the project's life
(`@prisma/client`, `@supabase/ssr`, `@vercel/blob/client`, and now
`stripe` all fail to resolve the same way). Confirmed via
`ls node_modules/stripe` that the package genuinely isn't installed
here, not a path/config issue. Hand-reviewed against the Stripe Node
SDK's `paymentLinks.create()` API and the acceptance criteria instead. A
real `npm install && npm run build` is still needed once the user is at
their machine; test mode vs. live mode is selected purely by which
`STRIPE_SECRET_KEY` is set in Vercel (still an empty placeholder there
per TASK-008), so nothing about this file changes between the two.
 
Commit: `916f618`.
 
### TASK-026 — Payment gate: create the payment link on awaiting_payment — **done**
 
`web/lib/services/payment.ts`: `ensurePaymentLink(order, options?)`:
- **Eligibility, enforced here, never trusted from a caller:** the
  order must currently be in `awaiting_payment` (never generate a link
  for an order that hasn't been matched/quoted yet, or that has already
  moved past this stage), and must have a full price snapshot
  (`servicePriceCents` AND `returnShippingFeeCents` both set — the
  exact two fields TASK-025's `PayableOrder` type requires). Both
  refusals throw a typed `PaymentLinkIneligibleError` carrying the
  order id and a human-readable reason.
- **Reuse, never duplicate:** if the order already has a
  `stripePaymentLinkId`, this is a no-op returning the order unchanged
  — the acceptance criteria's central requirement. Passing
  `{force: true}` (used only by `regeneratePaymentLink` below) skips
  that check and always asks Stripe for a fresh link.
- Otherwise calls TASK-025's `createPaymentLink()` and saves the
  resulting `stripePaymentLinkId`/`paymentLinkUrl` onto the order.
- **Registration:** at module load time, calls
  `registerStatusSideEffect("awaiting_payment", ...)` (TASK-011's
  registry) with a wrapper that calls `ensurePaymentLink(order)` (no
  force) — so every order that transitions into `awaiting_payment`
  automatically gets a payment link, and a thrown error here is caught
  and logged by `advanceOrderStatus` itself without rolling back the
  status change (per TASK-011's design), leaving the order without a
  link until an admin retries it.
**Judgment call, documented in a code comment:** side-effect
registration only takes effect once `payment.ts` has actually been
imported somewhere (the `registerStatusSideEffect` call runs at module
load, not automatically/globally). `placeOrder` (TASK-022,
`lib/actions/place-order.ts`) is today's only caller that transitions
an order into `awaiting_payment`, so it now carries a
side-effect-only `import "@/lib/services/payment"` with a comment
explaining why it's there. TASK-036's future `confirmCompatibility`
(the other path into `awaiting_payment`, from the review queue) will
need the same import when it's written — flagged here so it isn't
missed and silently produces orders with no payment link.
 
`web/lib/actions/payment.ts`: `regeneratePaymentLink(orderId)` —
`requireAdmin()`-gated, zod-validated, for TASK-031's future "Regenerate
payment link" button. Calls `ensurePaymentLink(order, {force: true})`
so an explicit admin action always asks Stripe again (an intentional
override, unlike the automatic side effect's dedupe-by-default), while
still refusing ineligible orders through the same
`PaymentLinkIneligibleError`. A genuine Stripe API failure is logged
server-side and surfaced to the caller as a generic
"Failed to create a Stripe payment link. Please try again." message —
never the raw Stripe error text.
 
**Verified via the Stripe MCP connector** (test-mode sandbox account,
`acct_1UJc7qJdi1u9Cd3o` "Hawaii Service Lab sandbox"): fetched the real
`POST /v1/payment_links` parameter schema and confirmed TASK-025's
`lib/stripe.ts` request shape — `line_items[].price_data` (currency,
product_data.name, unit_amount, quantity), top-level `metadata`, and
`after_completion.redirect.url` — matches the live API exactly; no
changes needed to `stripe.ts` itself. No live Stripe API call was made
from this session (this task adds no new Stripe request shapes beyond
TASK-025's, and no real order data exists in the sandbox account to
test against).
 
**Environment note:** same category of gap as every task since
TASK-012 — `npx tsc --noEmit` reports `Cannot find module '@prisma/client'`
in both new/changed files (`lib/services/payment.ts`,
`lib/actions/place-order.ts`), which is the same pre-existing
node_modules/package.json mismatch, not a new problem; `lib/actions/
payment.ts` itself has zero errors. Total error count (31) is
consistent with the pre-existing baseline. A real `npm install && npm
run build` is still needed once the user is at their machine, along
with a manual pass once TASK-031's admin UI exists: place a matched
order, confirm a payment link is created and saved automatically, call
`regeneratePaymentLink` on it and confirm it's overwritten with a new
Stripe link id, and confirm a pending-review order or a non-
awaiting_payment order is rejected by both paths.
 
Commit: `ac611f3`.
 
### TASK-027 — Stripe webhook Route Handler — **done**
 
`web/app/api/webhooks/stripe/route.ts`: `POST` handler,
`export const runtime = "nodejs"` (signature verification needs Node's
crypto, which isn't available the same way on the Edge runtime).
 
- Reads the exact raw request body via `await request.text()` (never
  `request.json()`, which would re-serialize the payload and break
  signature verification) and verifies it with
  `stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)`.
  A missing `stripe-signature` header or a failed verification returns
  400 — never processed further.
- **Idempotency:** inserts the event id into `StripeEvent` (with its
  `type`) BEFORE any processing, per the acceptance criteria. A
  duplicate delivery hits `StripeEvent.id`'s unique primary key
  (Prisma error code `P2002`) and is acknowledged with
  `{received: true, duplicate: true}` and no side effects.
- **checkout.session.completed:** reads `session.metadata.orderId` (set
  by TASK-025's `createPaymentLink`), and calls
  `advanceOrderStatus(orderId, "payment_received", "system",
  {stripePaymentStatus: session.payment_status})`. A missing or
  non-numeric `metadata.orderId` is logged and skipped rather than
  thrown. An `InvalidStatusTransitionError` (the order already moved
  past `awaiting_payment` — a duplicate or out-of-order delivery) is
  logged as a warning, not treated as a webhook failure.
- Every other event type is acknowledged with `{received: true}` and
  ignored.
**Judgment call, documented in the file's docblock:** because the event
id is recorded as processed BEFORE `advanceOrderStatus` runs, a genuine
processing failure (the order doesn't exist, a transient DB error) can
never be recovered by a Stripe retry — the retry would just see the
event already recorded and skip it as a duplicate. This route therefore
always acknowledges with 200 once the event is recorded, logging any
processing failure server-side rather than returning a 5xx that would
trigger a now-useless retry; a stuck order is meant to be fixed
manually (e.g. TASK-026's `regeneratePaymentLink`, or a manual status
update once TASK-032 exists), not by Stripe's retry mechanism, once the
event has been marked seen. This mirrors TASK-011's own side-effect
design (log and move on, never silently re-attempt indefinitely).
 
**Environment note:** same category of gap as every task since
TASK-012 — `tsc` reports the pre-existing `Cannot find module 'stripe'`/
`'@prisma/client'` errors for this file, plus one cascading
`TS18046 ('error' is of type 'unknown')` on the `Prisma.
PrismaClientKnownRequestError` `instanceof` check: with `@prisma/client`
itself unresolved, `Prisma` types as `any`, so the `instanceof` narrowing
doesn't kick in — not a new logic bug, resolves once real types are
installed. No other new errors. A real `npm install && npm run build`,
registering this URL in the Stripe dashboard, and a live test-mode
checkout are still needed once the user is at their machine (TASK-046
registers the production endpoint).
 
Commit: `cf71ccf`.
 
### TASK-030 — /admin/orders — filterable, paginated order list — **done**
 
Built out of numeric order at the user's explicit request (TASK-028/029
are still pending; TASK-030's own dependencies, TASK-013 and TASK-004,
are both done, so nothing blocks it).
 
`web/app/admin/(dashboard)/orders/page.tsx` (rewritten from its
TASK-013 placeholder): an `async` Server Component. Parses
`status`/`q`/`dateFrom`/`dateTo`/`page` out of Next 15's
`searchParams: Promise<...>`, builds a `Prisma.OrderWhereInput`:
- `status` is only applied when it's one of `STATUS_LABELS`'s own keys
  (`isValidStatus`) — an unrecognized value in the URL is silently
  ignored rather than thrown, since a stale/hand-edited query string
  shouldn't 500 the page.
- `q` is matched against `customerEmail`/`partNumberEntered`
  case-insensitively (`mode: "insensitive"`), plus an exact `id` match
  when the whole string is digits (`BigInt(q)`) — lets a support rep
  paste an order number straight into the search box alongside email/
  part-number search.
- `dateFrom`/`dateTo` become UTC day-boundary bounds
  (`T00:00:00.000Z`/`T23:59:59.999Z`) on `createdAt`, guarding against
  an invalid date string turning into `Invalid Date` silently.
Runs `findMany` (with `vehicle`/`category`/`service` included,
`orderBy: createdAt desc`, `PAGE_SIZE = 20` skip/take) and `count` in
parallel via `Promise.all`, maps each order to the plain `OrderRow`
shape the table needs (BigInt `id` stringified, vehicle/category/
service flattened to display strings, `createdAt` ISO-stringified),
and renders `<OrdersFilterBar />`, `<OrdersTable orders={rows} />`,
`<OrdersPagination page={page} totalPages={totalPages} />`.
**No explicit `requireAdmin()` call in this page** — a deliberate
judgment call, consistent with TASK-012/013's existing layering:
`middleware.ts` plus `app/admin/(dashboard)/layout.tsx`'s
redirect-on-no-session already guard every page navigation under
`/admin/*`. `requireAdmin()` is reserved for Server Actions and Route
Handlers, which Next.js exposes as independently reachable endpoints
that bypass page-level guards entirely — a plain Server Component page
like this one doesn't need its own copy of that check.
 
`web/components/admin/orders-filter-bar.tsx` (new, Client Component):
every control writes to the URL's own `URLSearchParams` via
`router.replace` — never local-only state — so this Server Component
page re-queries Prisma with the new filters on the next render, and the
resulting URL stays shareable/bookmarkable and works with the browser
back button. The search box is the one control with local state: it's
debounced 400ms before reaching the URL (re-querying Prisma on every
keystroke would be far too eager), while the status `Select` and the
two `type="date"` inputs write to the URL immediately, since those are
discrete, infrequent choices. Changing any filter besides the page
number itself resets `page` back to unset — landing on "page 3" of a
query that just changed would otherwise show a confusing, likely-empty
result. The date inputs are native, uncontrolled `<input type="date">`s
keyed by their own URL value (`key={`from-${dateFrom}`}`) so a "Clear
filters" click (which only touches the URL) still visibly resets them.
 
`web/components/admin/orders-table.tsx` (new, Client Component): the
shadcn `Table` from the acceptance criteria, rendering `OrderRow[]` —
Order, Vehicle, Module, Service, Customer, a colored `OrderStatusBadge`,
right-aligned formatted total, and a placed-at timestamp. It's a Client
Component specifically so the **whole row** is click/keyboard-navigable
to `/admin/orders/${order.id}` (`role="link"`, `tabIndex={0}`,
Enter/Space handled) — that route doesn't exist until TASK-031, so it
currently 404s, the same incremental-404 pattern used throughout the
public wizard. The order-number cell is also a real `<Link>` with its
own `stopPropagation()`, so cmd/ctrl-click-to-open-in-a-new-tab and
screen readers keep working independent of the row's own click handler.
Empty state: "No orders match these filters."
 
`web/components/admin/orders-pagination.tsx` (new): Prev/Next rendered
as real `<Link>`s wrapped in shadcn's `Button asChild` (confirmed
`components/ui/button.tsx` supports `asChild` via Radix's `Slot` before
relying on it) rather than a `router.push` handler, so paged URLs stay
real, bookmarkable links and the browser back button works across
pages, consistent with how `OrdersFilterBar` treats every other filter.
Renders `null` when `totalPages <= 1`.
 
`web/components/admin/order-status-badge.tsx` (new): a shadcn `Badge`
(`variant="outline"`) colored via the existing `STATUS_COLORS` map
from TASK-009's `lib/constants.ts` — no new color logic, just wiring an
existing map into a small reusable component so `OrdersTable` (and
later TASK-031's detail page) don't each reimplement it.
 
**Environment note:** `npx tsc --noEmit` run against the full project.
Zero errors in any file this task touched (`page.tsx`,
`orders-filter-bar.tsx`, `orders-table.tsx`, `orders-pagination.tsx`,
`order-status-badge.tsx`). The errors the run does report are all
pre-existing and in files this task didn't touch:
`compatibility-form.tsx`'s `MatchResult`/`WizardMatchResult` mismatch
(flagged back in TASK-024), `lib/stripe.ts`'s `price_data` shape
(flagged in TASK-025 — a `stripe` SDK type-version mismatch, not a
runtime bug per TASK-026's live-schema check), and two `any`-parameter
warnings in `lib/supabase/{middleware,server}.ts` (flagged since
TASK-012). No new errors anywhere. A real `npm install && npm run build`
plus a manual pass against the live Supabase order data — checking each
filter individually, the debounced search, the Clear-filters reset, and
that Prev/Next actually page through more than 20 orders — is still
needed once the user is at their machine.
 
Commit: `ece111b`.
 
### TASK-031 — /admin/orders/[id] — order detail — **done**
 
`web/app/admin/(dashboard)/orders/[id]/page.tsx` (new, no placeholder
existed for this route before — TASK-013 never created one, since a
dynamic segment can't be a static nav link): a plain `async` Server
Component. Awaits Next 15's `params: Promise<{id: string}>`, parses the
id as a `BigInt` (`notFound()` on a non-numeric id), looks up the order
with `vehicle`/`category`/`service`/`photos`/`answers`/`statusHistory`
all included (`notFound()` again if no order matches), and renders:
 
- Vehicle/module/part number/service, in a card.
- Customer name/email/phone and return address, in a card — the email
  links to `/admin/orders?q=<email>` (TASK-034's future exact-match
  filter isn't built yet, so this reuses TASK-030's existing free-text
  `q` search, which already matches `customerEmail` case-insensitively;
  it isn't an exact match today, but it's a real, working link rather
  than a dead one).
- Price breakdown (service + return shipping = total) when
  `totalAmountCents` is set, else a "price not yet set" notice — same
  has-a-snapshot check TASK-021/030 already use.
- Stripe payment status and link (or "None"), plus the
  **Regenerate payment link** button (below) exactly when
  `status === "awaiting_payment" && !paymentLinkUrl` — the acceptance
  criteria's own condition, applied directly rather than reimplemented
  inside the button component.
- The order's `description` (always present) and any `OrderAnswer`
  rows, **each labeled with its question's `label`** rather than its
  raw `questionCode`: a direct `prisma.questionDefinition.findMany`
  scoped to `[service.questionSetCode, "FOLLOW_UP"]` (skipping the
  `FOLLOW_UP` half when the service's own set already *is*
  `"FOLLOW_UP"`) — the identical rule TASK-020's `getQuestions` Server
  Action already encodes, reproduced here as a plain query rather than
  calling that action, since this is a read entirely within an
  already-server context. Only queried when the order actually has
  answers (pending-review orders never do, per TASK-022).
- A photo gallery and the full status history timeline (both below).
**No explicit `requireAdmin()` call** — the identical layering decision
TASK-030 made for the orders list: page navigations under `/admin/*`
are already guarded by `middleware.ts` and the dashboard layout;
`requireAdmin()` belongs on the Server Actions this page's own buttons
call (`regeneratePaymentLink`), which are independently reachable.
 
`web/components/admin/order-photo-gallery.tsx` (new, Client Component):
a thumbnail grid — one per `OrderPhoto` (`sticker`/`donor`/`original`,
labeled via a small display-name map) — that opens the shadcn `Dialog`
as a lightbox on click, showing the full photo. Uses `next/image` with
`unoptimized` rather than trying to pre-register Vercel Blob's upload
domain in `next.config`'s remote-pattern allowlist: every project's
Blob store gets its own random subdomain, so there is no single fixed
hostname to pin ahead of time.
 
`web/components/admin/order-status-timeline.tsx` (new): a plain,
oldest-first list of `OrderStatusHistory` rows, reusing the existing
`STATUS_LABELS` map from `lib/constants.ts` (TASK-009) rather than
re-deriving status display text — the same reuse principle
`OrderStatusBadge` (TASK-030) already established for `STATUS_COLORS`.
 
`web/components/admin/regenerate-payment-link-button.tsx` (new, Client
Component): calls the already-existing `regeneratePaymentLink` Server
Action (built ahead of time in TASK-026, specifically for this button),
shows a `sonner` toast on success/failure (the `Toaster` has been
mounted in `app/layout.tsx` since TASK-001, so no new wiring was
needed), and calls `router.refresh()` on success so the page re-fetches
the order and the button disappears once `paymentLinkUrl` is set.
 
**Environment note:** `npx tsc --noEmit` run against the full project.
Zero errors in any file this task touched (`page.tsx`,
`order-photo-gallery.tsx`, `order-status-timeline.tsx`,
`regenerate-payment-link-button.tsx`). The errors the run does report
are the same pre-existing ones already flagged in TASK-024/025/030's
notes (`compatibility-form.tsx`, `lib/stripe.ts`,
`lib/supabase/{middleware,server}.ts`) — no new errors anywhere. A real
`npm install && npm run build` plus a manual pass once the user is at
their machine is still needed: open a matched order and a pending-review
order (confirms both layouts), open the photo lightbox, and click
Regenerate payment link on an `awaiting_payment` order with no link yet
(confirms the toast, the refresh, and that the button then disappears).
 
Commit: `50fab56`.
 
### TASK-032 — Admin manual status update — **done**
 
`web/lib/actions/order-status.ts` (new — distinct from
`web/lib/services/order-status.ts`, a different directory and a different
job): `updateOrderStatus(input)` Server Action, `requireAdmin()`-gated,
zod-validated (`orderId`, `newStatus` restricted to the exact
`OrderStatusValue` literal set via `z.enum(ORDER_STATUSES as unknown as
[OrderStatusValue, ...OrderStatusValue[]])` — casting TASK-009's existing
exported `ORDER_STATUSES` readonly array into the fixed-length tuple shape
`z.enum()` requires, rather than hand-duplicating the literal list a
second time — plus an optional `returnTrackingNo`).
 
- Looks up the order fresh (never trusts a status the caller might have
  cached), then enforces the acceptance criteria's central restriction:
  **`pending_review → awaiting_payment` is never performed by this
  action**, even though it's domain-legal in `/lib/domain/status`'s
  `TRANSITIONS` map (TASK-009 already documented this as reserved for
  TASK-036's future `confirmCompatibility`). Throws a clear error naming
  the review queue instead.
- Independently re-checks the requested move against
  `nextStatuses(currentStatus)` — defense in depth against a tampered or
  stale request bypassing the UI's own filtering (below).
- Calls TASK-011's `advanceOrderStatus(orderId, newStatus, changedBy,
  extra)`, passing `{returnTrackingNo}` only when moving to
  `ready_shipped_back` with one supplied, and `changedBy` as the admin's
  own email (truncated to 50 chars) from `requireAdmin()`'s session —
  never a hardcoded `"admin"` string unless the email is somehow missing.
- Calls `revalidatePath` on both the detail page and the orders list, per
  the acceptance criteria's "refreshed history."
`web/components/admin/update-status-control.tsx` (new, Client
Component): `UpdateStatusControl({orderId, currentStatus})`.
`nextStatuses(currentStatus)` decides the offered options, but is forced
to `[]` whenever `currentStatus === "pending_review"` — the first layer
of the same defense-in-depth restriction the Server Action enforces
independently — showing explanatory text instead ("Confirm compatibility
in the review queue...", or "no further status changes available" for a
genuinely terminal order). Otherwise renders a shadcn `Select` of the
allowed next statuses (labeled via the existing `STATUS_LABELS` map), an
`Input` for an optional return tracking number that only appears once
`ready_shipped_back` is selected, and an "Update status" button that
opens a confirm `Dialog` (the same plain `Dialog` primitive
TASK-031's photo lightbox already established as a confirmation-modal
pattern, since no shadcn `AlertDialog` is scaffolded) rather than firing
the mutation directly. Confirming runs `updateOrderStatus` inside
`useTransition`, shows a `sonner` toast on success/failure, and calls
`router.refresh()` on success so the timeline and the dropdown's own
options (now based on the new `currentStatus`) update immediately.
 
`web/app/admin/(dashboard)/orders/[id]/page.tsx` (edited, not
rewritten): added a "Manage status" `Card` housing
`<UpdateStatusControl orderId={order.id.toString()}
currentStatus={order.status} />`, placed right after the page's header
and before the existing vehicle/customer/price/Stripe grid — the first
thing an admin sees below the order number, since changing status is
this page's primary admin action. Updated the file's top docblock to
mention TASK-032 alongside TASK-031's original scope.
 
**Environment note:** `npx tsc --noEmit` run against the full project.
Zero errors in any file this task touched (`page.tsx`,
`update-status-control.tsx`, `lib/actions/order-status.ts`). The errors
the run does report are the same pre-existing four already flagged in
TASK-024/025/030/031's notes — `compatibility-form.tsx`'s
`MatchResult`/`WizardMatchResult` mismatch (×2), `lib/stripe.ts`'s
`price_data` shape (×2, a `stripe` SDK type-version mismatch), and the
`any`-parameter warnings in `lib/supabase/{middleware,server}.ts` (×1
each) — no new errors anywhere. A real `npm install && npm run build`
plus a manual pass once the user is at their machine is still needed:
open an order in each status and confirm the dropdown only ever offers
its legal `nextStatuses()`; confirm `pending_review` shows the
review-queue message instead of a dropdown; move an order to
`ready_shipped_back` with a tracking number and confirm it's saved and
shows in the timeline; and confirm the confirm-dialog/toast/refresh
cycle all work together.
 
Commit: `91cfa37`.
 
### tasks.json updated
 
TASK-002 through TASK-027, TASK-030, TASK-031 and TASK-032 are now
`"status": "done"` in this Project's `tasks.json`. TASK-028, TASK-029 and
TASK-033 onward remain `pending`.
 
**Next up:** **TASK-028** (`/track/[token]`, the public tracking page —
the confirmation page's tracking link has pointed at it since TASK-023,
and it depends only on the already-done TASK-022) remains the most
overdue pick, since it's customer-facing and has been a dead link since
early in the project. On the admin side, **TASK-035** (the review queue,
unblocked since TASK-031) and **TASK-033/034** (return label upload,
customer history by email — both unblocked since TASK-031 but lower
priority/medium) are the natural next admin-side picks. TASK-036/037
(confirm-compatibility and its dialog) depend on TASK-026 (done) but not
on any admin-UI task built so far, so either is also available. TASK-029
still depends on TASK-028.
 
## 2026-09-26 — TASK-035: /admin/review-queue pending_review worklist
- Server Component lists pending_review orders oldest-first as ReviewQueueCard (sticker photo, part number, vehicle, category, description); nav badge shows server-loaded pending count. Commit `6114f77`.
## 2026-09-26 — Vercel build fixed (was failing since TASK-025, commit 916f618)
- Real `npm install` (device shell, not this sandbox) exposed 3 genuine type bugs hidden by stale sandbox node_modules (compatibility-form's MatchResult mismatch, Stripe Payment Links needing real Price ids not inline price_data, implicit-any cookie callbacks) plus a 4th issue: `lib/env.ts` validated all env vars eagerly at import time, which `next build`'s page-data-collection step ran unconditionally, requiring unset future-feature secrets (Resend, Supabase service-role) just to build. Fixed all 4; `lib/env.ts` now validates per-key, lazily, on first actual use. Verified with a real green `next build`. Commit `f52f3bc` pushed to `main` — blocked by this session's GitHub connector not authorizing this repo (`ArseniAstonMartin/service_lab` not in session's authorized repository set); needs the user to authorize it or push manually.

## 2026-09-26 — TASK-028: /track/[token] public tracking page
- Server Component looks up by tracking token only (Prisma select excludes PII/photos); unknown tokens hit a generic not-found. Shows order number, vehicle, module, service, totals, a 7-stage history timeline, and Pay now when status is awaiting_payment with a paymentLinkUrl.
- **Next up:** TASK-029 (packing slip / return label on this page, now unblocked). Other critical unblocked picks: TASK-036 confirmCompatibility.
 
