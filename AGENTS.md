# Repository Guidelines

## Project Structure & Module Organization

Best Auto Repair is a Next.js App Router application with TypeScript, Prisma, and Supabase. Application code lives in `web/`:

- `app/(marketing)/`, `app/(public)/`, `app/admin/`, and `app/api/`: marketing, checkout, admin, and integration routes.
- `components/`: shared UI, wizard, admin, and tracking components.
- `lib/domain/`: pure business rules; keep framework and database imports out.
- `lib/actions/`, `lib/services/`, and `lib/email/`: Server Actions, shared orchestration, and email templates.
- `prisma/`: schema, migrations, and seed data.
- `scripts/`, `tests/site/`: coverage imports, domain tests, and Playwright checks.
- `public/images/marketing/`: generated WebP assets; prompts in `docs/marketing-assets.md` at repository root.

Raw coverage lives in `coverage_sources/`; private reports/backups go into `web/data/coverage-import/`. Consult `Requirements.md`, `PRD.md`, and `README.md` for requirements and setup.

## Build, Test, and Development Commands

From `web/`, run `npm install`, then copy `.env.example` to `.env.local` and configure it.

- `npm run dev`: start the local development server.
- `npm run build`: generate Prisma Client and build the production app; required before marking implementation work complete.
- `npm run start`: serve the production build.
- `npm run lint`: invoke the configured Next.js lint script.
- `npx prisma migrate dev --name <name>`: create and apply a development migration.
- `npm run coverage:convert`: validate sources locally and generate reports.
- `npm run coverage:apply`: back up and atomically replace the compatibility catalog in bulk.

## Coding Style & Naming Conventions

Follow existing TypeScript style: two-space indentation, double quotes, semicolons, and strict typing. Use kebab-case filenames, PascalCase React components/types, camelCase functions, and `@/` imports. ESLint uses Next.js rules; no Prettier configuration is present. Write code, comments, and documentation in English.

## Testing Guidelines

Run `npm run coverage:test` and `npm run site:test` for Node regression tests. Run `npm run site:e2e` against the local production server for Chrome checks. No coverage threshold is configured. Verify affected flows and report limitations. Prioritize pure `lib/domain/` functions when adding tests.

## Commit & Pull Request Guidelines

Use task-prefixed subjects such as `TASK-045: Security pass` or `ADD-SENTRY: Sentry integration`. Keep commits focused. PRs should describe changes, reference tasks/issues, record validation, and include UI screenshots. Explain migrations and configuration changes.

## Security & Data Conventions

Never commit secrets or enable `SEED_SAMPLE=true` in production. Validate server inputs with Zod and call `requireAdmin()` in protected actions/handlers. Store money as integer cents; serialize Prisma BigInt IDs as strings. Change order status through `advanceOrderStatus()`. Add new migrations rather than editing applied ones.
