-- TASK-006: Block the Supabase Data API from reading app tables.
--
-- Enables Row Level Security on every table in the public schema, with
-- zero policies. This does not touch application behavior: the app talks
-- to Postgres exclusively through Prisma over the direct/pooled
-- connection (DATABASE_URL / DIRECT_URL), which authenticates as the
-- Postgres role and always bypasses RLS. What this blocks is the separate
-- Supabase Data API (PostgREST), which serves the anon and authenticated
-- roles used by supabase-js on the client — those roles have no policies
-- here, so every request they make is denied by default.
--
-- Any future admin auth (TASK-012) uses Supabase Auth only for
-- authentication; all reads/writes still go through Prisma/Server
-- Actions, never through the Data API, so zero policies is correct and
-- final for this MVP (not a placeholder to fill in later).

ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."module_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."compatibility_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."price_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."compatibility_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."question_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."email_logs" ENABLE ROW LEVEL SECURITY;
-- Prisma's own migration-tracking table is also in the public schema and
-- therefore also reachable through the Data API; lock it down too.
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
