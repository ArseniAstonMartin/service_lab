-- ============================================================================
-- pkg_review.pkb
-- TASK-040: see pkg_review.pks for the public contract and design
-- rationale.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY pkg_review AS

    ----------------------------------------------------------------------------
    -- contains (private)
    -- Plain linear scan -- p_service_ids is admin-entered from a page item
    -- (a handful of services at most, never a bulk data source), so this is
    -- simpler and just as fast in practice as casting the associative array
    -- into a SQL collection would be.
    ----------------------------------------------------------------------------
    FUNCTION contains(p_tab IN t_service_id_tab, p_value IN NUMBER) RETURN BOOLEAN IS
    BEGIN
        FOR i IN 1 .. p_tab.COUNT LOOP
            IF p_tab(i) = p_value THEN
                RETURN TRUE;
            END IF;
        END LOOP;
        RETURN FALSE;
    END contains;

    ----------------------------------------------------------------------------
    -- confirm_compatibility
    ----------------------------------------------------------------------------
    PROCEDURE confirm_compatibility(
        p_order_id             IN NUMBER,
        p_service_ids          IN t_service_id_tab,
        p_selected_service_id  IN NUMBER,
        p_changed_by           IN VARCHAR2 DEFAULT NULL
    ) IS
        l_vehicle_id    orders.vehicle_id%TYPE;
        l_category_id   orders.category_id%TYPE;
        l_part_number   orders.part_number_entered%TYPE;
        l_status        orders.status%TYPE;
        l_entry_id      compatibility_entry.entry_id%TYPE;
        l_exists_count  PLS_INTEGER;
    BEGIN
        ------------------------------------------------------------------
        -- Read-only validation, before any write and before the savepoint
        -- below -- nothing to protect yet, and every one of these must
        -- pass before this call touches COMPATIBILITY_ENTRY/
        -- COMPATIBILITY_SERVICE at all. FOR UPDATE locks the order row for
        -- the rest of this call, same as pkg_order_status.change_status
        -- does for its own read of ORDERS.STATUS.
        ------------------------------------------------------------------
        BEGIN
            SELECT vehicle_id, category_id, part_number_entered, status
              INTO l_vehicle_id, l_category_id, l_part_number, l_status
              FROM orders
             WHERE order_id = p_order_id
               FOR UPDATE;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20100,
                    'pkg_review.confirm_compatibility: no order found for ORDER_ID ' || p_order_id || '.');
        END;

        IF l_status != 'Pending Review' THEN
            RAISE_APPLICATION_ERROR(-20101,
                'pkg_review.confirm_compatibility: ORDER_ID ' || p_order_id
                || ' is not in Pending Review status (currently "' || l_status
                || '") -- only a Pending Review order can be confirmed here.');
        END IF;

        IF p_service_ids.COUNT = 0 THEN
            RAISE_APPLICATION_ERROR(-20102,
                'pkg_review.confirm_compatibility: p_service_ids is empty -- at least one confirmed service is required.');
        END IF;

        IF NOT contains(p_service_ids, p_selected_service_id) THEN
            RAISE_APPLICATION_ERROR(-20103,
                'pkg_review.confirm_compatibility: p_selected_service_id ' || p_selected_service_id
                || ' is not one of the confirmed p_service_ids for ORDER_ID ' || p_order_id || '.');
        END IF;

        FOR i IN 1 .. p_service_ids.COUNT LOOP
            SELECT COUNT(*) INTO l_exists_count FROM service WHERE service_id = p_service_ids(i);
            IF l_exists_count = 0 THEN
                RAISE_APPLICATION_ERROR(-20104,
                    'pkg_review.confirm_compatibility: p_service_ids contains SERVICE_ID '
                    || p_service_ids(i) || ', which does not exist.');
            END IF;
        END LOOP;

        SAVEPOINT sp_confirm_compatibility;

        BEGIN
            ------------------------------------------------------------------
            -- 1. Create or update the COMPATIBILITY_ENTRY, keyed on the same
            -- (vehicle_id, category_id, part_number) natural key
            -- UX_COMPAT_ENTRY_LOOKUP enforces and pkg_compat.find_match
            -- looks up by. TRG_COMPAT_ENTRY_BIU normalizes PART_NUMBER
            -- again on write, but ORDERS.PART_NUMBER_ENTERED is already
            -- UPPER(TRIM())'d by TRG_ORDERS_BIU at submission time, so
            -- l_part_number here is already in the same normalized form.
            ------------------------------------------------------------------
            MERGE INTO compatibility_entry tgt
            USING (
                SELECT l_vehicle_id AS vehicle_id, l_category_id AS category_id, l_part_number AS part_number
                  FROM dual
            ) src
            ON (tgt.vehicle_id = src.vehicle_id AND tgt.category_id = src.category_id AND tgt.part_number = src.part_number)
            WHEN MATCHED THEN UPDATE SET
                tgt.source = 'ADMIN_CONFIRMED'
                -- Upgrades provenance even if this entry already existed
                -- (e.g. from pkg_import, TASK-044, racing in after this
                -- order was submitted but before it was reviewed) -- an
                -- admin explicitly confirming it now is the stronger
                -- signal.
            WHEN NOT MATCHED THEN INSERT (vehicle_id, category_id, part_number, source)
                VALUES (src.vehicle_id, src.category_id, src.part_number, 'ADMIN_CONFIRMED');

            SELECT entry_id
              INTO l_entry_id
              FROM compatibility_entry
             WHERE vehicle_id = l_vehicle_id
               AND category_id = l_category_id
               AND part_number = l_part_number;

            ------------------------------------------------------------------
            -- 2. Sync COMPATIBILITY_SERVICE to exactly p_service_ids: drop
            -- any link no longer confirmed, add any missing one. Each
            -- p_service_ids(i) was already checked to exist in SERVICE
            -- above.
            ------------------------------------------------------------------
            FOR rec IN (SELECT service_id FROM compatibility_service WHERE entry_id = l_entry_id) LOOP
                IF NOT contains(p_service_ids, rec.service_id) THEN
                    DELETE FROM compatibility_service
                     WHERE entry_id = l_entry_id AND service_id = rec.service_id;
                END IF;
            END LOOP;

            FOR i IN 1 .. p_service_ids.COUNT LOOP
                MERGE INTO compatibility_service tgt
                USING (
                    SELECT l_entry_id AS entry_id, p_service_ids(i) AS service_id FROM dual
                ) src
                ON (tgt.entry_id = src.entry_id AND tgt.service_id = src.service_id)
                WHEN NOT MATCHED THEN INSERT (entry_id, service_id)
                    VALUES (src.entry_id, src.service_id);
            END LOOP;

            ------------------------------------------------------------------
            -- 3. Link the order to the entry and the one service it's for.
            -- Not guarded by TRG_ORDERS_STATUS_GUARD -- that trigger only
            -- fires on UPDATE OF STATUS (see pkg_order_status.pks header),
            -- so this direct UPDATE of MATCHED_ENTRY_ID/SERVICE_ID is a
            -- distinct, unguarded operation, same as pkg_order.submit_order
            -- setting them on INSERT for the matched-at-submission path.
            ------------------------------------------------------------------
            UPDATE orders
               SET matched_entry_id = l_entry_id,
                   service_id       = p_selected_service_id
             WHERE order_id = p_order_id;

            ------------------------------------------------------------------
            -- 4. Snapshot prices -- the only procedure allowed to write
            -- ORDERS.SERVICE_PRICE/RETURN_SHIPPING_FEE/TOTAL_AMOUNT
            -- (TASK-014).
            ------------------------------------------------------------------
            pkg_pricing.price_order(p_order_id => p_order_id, p_service_id => p_selected_service_id);

            ------------------------------------------------------------------
            -- 5. Pending Review -> Awaiting Payment. Validated as the only
            -- allowed next status by pkg_order_status.change_status itself
            -- (TASK-012); its on_status_changed hook creates the Stripe
            -- Payment Link and sends email #2 (TASK-031) as a side effect
            -- of this one call -- nothing further needed here.
            ------------------------------------------------------------------
            pkg_order_status.change_status(
                p_order_id   => p_order_id,
                p_new_status => 'Awaiting Payment',
                p_changed_by => p_changed_by
            );
        EXCEPTION
            WHEN OTHERS THEN
                ROLLBACK TO SAVEPOINT sp_confirm_compatibility;
                RAISE;
        END;
    END confirm_compatibility;

END pkg_review;
/
