# Repository Guidelines

## Project Structure & Module Organization

ECU Service Lab is a Next.js App Router application with TypeScript, Prisma, and Supabase. Application code lives in `web/`:

- `app/(public)/`, `app/admin/`, and `app/api/`: customer flows, admin pages, and integration Route Handlers.
- `components/`: shared UI, wizard, admin, and tracking components.
- `lib/domain/`: pure business rules; keep framework and database imports out.
- `lib/actions/`, `lib/services/`, and `lib/email/`: Server Actions, shared orchestration, and email templates.
- `prisma/`: schema, migrations, and seed data.
- `scripts/`: coverage conversion/import and admin provisioning.

Raw compatibility documents live in `coverage_sources/`; generated reports/backups go into gitignored `web/data/coverage-import/`. Consult `Requirements.md` for customer requirements, `PRD.md` for implementation context, and `README.md` for setup.

## Build, Test, and Development Commands

Run commands from `web/`. Install dependencies with `npm install`, then copy `.env.example` to `.env.local` and configure it.

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

Run `npm run coverage:test` for Node's built-in tests in `scripts/coverage/*.test.ts`. No coverage threshold is configured. Build and manually verify affected customer/admin flows; report checks and limitations in the PR. Prioritize pure `lib/domain/` functions when adding tests.

## Commit & Pull Request Guidelines

History uses task-prefixed subjects such as `TASK-045: Security pass` and `ADD-SENTRY: Sentry error monitoring integration`. Keep commits focused. PRs should describe behavior changes, reference the relevant task/issue, record validation, and include screenshots for UI changes. Explain migrations and configuration changes explicitly.

## Security & Data Conventions

Never commit secrets or enable `SEED_SAMPLE=true` in production. Validate server inputs with Zod and call `requireAdmin()` in protected actions/handlers. Store money as integer cents; serialize Prisma BigInt IDs as strings. Change order status through `advanceOrderStatus()`. Add new migrations rather than editing applied ones.
