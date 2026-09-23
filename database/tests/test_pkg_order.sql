-- ============================================================================
-- test_pkg_order.sql
-- TASK-015: Unit tests for pkg_order.submit_order.
--
-- Run via SQL Workshop -> SQL Commands (or SQLcl) AFTER pkg_order has been
-- installed (which needs 010-060_*.sql and pkg_security/pkg_order_status/
-- pkg_compat/pkg_pricing). Self-contained: creates its own TEST_-prefixed
-- fixture rows and ROLLBACKs everything at the end.
--
-- Does NOT exercise the photo-storage path with a real file (no live APEX
-- session means APEX_APPLICATION_TEMP_FILES is always empty here) --
-- instead it uses an unknown temp file name to prove the *failure* path
-- (pkg_security rejects it) still rolls the whole order back atomically,
-- which is the property this suite most wants to prove.
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count   PLS_INTEGER := 0;
    v_fail_count   PLS_INTEGER := 0;

    v_category_id       module_category.category_id%TYPE;
    v_vehicle_id         vehicle_ref.vehicle_id%TYPE;
    v_service_a_id         service.service_id%TYPE;  -- confirmed for the matched entry
    v_service_b_id           service.service_id%TYPE;  -- NOT linked to the matched entry
    v_entry_id                  compatibility_entry.entry_id%TYPE;

    v_no_answers    pkg_order.t_answer_input_tab;
    v_no_photos     pkg_order.t_photo_input_tab;

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

    -- Builds a fresh idempotency key for a single test so tests never
    -- collide with each other's ORDERS rows.
    FUNCTION new_idemp_key(p_suffix IN VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        RETURN 'TEST-IDEMP-015-' || p_suffix || '-' || DBMS_RANDOM.STRING('U', 10);
    END new_idemp_key;

BEGIN
    ----------------------------------------------------------------------
    -- Fixtures
    ----------------------------------------------------------------------
    INSERT INTO module_category (name, display_seq)
        VALUES ('TEST_CATEGORY_015', 999)
        RETURNING category_id INTO v_category_id;

    INSERT INTO vehicle_ref (make, model, year)
        VALUES ('TEST_MAKE_015', 'TEST_MODEL_015', 2023)
        RETURNING vehicle_id INTO v_vehicle_id;

    MERGE INTO price_tier tgt
    USING (SELECT 'T015' AS tier_code, 220.00 AS amount FROM dual) src
    ON (tgt.tier_code = src.tier_code)
    WHEN NOT MATCHED THEN INSERT (tier_code, amount) VALUES (src.tier_code, src.amount);

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_015_A', 'T015', 'TEST_SET_015', 'N')
        RETURNING service_id INTO v_service_a_id;

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_015_B', 'T015', 'TEST_SET_015', 'N')
        RETURNING service_id INTO v_service_b_id;

    INSERT INTO compatibility_entry (vehicle_id, category_id, part_number, source)
        VALUES (v_vehicle_id, v_category_id, 'TEST-PN-015-MATCH', 'ADMIN_CONFIRMED')
        RETURNING entry_id INTO v_entry_id;

    -- Only service A is confirmed for this entry -- service B exists but is
    -- deliberately NOT linked, to exercise the -20081 rejection below.
    INSERT INTO compatibility_service (entry_id, service_id) VALUES (v_entry_id, v_service_a_id);

    -- Guarantee APP_SETTING.RETURN_SHIPPING_FEE exists (pkg_pricing needs
    -- it on the matched path); leaves any real value alone if already set.
    MERGE INTO app_setting tgt
    USING (SELECT 'RETURN_SHIPPING_FEE' AS setting_key, '25.00' AS setting_value FROM dual) src
    ON (tgt.setting_key = src.setting_key)
    WHEN NOT MATCHED THEN INSERT (setting_key, setting_value) VALUES (src.setting_key, src.setting_value);

    DBMS_OUTPUT.PUT_LINE('Fixtures created: category=' || v_category_id || ' vehicle=' || v_vehicle_id
        || ' service_a=' || v_service_a_id || ' service_b=' || v_service_b_id || ' entry=' || v_entry_id);
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');

    ----------------------------------------------------------------------
    -- Unmatched path: no compatibility entry for this part number.
    ----------------------------------------------------------------------
    DECLARE
        v_idemp        VARCHAR2(100) := new_idemp_key('UNMATCHED');
        v_order_id     orders.order_id%TYPE;
        v_token        orders.tracking_token%TYPE;
        v_status       orders.status%TYPE;
        v_svc          orders.service_id%TYPE;
        v_entry        orders.matched_entry_id%TYPE;
        v_price        orders.service_price%TYPE;
        v_fee          orders.return_shipping_fee%TYPE;
        v_total        orders.total_amount%TYPE;
        v_hist_count   PLS_INTEGER;
    BEGIN
        pkg_order.submit_order(
            p_vehicle_id            => v_vehicle_id,
            p_category_id           => v_category_id,
            p_part_number           => 'TEST-PN-015-NOMATCH',
            p_description           => 'Unmatched fixture order for TASK-015 tests',
            p_customer_name         => 'Test Customer',
            p_customer_email        => 'test.customer@example.com',
            p_customer_phone        => '808-555-0100',
            p_return_address_street => '123 Test St',
            p_return_address_city   => 'Honolulu',
            p_return_address_zip    => '96813',
            p_answers               => v_no_answers,
            p_photos                => v_no_photos,
            p_idempotency_key       => v_idemp,
            p_order_id              => v_order_id,
            p_tracking_token        => v_token
        );

        SELECT status, service_id, matched_entry_id, service_price, return_shipping_fee, total_amount
          INTO v_status, v_svc, v_entry, v_price, v_fee, v_total
          FROM orders WHERE order_id = v_order_id;

        SELECT COUNT(*) INTO v_hist_count FROM order_status_history WHERE order_id = v_order_id;

        report('unmatched: order created with status Pending Review',
               v_status = 'Pending Review', 'status=' || v_status);
        report('unmatched: SERVICE_ID/MATCHED_ENTRY_ID/prices are all NULL',
               v_svc IS NULL AND v_entry IS NULL AND v_price IS NULL AND v_fee IS NULL AND v_total IS NULL,
               'service=' || v_svc || ' entry=' || v_entry || ' price=' || v_price);
        report('unmatched: exactly one ORDER_STATUS_HISTORY row (Pending Review)',
               v_hist_count = 1, 'hist_count=' || v_hist_count);
        report('unmatched: TRACKING_TOKEN was returned and is non-null',
               v_token IS NOT NULL);
    EXCEPTION
        WHEN OTHERS THEN
            report('unmatched path completes without error', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- Unmatched path, but the caller passes a service_id anyway -- must be
    -- ignored (stored as NULL), never trusted.
    ----------------------------------------------------------------------
    DECLARE
        v_idemp     VARCHAR2(100) := new_idemp_key('UNMATCHED-WITH-SVC');
        v_order_id  orders.order_id%TYPE;
        v_token     orders.tracking_token%TYPE;
        v_svc       orders.service_id%TYPE;
    BEGIN
        pkg_order.submit_order(
            p_vehicle_id            => v_vehicle_id,
            p_category_id           => v_category_id,
            p_part_number           => 'TEST-PN-015-NOMATCH-2',
            p_service_id            => v_service_a_id, -- should be ignored: no match exists
            p_description           => 'Unmatched fixture order with a stray service_id',
            p_customer_name         => 'Test Customer',
            p_customer_email        => 'test.customer@example.com',
            p_customer_phone        => '808-555-0100',
            p_return_address_street => '123 Test St',
            p_return_address_city   => 'Honolulu',
            p_return_address_zip    => '96813',
            p_answers               => v_no_answers,
            p_photos                => v_no_photos,
            p_idempotency_key       => v_idemp,
            p_order_id              => v_order_id,
            p_tracking_token        => v_token
        );

        SELECT service_id INTO v_svc FROM orders WHERE order_id = v_order_id;

        report('unmatched: a stray p_service_id from the caller is ignored', v_svc IS NULL, 'service_id=' || v_svc);
    EXCEPTION
        WHEN OTHERS THEN
            report('unmatched: a stray p_service_id from the caller is ignored', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- Matched path: prices snapshotted, status moved to Awaiting Payment.
    ----------------------------------------------------------------------
    DECLARE
        v_idemp        VARCHAR2(100) := new_idemp_key('MATCHED');
        v_order_id     orders.order_id%TYPE;
        v_token        orders.tracking_token%TYPE;
        v_status       orders.status%TYPE;
        v_svc          orders.service_id%TYPE;
        v_entry        orders.matched_entry_id%TYPE;
        v_price        orders.service_price%TYPE;
        v_fee          orders.return_shipping_fee%TYPE;
        v_total        orders.total_amount%TYPE;
        v_hist_count   PLS_INTEGER;
        v_answers      pkg_order.t_answer_input_tab;
    BEGIN
        v_answers(1).question_code := 'TEST_Q_015_A';
        v_answers(1).answer_value  := 'yes';
        v_answers(2).question_code := 'TEST_Q_015_B';
        v_answers(2).answer_value  := 'no';

        pkg_order.submit_order(
            p_vehicle_id            => v_vehicle_id,
            p_category_id           => v_category_id,
            p_part_number           => 'test-pn-015-match', -- lower-case: exercises pkg_compat's normalization too
            p_service_id            => v_service_a_id,
            p_description           => 'Matched fixture order for TASK-015 tests',
            p_customer_name         => 'Test Customer',
            p_customer_email        => 'test.customer@example.com',
            p_customer_phone        => '808-555-0100',
            p_return_address_street => '123 Test St',
            p_return_address_city   => 'Honolulu',
            p_return_address_zip    => '96813',
            p_answers               => v_answers,
            p_photos                => v_no_photos,
            p_idempotency_key       => v_idemp,
            p_order_id              => v_order_id,
            p_tracking_token        => v_token
        );

        SELECT status, service_id, matched_entry_id, service_price, return_shipping_fee, total_amount
          INTO v_status, v_svc, v_entry, v_price, v_fee, v_total
          FROM orders WHERE order_id = v_order_id;

        SELECT COUNT(*) INTO v_hist_count FROM order_status_history WHERE order_id = v_order_id;

        report('matched: status moved to Awaiting Payment', v_status = 'Awaiting Payment', 'status=' || v_status);
        report('matched: SERVICE_ID/MATCHED_ENTRY_ID are set', v_svc = v_service_a_id AND v_entry = v_entry_id);
        report('matched: prices snapshotted (service_price=220.00, total=price+fee)',
               v_price = 220.00 AND v_total = v_price + v_fee, 'price=' || v_price || ' fee=' || v_fee || ' total=' || v_total);
        report('matched: two ORDER_STATUS_HISTORY rows (Pending Review, Awaiting Payment)',
               v_hist_count = 2, 'hist_count=' || v_hist_count);

        DECLARE
            v_ans_count PLS_INTEGER;
        BEGIN
            SELECT COUNT(*) INTO v_ans_count FROM order_answer WHERE order_id = v_order_id;
            report('matched: both ORDER_ANSWER rows were saved', v_ans_count = 2, 'ans_count=' || v_ans_count);
        END;
    EXCEPTION
        WHEN OTHERS THEN
            report('matched path completes without error', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- Matched path, no service selected -- rejected.
    ----------------------------------------------------------------------
    SAVEPOINT sp_no_service;
    DECLARE
        v_idemp     VARCHAR2(100) := new_idemp_key('NOSVC');
        v_order_id  orders.order_id%TYPE;
        v_token     orders.tracking_token%TYPE;
        v_raised    BOOLEAN := FALSE;
        v_detail    VARCHAR2(4000);
    BEGIN
        BEGIN
            pkg_order.submit_order(
                p_vehicle_id            => v_vehicle_id,
                p_category_id           => v_category_id,
                p_part_number           => 'TEST-PN-015-MATCH',
                p_description           => 'Matched order missing a service selection',
                p_customer_name         => 'Test Customer',
                p_customer_email        => 'test.customer@example.com',
                p_customer_phone        => '808-555-0100',
                p_return_address_street => '123 Test St',
                p_return_address_city   => 'Honolulu',
                p_return_address_zip    => '96813',
                p_answers               => v_no_answers,
                p_photos                => v_no_photos,
                p_idempotency_key       => v_idemp,
                p_order_id              => v_order_id,
                p_tracking_token        => v_token
            );
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('matched: rejects a submission with no service selected (ORA-20080)',
               v_raised AND INSTR(v_detail, '-20080') > 0, v_detail);
    END;
    ROLLBACK TO SAVEPOINT sp_no_service;

    ----------------------------------------------------------------------
    -- Matched path, service_id not confirmed for this entry -- rejected --
    -- and nothing was left behind (atomicity, verified via the savepoint
    -- rollback above already discarding it; this just double-checks the
    -- idempotency_key was never persisted).
    ----------------------------------------------------------------------
    SAVEPOINT sp_wrong_service;
    DECLARE
        v_idemp        VARCHAR2(100) := new_idemp_key('WRONGSVC');
        v_order_id     orders.order_id%TYPE;
        v_token        orders.tracking_token%TYPE;
        v_raised       BOOLEAN := FALSE;
        v_detail       VARCHAR2(4000);
        v_order_count  PLS_INTEGER;
    BEGIN
        BEGIN
            pkg_order.submit_order(
                p_vehicle_id            => v_vehicle_id,
                p_category_id           => v_category_id,
                p_part_number           => 'TEST-PN-015-MATCH',
                p_service_id            => v_service_b_id, -- exists, but NOT confirmed for this entry
                p_description           => 'Matched order with an unconfirmed service',
                p_customer_name         => 'Test Customer',
                p_customer_email        => 'test.customer@example.com',
                p_customer_phone        => '808-555-0100',
                p_return_address_street => '123 Test St',
                p_return_address_city   => 'Honolulu',
                p_return_address_zip    => '96813',
                p_answers               => v_no_answers,
                p_photos                => v_no_photos,
                p_idempotency_key       => v_idemp,
                p_order_id              => v_order_id,
                p_tracking_token        => v_token
            );
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('matched: rejects a service that is not confirmed for the entry (ORA-20081)',
               v_raised AND INSTR(v_detail, '-20081') > 0, v_detail);

        SELECT COUNT(*) INTO v_order_count FROM orders WHERE idempotency_key = v_idemp;
        report('matched: a rejected submission leaves no ORDERS row behind (still-open transaction check)',
               v_order_count = 0, 'order_count=' || v_order_count);
    END;
    ROLLBACK TO SAVEPOINT sp_wrong_service;

    ----------------------------------------------------------------------
    -- Atomicity: a failure deep in the call (bad photo temp file name)
    -- still rolls back the ORDERS row, history row, etc. that were already
    -- inserted earlier in the same call -- proving the internal SAVEPOINT
    -- protects the whole procedure, not just the validation checks above.
    ----------------------------------------------------------------------
    SAVEPOINT sp_bad_photo;
    DECLARE
        v_idemp        VARCHAR2(100) := new_idemp_key('BADPHOTO');
        v_order_id     orders.order_id%TYPE;
        v_token        orders.tracking_token%TYPE;
        v_raised       BOOLEAN := FALSE;
        v_detail       VARCHAR2(4000);
        v_order_count  PLS_INTEGER;
        v_photos       pkg_order.t_photo_input_tab;
    BEGIN
        v_photos(1).photo_type     := 'STICKER';
        v_photos(1).temp_file_name := 'TEST-015-NO-SUCH-TEMP-FILE';

        BEGIN
            pkg_order.submit_order(
                p_vehicle_id            => v_vehicle_id,
                p_category_id           => v_category_id,
                p_part_number           => 'TEST-PN-015-NOMATCH',
                p_description           => 'Order with a bad photo temp file name',
                p_customer_name         => 'Test Customer',
                p_customer_email        => 'test.customer@example.com',
                p_customer_phone        => '808-555-0100',
                p_return_address_street => '123 Test St',
                p_return_address_city   => 'Honolulu',
                p_return_address_zip    => '96813',
                p_answers               => v_no_answers,
                p_photos                => v_photos,
                p_idempotency_key       => v_idemp,
                p_order_id              => v_order_id,
                p_tracking_token        => v_token
            );
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('atomicity: a bad photo temp file name raises', v_raised, v_detail);

        -- Even without the caller doing anything special, submit_order's
        -- own internal ROLLBACK TO SAVEPOINT already undid the ORDERS
        -- insert made earlier in this same call, before the photo step
        -- failed -- so it's already gone even though we are still inside
        -- the same overall transaction as this test script.
        SELECT COUNT(*) INTO v_order_count FROM orders WHERE idempotency_key = v_idemp;
        report('atomicity: submit_order''s own rollback already discarded the partial ORDERS row',
               v_order_count = 0, 'order_count=' || v_order_count);
    END;
    ROLLBACK TO SAVEPOINT sp_bad_photo;

    ----------------------------------------------------------------------
    -- Idempotency: resubmitting the same key returns the existing order,
    -- no duplicate ORDERS/ORDER_STATUS_HISTORY rows.
    ----------------------------------------------------------------------
    DECLARE
        v_idemp         VARCHAR2(100) := new_idemp_key('IDEMPOTENT');
        v_order_id_1    orders.order_id%TYPE;
        v_token_1       orders.tracking_token%TYPE;
        v_order_id_2    orders.order_id%TYPE;
        v_token_2       orders.tracking_token%TYPE;
        v_order_count   PLS_INTEGER;
        v_hist_count    PLS_INTEGER;
    BEGIN
        pkg_order.submit_order(
            p_vehicle_id            => v_vehicle_id,
            p_category_id           => v_category_id,
            p_part_number           => 'TEST-PN-015-NOMATCH',
            p_description           => 'Idempotency fixture order',
            p_customer_name         => 'Test Customer',
            p_customer_email        => 'test.customer@example.com',
            p_customer_phone        => '808-555-0100',
            p_return_address_street => '123 Test St',
            p_return_address_city   => 'Honolulu',
            p_return_address_zip    => '96813',
            p_answers               => v_no_answers,
            p_photos                => v_no_photos,
            p_idempotency_key       => v_idemp,
            p_order_id              => v_order_id_1,
            p_tracking_token        => v_token_1
        );

        pkg_order.submit_order(
            p_vehicle_id            => v_vehicle_id,
            p_category_id           => v_category_id,
            p_part_number           => 'TEST-PN-015-NOMATCH',
            p_description           => 'Idempotency fixture order -- resubmitted',
            p_customer_name         => 'Test Customer',
            p_customer_email        => 'test.customer@example.com',
            p_customer_phone        => '808-555-0100',
            p_return_address_street => '123 Test St',
            p_return_address_city   => 'Honolulu',
            p_return_address_zip    => '96813',
            p_answers               => v_no_answers,
            p_photos                => v_no_photos,
            p_idempotency_key       => v_idemp,
            p_order_id              => v_order_id_2,
            p_tracking_token        => v_token_2
        );

        SELECT COUNT(*) INTO v_order_count FROM orders WHERE idempotency_key = v_idemp;
        SELECT COUNT(*) INTO v_hist_count FROM order_status_history WHERE order_id = v_order_id_1;

        report('idempotency: resubmitting the same key returns the same order_id/tracking_token',
               v_order_id_2 = v_order_id_1 AND v_token_2 = v_token_1,
               'order1=' || v_order_id_1 || ' order2=' || v_order_id_2);
        report('idempotency: only one ORDERS row exists for that key', v_order_count = 1, 'order_count=' || v_order_count);
        report('idempotency: the resubmit did not add a second history row', v_hist_count = 1, 'hist_count=' || v_hist_count);
    EXCEPTION
        WHEN OTHERS THEN
            report('idempotency test completes without error', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- Summary + cleanup
    ----------------------------------------------------------------------
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');
    DBMS_OUTPUT.PUT_LINE('TASK-015 pkg_order tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');

    ROLLBACK; -- discard every fixture row, order, photo, answer and history row above.

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-015 pkg_order tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
