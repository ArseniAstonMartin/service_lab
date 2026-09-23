-- ============================================================================
-- 060_views.sql
-- TASK-007: Views for APEX LOVs and admin reports.
--
-- Creates:
--   V_VEHICLE_LOV     - Make/Model/Year combinations that have at least one
--                        COMPATIBILITY_ENTRY (f100 Page 10 cascading LOVs,
--                        TASK-016). Vehicles with zero compatibility entries
--                        are deliberately excluded -- offering them in the
--                        wizard would only ever lead to "no match".
--   V_ORDER_ADMIN     - one row per order, with vehicle/category/service and
--                        current status already joined, for f200 Page 10's
--                        Interactive Report (TASK-035) and v_order_admin-based
--                        reports.
--   V_COMPAT_CATALOG  - one row per COMPATIBILITY_ENTRY, with a LISTAGG of its
--                        supported service names, for f200 Page 30's
--                        Compatibility DB Interactive Grid (TASK-043).
--
-- Depends on 010_reference_tables.sql, 020_order_tables.sql and
-- 040_constraints.sql (ORDER_STATUS_REF). Read-only views: no DML target.
--
-- Run via SQL Workshop -> SQL Scripts (or SQLcl) against a schema that
-- already has 010/020/030/040/050_*.sql applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- V_VEHICLE_LOV
-- Only Make/Model/Year combinations with >= 1 COMPATIBILITY_ENTRY (any
-- SOURCE, matched or not -- a vehicle with an entry that currently has zero
-- linked services still deserves to appear in the LOV; pkg_compat.find_match,
-- TASK-013, is what decides "no match" at submission time, not this view).
-- DISTINCT because a vehicle can have many entries (one per category).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_vehicle_lov AS
SELECT DISTINCT
       vr.vehicle_id,
       vr.make,
       vr.model,
       vr.year
FROM   vehicle_ref vr
WHERE  EXISTS (
           SELECT 1
           FROM   compatibility_entry ce
           WHERE  ce.vehicle_id = vr.vehicle_id
       );

COMMENT ON TABLE v_vehicle_lov IS 'Make/Model/Year combinations that have at least one COMPATIBILITY_ENTRY. Source for the f100 Page 10 cascading Make -> Model -> Year LOVs (TASK-016); a vehicle with zero compatibility entries is never offered.';

-- ----------------------------------------------------------------------------
-- V_ORDER_ADMIN
-- One row per order: vehicle, category, service, customer and pricing
-- fields, plus the current status's display_seq/is_terminal from
-- ORDER_STATUS_REF (so f200 reports can sort/group by lifecycle stage
-- without re-encoding the status list). LEFT JOINs on vehicle/category are
-- defensive only (ORDERS.vehicle_id/category_id are NOT NULL FKs and can
-- never actually be orphaned); service/matched_entry_id are nullable
-- (Pending Review orders before admin confirmation), so those stay LEFT
-- JOIN by necessity.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_order_admin AS
SELECT o.order_id,
       o.tracking_token,
       o.status,
       osr.display_seq          AS status_display_seq,
       osr.is_terminal          AS status_is_terminal,
       o.vehicle_id,
       vr.make                  AS vehicle_make,
       vr.model                 AS vehicle_model,
       vr.year                  AS vehicle_year,
       o.category_id,
       mc.name                  AS category_name,
       o.part_number_entered,
       o.matched_entry_id,
       o.service_id,
       sv.name                  AS service_name,
       o.customer_name,
       o.customer_email,
       o.customer_phone,
       o.return_address_street,
       o.return_address_city,
       o.return_address_state,
       o.return_address_zip,
       o.service_price,
       o.return_shipping_fee,
       o.total_amount,
       o.stripe_payment_link_id,
       o.stripe_payment_status,
       o.return_tracking_no,
       o.created_at,
       o.updated_at
FROM   orders o
       JOIN vehicle_ref       vr  ON vr.vehicle_id = o.vehicle_id
       JOIN module_category   mc  ON mc.category_id = o.category_id
       JOIN order_status_ref  osr ON osr.status_code = o.status
       LEFT JOIN service      sv  ON sv.service_id = o.service_id;

COMMENT ON TABLE v_order_admin IS 'One row per order with vehicle/category/service names and current-status metadata already joined. Source for f200 Page 10''s Interactive Report (TASK-035) -- search by order number/email/Part Number, filter/sort by status and date, per PRD 5.1.';

-- ----------------------------------------------------------------------------
-- V_COMPAT_CATALOG
-- One row per COMPATIBILITY_ENTRY: Make/Model/Year, category, Part Number,
-- a comma-separated LISTAGG of its currently supported service names
-- (alphabetical, so the column is stable/diffable across refreshes), and
-- SOURCE. An entry with zero linked COMPATIBILITY_SERVICE rows still gets a
-- row here (LEFT JOIN) with an empty services list -- f200 Page 30
-- (TASK-043) needs to show entries with "no services yet" so the admin can
-- notice and fix them, not silently hide them.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_compat_catalog AS
SELECT ce.entry_id,
       vr.make,
       vr.model,
       vr.year,
       mc.name                                            AS category_name,
       ce.part_number,
       ce.source,
       ce.created_at,
       ce.updated_at,
       (SELECT LISTAGG(sv.name, ', ') WITHIN GROUP (ORDER BY sv.name)
        FROM   compatibility_service cs
               JOIN service sv ON sv.service_id = cs.service_id
        WHERE  cs.entry_id = ce.entry_id)                 AS supported_services
FROM   compatibility_entry ce
       JOIN vehicle_ref     vr ON vr.vehicle_id = ce.vehicle_id
       JOIN module_category mc ON mc.category_id = ce.category_id;

COMMENT ON TABLE v_compat_catalog IS 'One row per COMPATIBILITY_ENTRY with Make/Model/Year, category, Part Number, a LISTAGG of supported service names and SOURCE. Source for f200 Page 30''s read-only Compatibility DB Interactive Grid (TASK-043); entries with zero supported services still appear (NULL/empty SUPPORTED_SERVICES) so the admin can spot and fix them.';
