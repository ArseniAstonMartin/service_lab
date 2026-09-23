-- ============================================================================
-- test_pkg_review.sql
-- TASK-040: Unit tests for pkg_review.confirm_compatibility.
--
-- Run via SQL Workshop -> SQL Commands (or SQLcl) AFTER pkg_review has been
-- installed (needs 010-060_*.sql, pkg_compat, pkg_pricing, pkg_order_status,
-- pkg_stripe, pkg_order). Self-contained: creates its own TEST_-prefixed
-- fixture rows and ROLLBACKs everything at the end.
--
-- Purely PL/SQL -- confirm_compatibility never calls APEX_WEB_SERVICE
-- itself (pkg_stripe.create_payment_link is reached only through
-- pkg_order_status.change_status's on_status_changed hook, and that hook's
-- own WHEN OTHERS -> log_error swallow, TASK-029/031, means a Stripe
-- failure there can never surface as a confirm_compatibility failure) --
-- so every assertion below is exercisable without any live network access,
-- same limitation-free situation test_pkg_order_status.sql documents for
-- its own Awaiting Payment transition test.
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count   PLS_INTEGER := 0;
    v_fail_count   PLS_INTEGER := 0;

    v_category_id     module_category.category_id%TYPE;
    v_vehicle_id       vehicle_ref.vehicle_id%TYPE;
    v_service_1_id      service.service_id%TYPE;
    v_service_2_id      service.service_id%TYPE;
    v_service_3_id      service.service_id%TYPE;

    v_order_unmatched_id     orders.order_id%TYPE;  -- Pending Review, PN not yet in COMPATIBILITY_ENTRY -- the happy-path fixture
    v_order_wrong_status_id  orders.order_id%TYPE;  -- already Awaiting Payment
    v_order_presync_id       orders.order_id%TYPE;  -- Pending Review, PN already has an IMPORT entry linking v_service_3_id -- tests upgrade + link sync

    v_part_number_happy   VARCHAR2(100) := 'TEST-PN-040-HAPPY-' || DBMS_RANDOM.STRING('U', 8);
    v_part_number_presync VARCHAR2(100) := 'TEST-PN-040-PRESYNC-' || DBMS_RANDOM.STRING('U', 8);

    PROCEDURE report(p_test_name IN VARCHAR2, p_passed IN BOOLEAN, p_detail IN VARCHAR2 DEFAULT NULL) IS
    BEGIN
        IF p_passed THEN
            v_pass_count := v_pass_count + 1;
            DBMS_OUTPUT.PUT_LINE('PASS - ' || p_test_name);
        ELSE
            v_fail_count := v_fail_count + 1;
            DBMS_OUTPUT.PUT_LINE('FAIL - ' || p_test_name || CASE WHEN p_detail IS NOT NULL THEN ' (' || p_detail || ')' END);
        END IF;
    END report;

    FUNCTION mentions_code(p_message IN VARCHAR2, p_code IN NUMBER) RETURN BOOLEAN IS
    BEGIN
        RETURN p_message IS NOT NULL AND INSTR(p_message, TO_CHAR(p_code)) > 0;
    END mentions_code;

    FUNCTION new_order(
        p_part_number IN VARCHAR2,
        p_status      IN VARCHAR2,
        p_suffix      IN VARCHAR2
    ) RETURN orders.order_id%TYPE IS
        v_order_id orders.order_id%TYPE;
    BEGIN
        INSERT INTO orders (
            tracking_token, status, vehicle_id, category_id, part_number_entered,
            description, customer_name, customer_email, customer_phone,
            return_address_street, return_address_city, return_address_state, return_address_zip,
            idempotency_key
        ) VALUES (
            'TEST-TOKEN-040-' || p_suffix || '-' || DBMS_RANDOM.STRING('U', 20), p_status, v_vehicle_id, v_category_id, p_part_number,
            'Fixture order for TASK-040 tests (' || p_suffix || ')',
            'Test Customer', 'test.customer@example.com', '808-555-0100',
            '123 Test St', 'Honolulu', 'HI', '96813',
            'TEST-IDEMP-040-' || p_suffix || '-' || DBMS_RANDOM.STRING('U', 20)
        ) RETURNING order_id INTO v_order_id;
        RETURN v_order_id;
    END new_order;

