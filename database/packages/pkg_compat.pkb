-- ============================================================================
-- pkg_compat.pkb
-- TASK-013: exact-match Part Number lookup and the confirmed-services list.
-- See pkg_compat.pks for the public contract and design rationale.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY pkg_compat AS

    ----------------------------------------------------------------------------
    -- find_match
    ----------------------------------------------------------------------------
    FUNCTION find_match(
        p_vehicle_id   IN NUMBER,
        p_category_id  IN NUMBER,
        p_part_number  IN VARCHAR2
    ) RETURN NUMBER IS
        l_entry_id       compatibility_entry.entry_id%TYPE;
        l_service_count  PLS_INTEGER;
    BEGIN
        BEGIN
            SELECT entry_id
              INTO l_entry_id
              FROM compatibility_entry
             WHERE vehicle_id  = p_vehicle_id
               AND category_id = p_category_id
               AND part_number = UPPER(TRIM(p_part_number));
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RETURN NULL; -- no entry for this vehicle+category+part number
            WHEN TOO_MANY_ROWS THEN
                -- Cannot actually happen: ux_compat_entry_lookup (TASK-003)
                -- enforces uniqueness on (vehicle_id, category_id,
                -- part_number). Defensive only -- treat as "no match" rather
                -- than letting an unexpected data-integrity issue surface as
                -- an unhandled ORA-01422 to the customer-facing wizard.
                RETURN NULL;
        END;

        SELECT COUNT(*) INTO l_service_count
          FROM compatibility_service
         WHERE entry_id = l_entry_id;

        IF l_service_count = 0 THEN
            RETURN NULL; -- entry exists but confirms zero services: no match
                          -- (TASK-013 acceptance criteria).
        END IF;

        RETURN l_entry_id;
    END find_match;

    ----------------------------------------------------------------------------
    -- get_services
    ----------------------------------------------------------------------------
    FUNCTION get_services(p_entry_id IN NUMBER) RETURN t_service_tab PIPELINED IS
        l_row t_service_row;
    BEGIN
        FOR r IN (
            SELECT sv.service_id, sv.name, sv.price_tier, pt.amount AS tier_amount
              FROM compatibility_service cs
              JOIN service sv    ON sv.service_id = cs.service_id
              JOIN price_tier pt ON pt.tier_code  = sv.price_tier
             WHERE cs.entry_id = p_entry_id
             ORDER BY sv.name
        ) LOOP
            l_row.service_id  := r.service_id;
            l_row.name        := r.name;
            l_row.price_tier  := r.price_tier;
            l_row.tier_amount := r.tier_amount;
            PIPE ROW (l_row);
        END LOOP;

        RETURN;
    END get_services;

END pkg_compat;
/
