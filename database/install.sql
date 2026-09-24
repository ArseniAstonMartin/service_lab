-- ============================================================================
-- install.sql
-- Master install script for ECU Service Lab (Automotive Module Compatibility
-- & Repair Service Platform).
--
-- Run this in SQL Workshop -> SQL Scripts -> Upload and Run (or via SQLcl:
--   sql /nolog
--   connect <user>/<password>@<tns_alias>
--   @database/install.sql
-- ) from the repository root's `database/` directory so the relative `@@`
-- paths below resolve correctly.
--
-- Order: DDL (reference tables) -> DDL (order tables) -> DDL (config/logs)
--        -> constraints -> triggers -> views -> import staging
--        -> packages -> seed data -> ORDS modules
--
-- Stops immediately on the first error so partial installs are never left
-- silently broken.
-- ============================================================================

WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF
SET SERVEROUTPUT ON SIZE UNLIMITED
SET ECHO ON
SET FEEDBACK ON

PROMPT ==========================================================
PROMPT ECU Service Lab -- install.sql starting
PROMPT ==========================================================

PROMPT --- DDL: reference tables ---
@@ddl/010_reference_tables.sql

PROMPT --- DDL: order tables ---
@@ddl/020_order_tables.sql

PROMPT --- DDL: configuration & logs ---
@@ddl/030_config_and_logs.sql

PROMPT --- DDL: constraints ---
@@ddl/040_constraints.sql

PROMPT --- DDL: triggers ---
@@ddl/050_triggers.sql

PROMPT --- DDL: views ---
@@ddl/060_views.sql

PROMPT --- DDL: import staging (bulk compatibility import) ---
@@ddl/070_import_staging.sql

PROMPT --- Package specs (all, before any body) ---
-- Package bodies call across packages in a cycle-ish way (e.g.
-- pkg_order_status.pkb calls pkg_stripe/pkg_notify; pkg_order.pkb calls
-- pkg_notify), so bodies cannot simply be compiled in dependency order --
-- there is no single linear order that works. PL/SQL only requires a
-- referenced package's SPEC to already exist at body-compile time (not its
-- body), so the fix is the standard one: compile every spec first (specs
-- here have no cross-package references at all -- verified), then every
-- body after, in any order, since by then every spec they might call
-- already exists (live-confirmed 2026-09-24: the original single-pass
-- spec+body-per-package order produced PLS-00201 "must be declared"
-- errors for pkg_order_status.pkb, pkg_order.pkb, etc.).
@@packages/pkg_security.pks
@@packages/pkg_order_status.pks
@@packages/pkg_compat.pks
@@packages/pkg_pricing.pks
@@packages/pkg_order.pks
@@packages/pkg_notify.pks
@@packages/pkg_stripe.pks
@@packages/pkg_review.pks
@@packages/pkg_import.pks

PROMPT --- Package bodies (all, after every spec) ---
@@packages/pkg_security.pkb
@@packages/pkg_order_status.pkb
@@packages/pkg_compat.pkb
@@packages/pkg_pricing.pkb
@@packages/pkg_order.pkb
@@packages/pkg_notify.pkb
@@packages/pkg_stripe.pkb
@@packages/pkg_review.pkb
@@packages/pkg_import.pkb

PROMPT --- Seed data ---
@@seed/010_reference_data.sql
@@seed/020_test_compatibility.sql

PROMPT --- ORDS REST modules ---
@@ords/stripe_webhook.sql

PROMPT ==========================================================
PROMPT ECU Service Lab -- install.sql finished successfully
PROMPT ==========================================================

WHENEVER SQLERROR CONTINUE