BEGIN
    ----------------------------------------------------------------------
    -- Fixtures
    ----------------------------------------------------------------------
    INSERT INTO module_category (name, display_seq)
        VALUES ('TEST_CATEGORY_040', 999)
        RETURNING category_id INTO v_category_id;

    INSERT INTO vehicle_ref (make, model, year)
        VALUES ('TEST_MAKE_040', 'TEST_MODEL_040', 2024)
        RETURNING vehicle_id INTO v_vehicle_id;

    MERGE INTO price_tier tgt
    USING (SELECT 'T040' AS tier_code, 220.00 AS amount FROM dual) src
    ON (tgt.tier_code = src.tier_code)
    WHEN NOT MATCHED THEN INSERT (tier_code, amount) VALUES (src.tier_code, src.amount);

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_040_1', 'T040', 'TEST_SET_040', 'N')
        RETURNING service_id INTO v_service_1_id;

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_040_2', 'T040', 'TEST_SET_040', 'N')
        RETURNING service_id INTO v_service_2_id;

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_040_3', 'T040', 'TEST_SET_040', 'N')
        RETURNING service_id INTO v_service_3_id;

    MERGE INTO app_setting tgt
    USING (SELECT 'RETURN_SHIPPING_FEE' AS setting_key, '25.00' AS setting_value FROM dual) src
    ON (tgt.setting_key = src.setting_key)
    WHEN NOT MATCHED THEN INSERT (setting_key, setting_value) VALUES (src.setting_key, src.setting_value);

    -- Happy-path fixture: Pending Review, unmatched (no COMPATIBILITY_ENTRY
    -- exists yet for this vehicle/category/part_number).
    v_order_unmatched_id := new_order(v_part_number_happy, 'Pending Review', 'A');

    -- Wrong-status fixture: already Awaiting Payment (reuses the happy
    -- part number's sibling category is irrelevant -- a fresh, distinct
    -- part number keeps it independent of the other fixtures).
    v_order_wrong_status_id := new_order('TEST-PN-040-WRONGSTATUS-' || DBMS_RANDOM.STRING('U', 8), 'Awaiting Payment', 'B');

    -- Pre-sync fixture: Pending Review, but its (vehicle, category,
    -- part_number) ALREADY has a COMPATIBILITY_ENTRY -- SOURCE = 'IMPORT',
    -- linked only to v_service_3_id -- simulating an import that landed
    -- after this order was submitted but before it was reviewed. Used to
    -- test that confirm_compatibility both upgrades SOURCE to
    -- ADMIN_CONFIRMED and replaces (not just adds to) the linked services.
    v_order_presync_id := new_order(v_part_number_presync, 'Pending Review', 'C');

    DECLARE
        v_presync_entry_id compatibility_entry.entry_id%TYPE;
    BEGIN
        INSERT INTO compatibility_entry (vehicle_id, category_id, part_number, source)
        VALUES (v_vehicle_id, v_category_id, v_part_number_presync, 'IMPORT')
        RETURNING entry_id INTO v_presync_entry_id;

        INSERT INTO compatibility_service (entry_id, service_id) VALUES (v_presync_entry_id, v_service_3_id);
    END;

    DBMS_OUTPUT.PUT_LINE('Fixtures created: category=' || v_category_id || ' vehicle=' || v_vehicle_id
        || ' service_1=' || v_service_1_id || ' service_2=' || v_service_2_id || ' service_3=' || v_service_3_id
        || ' order_unmatched=' || v_order_unmatched_id || ' order_wrong_status=' || v_order_wrong_status_id
        || ' order_presync=' || v_order_presync_id);
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');

    ----------------------------------------------------------------------
    -- confirm_compatibility: unknown order_id
    ----------------------------------------------------------------------
    DECLARE
        v_service_ids pkg_review.t_service_id_tab;
        v_raised      BOOLEAN := FALSE;
        v_detail      VARCHAR2(4000);
    BEGIN
        v_service_ids(1) := v_service_1_id;
        BEGIN
            pkg_review.confirm_compatibility(-999999, v_service_ids, v_service_1_id);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('confirm_compatibility rejects an unknown order_id (ORA-20100)',
               v_raised AND mentions_code(v_detail, -20100), v_detail);
    END;

    ----------------------------------------------------------------------
    -- confirm_compatibility: order not in Pending Review status
    ----------------------------------------------------------------------
    DECLARE
        v_service_ids pkg_review.t_service_id_tab;
        v_raised      BOOLEAN := FALSE;
        v_detail      VARCHAR2(4000);
    BEGIN
        v_service_ids(1) := v_service_1_id;
        BEGIN
            pkg_review.confirm_compatibility(v_order_wrong_status_id, v_service_ids, v_service_1_id);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('confirm_compatibility rejects an order that is not Pending Review (ORA-20101)',
               v_raised AND mentions_code(v_detail, -20101), v_detail);
    END;

    ----------------------------------------------------------------------
    -- confirm_compatibility: empty p_service_ids
    ----------------------------------------------------------------------
    DECLARE
        v_service_ids pkg_review.t_service_id_tab; -- left empty
        v_raised      BOOLEAN := FALSE;
        v_detail      VARCHAR2(4000);
    BEGIN
        BEGIN
            pkg_review.confirm_compatibility(v_order_unmatched_id, v_service_ids, v_service_1_id);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('confirm_compatibility rejects an empty p_service_ids (ORA-20102)',
               v_raised AND mentions_code(v_detail, -20102), v_detail);
    END;

    ----------------------------------------------------------------------
    -- confirm_compatibility: p_selected_service_id not in p_service_ids
    ----------------------------------------------------------------------
    DECLARE
        v_service_ids pkg_review.t_service_id_tab;
        v_raised      BOOLEAN := FALSE;
        v_detail      VARCHAR2(4000);
    BEGIN
        v_service_ids(1) := v_service_1_id;
        BEGIN
            pkg_review.confirm_compatibility(v_order_unmatched_id, v_service_ids, v_service_2_id);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('confirm_compatibility rejects a selected_service_id not in service_ids (ORA-20103)',
               v_raised AND mentions_code(v_detail, -20103), v_detail);
    END;

    ----------------------------------------------------------------------
    -- confirm_compatibility: p_service_ids contains an unknown SERVICE_ID
    ----------------------------------------------------------------------
    DECLARE
        v_service_ids pkg_review.t_service_id_tab;
        v_raised      BOOLEAN := FALSE;
        v_detail      VARCHAR2(4000);
    BEGIN
        v_service_ids(1) := v_service_1_id;
        v_service_ids(2) := -999999;
        BEGIN
            pkg_review.confirm_compatibility(v_order_unmatched_id, v_service_ids, v_service_1_id);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('confirm_compatibility rejects a service_ids entry that does not exist (ORA-20104)',
               v_raised AND mentions_code(v_detail, -20104), v_detail);
    END;

    ----------------------------------------------------------------------
    -- Guard-clause failures above must have left the unmatched fixture
    -- order untouched -- still Pending Review, no compatibility entry
    -- created for its part number.
    ----------------------------------------------------------------------
    DECLARE
        v_status      orders.status%TYPE;
        v_entry_count PLS_INTEGER;
    BEGIN
        SELECT status INTO v_status FROM orders WHERE order_id = v_order_unmatched_id;
        SELECT COUNT(*) INTO v_entry_count
          FROM compatibility_entry
         WHERE vehicle_id = v_vehicle_id AND category_id = v_category_id AND part_number = v_part_number_happy;

        report('failed confirm_compatibility calls left the fixture order and compatibility data untouched',
               v_status = 'Pending Review' AND v_entry_count = 0,
               'status=' || v_status || ' entry_count=' || v_entry_count);
    END;

    ----------------------------------------------------------------------
    -- Happy path: confirm two services, select one.
    ----------------------------------------------------------------------
    DECLARE
        v_service_ids       pkg_review.t_service_id_tab;
        v_entry_id          compatibility_entry.entry_id%TYPE;
        v_entry_source      compatibility_entry.source%TYPE;
        v_linked_count      PLS_INTEGER;
        v_matched_entry_id  orders.matched_entry_id%TYPE;
        v_service_id        orders.service_id%TYPE;
        v_status_after      orders.status%TYPE;
        v_service_price     orders.service_price%TYPE;
        v_total_amount      orders.total_amount%TYPE;
        v_found_entry_id    NUMBER;
    BEGIN
        v_service_ids(1) := v_service_1_id;
        v_service_ids(2) := v_service_2_id;

        pkg_review.confirm_compatibility(
            p_order_id            => v_order_unmatched_id,
            p_service_ids         => v_service_ids,
            p_selected_service_id => v_service_1_id
        );

        SELECT entry_id, source
          INTO v_entry_id, v_entry_source
          FROM compatibility_entry
         WHERE vehicle_id = v_vehicle_id AND category_id = v_category_id AND part_number = v_part_number_happy;

        SELECT COUNT(*) INTO v_linked_count FROM compatibility_service WHERE entry_id = v_entry_id;

        SELECT matched_entry_id, service_id, status, service_price, total_amount
          INTO v_matched_entry_id, v_service_id, v_status_after, v_service_price, v_total_amount
          FROM orders
         WHERE order_id = v_order_unmatched_id;

        report('confirm_compatibility creates a COMPATIBILITY_ENTRY with SOURCE = ADMIN_CONFIRMED',
               v_entry_source = 'ADMIN_CONFIRMED', 'source=' || v_entry_source);
        report('confirm_compatibility links both confirmed services to the entry',
               v_linked_count = 2, 'linked_count=' || v_linked_count);
        report('confirm_compatibility sets ORDERS.MATCHED_ENTRY_ID to the new entry',
               v_matched_entry_id = v_entry_id, 'matched_entry_id=' || v_matched_entry_id);
        report('confirm_compatibility sets ORDERS.SERVICE_ID to the selected service',
               v_service_id = v_service_1_id, 'service_id=' || v_service_id);
        report('confirm_compatibility snapshots prices via pkg_pricing (SERVICE_PRICE/TOTAL_AMOUNT set)',
               v_service_price IS NOT NULL AND v_total_amount = v_service_price + 25.00,
               'service_price=' || v_service_price || ' total_amount=' || v_total_amount);
        report('confirm_compatibility moves the order to Awaiting Payment',
               v_status_after = 'Awaiting Payment', 'status=' || v_status_after);

        ------------------------------------------------------------------
        -- TASK-040 acceptance criteria: "the next order with the same
        -- Part Number matches automatically". Verified two ways -- first
        -- directly against pkg_compat.find_match (TASK-013), then by
        -- actually submitting a brand-new order for the same vehicle/
        -- category/part_number through pkg_order.submit_order (TASK-015)
        -- and confirming it takes the matched path (starts directly at
        -- Awaiting Payment, no admin review needed).
        ------------------------------------------------------------------
        v_found_entry_id := pkg_compat.find_match(v_vehicle_id, v_category_id, v_part_number_happy);
        report('pkg_compat.find_match now matches the same Part Number this call just confirmed',
               v_found_entry_id = v_entry_id, 'found_entry_id=' || v_found_entry_id);

        DECLARE
            v_next_order_id       orders.order_id%TYPE;
            v_next_tracking_token orders.tracking_token%TYPE;
            v_next_status         orders.status%TYPE;
            v_next_matched_entry  orders.matched_entry_id%TYPE;
            v_empty_answers       pkg_order.t_answer_input_tab;
            v_empty_photos        pkg_order.t_photo_input_tab;
        BEGIN
            pkg_order.submit_order(
                p_vehicle_id            => v_vehicle_id,
                p_category_id           => v_category_id,
                p_part_number           => v_part_number_happy,
                p_service_id            => v_service_1_id,
                p_description           => 'Follow-up order for the same Part Number, TASK-040 auto-match test',
                p_customer_name         => 'Test Customer Two',
                p_customer_email        => 'test.customer.two@example.com',
                p_customer_phone        => '808-555-0101',
                p_return_address_street => '456 Test Ave',
                p_return_address_city   => 'Honolulu',
                p_return_address_zip    => '96814',
                p_answers               => v_empty_answers,
                p_photos                => v_empty_photos,
                p_idempotency_key       => 'TEST-IDEMP-040-D-' || DBMS_RANDOM.STRING('U', 20),
                p_order_id              => v_next_order_id,
                p_tracking_token        => v_next_tracking_token
            );

            SELECT status, matched_entry_id INTO v_next_status, v_next_matched_entry
              FROM orders WHERE order_id = v_next_order_id;

            report('a brand-new order for the same Part Number auto-matches and starts at Awaiting Payment',
                   v_next_status = 'Awaiting Payment' AND v_next_matched_entry = v_entry_id,
                   'status=' || v_next_status || ' matched_entry_id=' || v_next_matched_entry);
        END;
    END;

    ----------------------------------------------------------------------
    -- Pre-sync fixture: confirm_compatibility on an entry that already
    -- exists (SOURCE = 'IMPORT', linked to v_service_3_id only) must
    -- upgrade SOURCE and REPLACE the link set with p_service_ids
    -- (v_service_1_id, v_service_2_id) -- v_service_3_id must be unlinked,
    -- not left in place alongside the new ones.
    ----------------------------------------------------------------------
    DECLARE
        v_service_ids     pkg_review.t_service_id_tab;
        v_entry_id        compatibility_entry.entry_id%TYPE;
        v_entry_source    compatibility_entry.source%TYPE;
        v_has_service_1   PLS_INTEGER;
        v_has_service_2   PLS_INTEGER;
        v_has_service_3   PLS_INTEGER;
    BEGIN
        v_service_ids(1) := v_service_1_id;
        v_service_ids(2) := v_service_2_id;

        pkg_review.confirm_compatibility(
            p_order_id            => v_order_presync_id,
            p_service_ids         => v_service_ids,
            p_selected_service_id => v_service_2_id
        );

        SELECT entry_id, source
          INTO v_entry_id, v_entry_source
          FROM compatibility_entry
         WHERE vehicle_id = v_vehicle_id AND category_id = v_category_id AND part_number = v_part_number_presync;

        SELECT COUNT(*) INTO v_has_service_1 FROM compatibility_service WHERE entry_id = v_entry_id AND service_id = v_service_1_id;
        SELECT COUNT(*) INTO v_has_service_2 FROM compatibility_service WHERE entry_id = v_entry_id AND service_id = v_service_2_id;
        SELECT COUNT(*) INTO v_has_service_3 FROM compatibility_service WHERE entry_id = v_entry_id AND service_id = v_service_3_id;

        report('confirm_compatibility upgrades a pre-existing IMPORT entry to ADMIN_CONFIRMED',
               v_entry_source = 'ADMIN_CONFIRMED', 'source=' || v_entry_source);
        report('confirm_compatibility adds the newly-confirmed services to a pre-existing entry',
               v_has_service_1 = 1 AND v_has_service_2 = 1,
               'has_1=' || v_has_service_1 || ' has_2=' || v_has_service_2);
        report('confirm_compatibility removes a previously-linked service no longer in p_service_ids',
               v_has_service_3 = 0, 'has_3=' || v_has_service_3);
    END;

    ----------------------------------------------------------------------
    -- Summary + cleanup
    ----------------------------------------------------------------------
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');
    DBMS_OUTPUT.PUT_LINE('TASK-040 pkg_review tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');

    ROLLBACK; -- discard every fixture row above.

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-040 pkg_review tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
