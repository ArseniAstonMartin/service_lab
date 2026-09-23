-- ============================================================================
-- test_pkg_stripe.sql
-- TASK-030: Unit tests for pkg_stripe's guard clauses.
--
-- Run via SQL Workshop -> SQL Commands (or SQLcl) AFTER pkg_stripe has been
-- installed (which needs 010-060_*.sql, pkg_pricing). Self-contained:
-- creates its own TEST_-prefixed fixture rows and ROLLBACKs everything at
-- the end.
--
-- Does NOT exercise the actual Stripe API calls (create_payment_link's
-- POST, get_payment_link_status/the idempotent re-fetch's GET) -- this
-- session has no live Stripe test-mode credential or network path to
-- api.stripe.com. What IS tested here is everything that fails before an
-- HTTP call is ever made: the order-not-found, not-yet-priced, and
-- no-link-yet guard clauses, all of which raise before
-- APEX_WEB_SERVICE.MAKE_REST_REQUEST is reached. The actual create/read
-- round-trip against Stripe test mode (this task's own acceptance
-- criterion) needs a live session with the STRIPE_SECRET_KEY Web
-- Credential configured -- see pkg_stripe.pks's header comment.
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count   PLS_INTEGER := 0;
    v_fail_count   PLS_INTEGER := 0;

    v_category_id         module_category.category_id%TYPE;
    v_vehicle_id          vehicle_ref.vehicle_id%TYPE;
    v_service_id          service.service_id%TYPE;
    v_order_unmatched_id  orders.order_id%TYPE;  -- no SERVICE_ID at all
    v_order_unpriced_id   orders.order_id%TYPE;  -- SERVICE_ID set, but not priced
    v_order_priced_id     orders.order_id%TYPE;  -- priced, but no Stripe link yet

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

    -- Asserts p_thunk-style single call raises and the error message
    -- mentions p_code. There's no first-class function value in PL/SQL, so
    -- each call site below wraps its own call rather than passing one in.
    FUNCTION mentions_code(p_message IN VARCHAR2, p_code IN NUMBER) RETURN BOOLEAN IS
    BEGIN
        RETURN p_message IS NOT NULL AND INSTR(p_message, TO_CHAR(p_code)) > 0;
    END mentions_code;

BEGIN
    ----------------------------------------------------------------------
    -- Fixtures
    ----------------------------------------------------------------------
    INSERT INTO module_category (name, display_seq)
        VALUES ('TEST_CATEGORY_030', 999)
        RETURNING category_id INTO v_category_id;

    INSERT INTO vehicle_ref (make, model, year)
        VALUES ('TEST_MAKE_030', 'TEST_MODEL_030', 2024)
        RETURNING vehicle_id INTO v_vehicle_id;

    MERGE INTO price_tier tgt
    USING (SELECT 'T030' AS tier_code, 180.00 AS amount FROM dual) src
    ON (tgt.tier_code = src.tier_code)
    WHEN NOT MATCHED THEN INSERT (tier_code, amount) VALUES (src.tier_code, src.amount);

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_030', 'T030', 'TEST_SET_030', 'N')
        RETURNING service_id INTO v_service_id;

    MERGE INTO app_setting tgt
    USING (SELECT 'RETURN_SHIPPING_FEE' AS setting_key, '25.00' AS setting_value FROM dual) src
    ON (tgt.setting_key = src.setting_key)
    WHEN NOT MATCHED THEN INSERT (setting_key, setting_value) VALUES (src.setting_key, src.setting_value);

    -- Order with no SERVICE_ID at all (Pending Review, unmatched).
    INSERT INTO orders (
        tracking_token, status, vehicle_id, category_id, part_number_entered,
        description, customer_name, customer_email, customer_phone,
        return_address_street, return_address_city, return_address_state, return_address_zip,
        idempotency_key
    ) VALUES (
        'TEST-TOKEN-030-A-' || DBMS_RANDOM.STRING('U', 20), 'Pending Review', v_vehicle_id, v_category_id, 'test-pn-030-a',
        'Unmatched fixture order for TASK-030 tests',
        'Test Customer', 'test.customer@example.com', '808-555-0100',
        '123 Test St', 'Honolulu', 'HI', '96813',
        'TEST-IDEMP-030-A-' || DBMS_RANDOM.STRING('U', 20)
    ) RETURNING order_id INTO v_order_unmatched_id;

    -- Order with SERVICE_ID set but not yet priced (SERVICE_PRICE/
    -- RETURN_SHIPPING_FEE both NULL -- pkg_pricing.price_order never ran).
    INSERT INTO orders (
        tracking_token, status, vehicle_id, category_id, part_number_entered,
        service_id, description, customer_name, customer_email, customer_phone,
        return_address_street, return_address_city, return_address_state, return_address_zip,
        idempotency_key
    ) VALUES (
        'TEST-TOKEN-030-B-' || DBMS_RANDOM.STRING('U', 20), 'Pending Review', v_vehicle_id, v_category_id, 'test-pn-030-b',
        v_service_id, 'Unpriced fixture order for TASK-030 tests',
        'Test Customer', 'test.customer@example.com', '808-555-0100',
        '123 Test St', 'Honolulu', 'HI', '96813',
        'TEST-IDEMP-030-B-' || DBMS_RANDOM.STRING('U', 20)
    ) RETURNING order_id INTO v_order_unpriced_id;

    -- Order that IS priced (via pkg_pricing, same as the matched-order flow
    -- would leave it) but has no Stripe payment link yet.
    INSERT INTO orders (
        tracking_token, status, vehicle_id, category_id, part_number_entered,
        service_id, description, customer_name, customer_email, customer_phone,
        return_address_street, return_address_city, return_address_state, return_address_zip,
        idempotency_key
    ) VALUES (
        'TEST-TOKEN-030-C-' || DBMS_RANDOM.STRING('U', 20), 'Awaiting Payment', v_vehicle_id, v_category_id, 'test-pn-030-c',
        v_service_id, 'Priced fixture order for TASK-030 tests',
        'Test Customer', 'test.customer@example.com', '808-555-0100',
        '123 Test St', 'Honolulu', 'HI', '96813',
        'TEST-IDEMP-030-C-' || DBMS_RANDOM.STRING('U', 20)
    ) RETURNING order_id INTO v_order_priced_id;

    pkg_pricing.price_order(p_order_id => v_order_priced_id, p_service_id => v_service_id);

    DBMS_OUTPUT.PUT_LINE('Fixtures created: category=' || v_category_id || ' vehicle=' || v_vehicle_id
        || ' service=' || v_service_id || ' order_unmatched=' || v_order_unmatched_id
        || ' order_unpriced=' || v_order_unpriced_id || ' order_priced=' || v_order_priced_id);
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');

    ----------------------------------------------------------------------
    -- create_payment_link: unknown order_id
    ----------------------------------------------------------------------
    DECLARE
        v_dummy  VARCHAR2(500);
        v_raised BOOLEAN := FALSE;
        v_detail VARCHAR2(4000);
    BEGIN
        BEGIN
            v_dummy := pkg_stripe.create_payment_link(-999999);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('create_payment_link rejects an unknown order_id (ORA-20090)',
               v_raised AND mentions_code(v_detail, -20090), v_detail);
    END;

    ----------------------------------------------------------------------
    -- create_payment_link: order has no SERVICE_ID (the INNER JOIN to
    -- SERVICE finds no row, same as "order does not exist" from the
    -- caller's point of view -- both are -20090).
    ----------------------------------------------------------------------
    DECLARE
        v_dummy  VARCHAR2(500);
        v_raised BOOLEAN := FALSE;
        v_detail VARCHAR2(4000);
    BEGIN
        BEGIN
            v_dummy := pkg_stripe.create_payment_link(v_order_unmatched_id);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('create_payment_link rejects an order with no SERVICE_ID (ORA-20090)',
               v_raised AND mentions_code(v_detail, -20090), v_detail);
    END;

    ----------------------------------------------------------------------
    -- create_payment_link: order has a SERVICE_ID but was never priced.
    ----------------------------------------------------------------------
    DECLARE
        v_dummy  VARCHAR2(500);
        v_raised BOOLEAN := FALSE;
        v_detail VARCHAR2(4000);
    BEGIN
        BEGIN
            v_dummy := pkg_stripe.create_payment_link(v_order_unpriced_id);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('create_payment_link rejects an order that has not been priced yet (ORA-20091)',
               v_raised AND mentions_code(v_detail, -20091), v_detail);
    END;

    ----------------------------------------------------------------------
    -- get_payment_link_status: unknown order_id
    ----------------------------------------------------------------------
    DECLARE
        v_dummy  VARCHAR2(20);
        v_raised BOOLEAN := FALSE;
        v_detail VARCHAR2(4000);
    BEGIN
        BEGIN
            v_dummy := pkg_stripe.get_payment_link_status(-999999);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('get_payment_link_status rejects an unknown order_id (ORA-20090)',
               v_raised AND mentions_code(v_detail, -20090), v_detail);
    END;

    ----------------------------------------------------------------------
    -- get_payment_link_status: order exists and is priced, but has no
    -- Stripe payment link yet.
    ----------------------------------------------------------------------
    DECLARE
        v_dummy  VARCHAR2(20);
        v_raised BOOLEAN := FALSE;
        v_detail VARCHAR2(4000);
    BEGIN
        BEGIN
            v_dummy := pkg_stripe.get_payment_link_status(v_order_priced_id);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('get_payment_link_status rejects a priced order with no payment link yet (ORA-20094)',
               v_raised AND mentions_code(v_detail, -20094), v_detail);
    END;

    ----------------------------------------------------------------------
    -- Summary + cleanup
    ----------------------------------------------------------------------
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');
    DBMS_OUTPUT.PUT_LINE('TASK-030 pkg_stripe guard-clause tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');
    DBMS_OUTPUT.PUT_LINE('NOTE: the actual Stripe create/read round-trip is NOT covered here -- see this file''s header comment.');

    ROLLBACK; -- discard every fixture row above.

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-030 pkg_stripe tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
