-- ============================================================================
-- pkg_review.pks
-- TASK-040: admin confirmation of compatibility for a Pending Review order
-- (PRD 4.2/5.2: "an unmatched Part Number is routed to a manual review
-- queue before payment unlocks").
--
-- confirm_compatibility is the ONLY procedure in this schema allowed to
-- move an order out of Pending Review directly (as opposed to a matched
-- order, which pkg_order.submit_order, TASK-015, already starts at
-- Awaiting Payment). It is the admin's counterpart to pkg_compat.find_match
-- (TASK-013): where find_match only ever reads COMPATIBILITY_ENTRY/
-- COMPATIBILITY_SERVICE, this is the one place those tables are written
-- with SOURCE = 'ADMIN_CONFIRMED' -- the other provenance value, 'IMPORT',
-- is written only by pkg_import (TASK-044).
--
-- Once this runs for one order's (VEHICLE_ID, CATEGORY_ID, PART_NUMBER),
-- every later order for that same triple matches automatically via
-- pkg_compat.find_match -- no code change needed for that; it falls out of
-- find_match querying the same COMPATIBILITY_ENTRY/COMPATIBILITY_SERVICE
-- rows this procedure writes (TASK-040 acceptance criteria, verified in
-- test_pkg_review.sql by calling find_match again after confirming).
-- ============================================================================
CREATE OR REPLACE PACKAGE pkg_review AUTHID DEFINER AS

    -- ------------------------------------------------------------------------
    -- The set of SERVICE_IDs the admin confirms as supported for this
    -- Part Number/vehicle/category combination -- i.e. the full
    -- COMPATIBILITY_SERVICE link set for the COMPATIBILITY_ENTRY this call
    -- creates or updates, not just the one service this particular order
    -- needs (p_selected_service_id, below, is that one). Associative array
    -- (not a SQL-level collection type) because the only caller is PL/SQL --
    -- an APEX page process building it from a multi-select item or a
    -- collection (TASK-042's f94517 Page 21 modal) -- never a SQL query.
    -- Populate densely from index 1, same convention as pkg_order's
    -- t_answer_input_tab/t_photo_input_tab -- confirm_compatibility
    -- iterates 1 .. p_service_ids.COUNT, so a sparse array would silently
    -- skip entries.
    -- ------------------------------------------------------------------------
    TYPE t_service_id_tab IS TABLE OF service.service_id%TYPE INDEX BY PLS_INTEGER;

    -- ------------------------------------------------------------------------
    -- confirm_compatibility
    -- For p_order_id (must currently be Pending Review -- raises -20101
    -- otherwise):
    --   1. Creates or updates the COMPATIBILITY_ENTRY for the order's
    --      (VEHICLE_ID, CATEGORY_ID, PART_NUMBER_ENTERED) with
    --      SOURCE = 'ADMIN_CONFIRMED' (a MERGE on the same natural key
    --      pkg_compat.find_match looks up by, UX_COMPAT_ENTRY_LOOKUP --
    --      if an entry already exists there, e.g. from a very recent
    --      import that ran after this order was submitted, its SOURCE is
    --      upgraded to ADMIN_CONFIRMED rather than a duplicate being
    --      created).
    --   2. Syncs that entry's COMPATIBILITY_SERVICE links to exactly
    --      p_service_ids -- adds any missing, removes any no longer
    --      confirmed. Every id in p_service_ids must reference an existing
    --      SERVICE row (raises -20104 naming the first bad id otherwise)
    --      and the array must not be empty (raises -20102).
    --   3. Sets ORDERS.MATCHED_ENTRY_ID to that entry and ORDERS.
    --      SERVICE_ID to p_selected_service_id -- the one service, among
    --      the confirmed set, this particular order is for. Must be one of
    --      p_service_ids (raises -20103 otherwise -- an order can't be
    --      priced for a service its own compatibility entry doesn't
    --      confirm).
    --   4. Snapshots prices via pkg_pricing.price_order(p_order_id,
    --      p_selected_service_id) -- the same, only, pricing entry point
    --      the matched-at-submission path uses (TASK-014).
    --   5. Moves the order to Awaiting Payment via pkg_order_status.
    --      change_status (TASK-012), which in turn creates the Stripe
    --      Payment Link and sends email #2 (TASK-031) -- confirm_
    --      compatibility does not duplicate any of that, it only reaches
    --      the state that hook fires on.
    --
    -- All five steps run under one SAVEPOINT: any failure (including one
    -- raised deep inside change_status/price_order) rolls back everything
    -- this call wrote -- the COMPATIBILITY_ENTRY/COMPATIBILITY_SERVICE
    -- changes included -- and re-raises, so a partially-confirmed
    -- compatibility entry is never left behind by a failed call. Same
    -- "guarantee cleanup, then re-raise" shape pkg_order.submit_order uses
    -- for its own atomicity.
    --
    -- p_changed_by: passed straight through to change_status (NULL, the
    -- default, resolves to the live APEX session's APP_USER there -- this
    -- is always an authenticated f94517 admin action, never a SYSTEM one,
    -- so no caller of this procedure is expected to pass an explicit
    -- value; the parameter exists only so a test script outside an APEX
    -- session can).
    --
    -- Raises -20100 for an unknown p_order_id, -20101 if it is not
    -- currently Pending Review, -20102 for an empty p_service_ids,
    -- -20103 if p_selected_service_id is not in p_service_ids, -20104 if
    -- any id in p_service_ids does not exist in SERVICE, or whatever
    -- pkg_pricing/pkg_order_status themselves raise for a problem at
    -- steps 4-5 (both already validate their own inputs independently).
    -- ------------------------------------------------------------------------
    PROCEDURE confirm_compatibility(
        p_order_id             IN NUMBER,
        p_service_ids          IN t_service_id_tab,
        p_selected_service_id  IN NUMBER,
        p_changed_by           IN VARCHAR2 DEFAULT NULL
    );

END pkg_review;
/
