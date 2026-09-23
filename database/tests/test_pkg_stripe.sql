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
-- HTTP call is ever made: the order-not-found, not-yet-priced, wrong-status
-- (TASK-031) and no-link-yet guard clauses, all of which raise before
-- APEX_WEB_SERVICE.MAKE_REST_REQUEST is reached. The actual create/read
-- round-trip against Stripe test mode (this task's own acceptance
-- criterion) needs a live session with the STRIPE_SECRET_KEY Web
-- Credential configured -- see pkg_stripe.pks's header comment.
--
-- TASK-031: added a guard-clause test for create_payment_link's new status
-- check -- a priced order that is NOT in Awaiting Payment status (e.g.
-- already Payment Received) must be refused with ORA-20096, even though it
-- has everything else create_payment_link would otherwise accept.
--
-- TASK-032/033: added tests for handle_event -- unlike create_payment_link,
-- handle_event needs no live Stripe network access to test at all: it never
-- calls APEX_WEB_SERVICE -- handle_event is pure PL/SQL (HMAC + JSON +
-- local table writes), so every path (signature verification, idempotency,
-- event-type filtering, order resolution) is fully testable here. This
-- file seeds its own APP_SETTING.STRIPE_WEBHOOK_SECRET fixture value and
-- computes matching Stripe-Signature headers locally (compute_signature
-- below), using the exact same HMAC-SHA256-over-"<t>.<body>" construction
-- pkg_stripe.verify_signature uses -- so a passing test here is a real, if
-- narrow, proof that verify_signature's algorithm matches what it's meant
-- to reproduce, not just that "some string was compared to some other
-- string".
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count   PLS_INTEGER := 0;
    v_fail_count   PLS_INTEGER := 0;

    v_category_id         module_category.category_id%TYPE;
    v_vehicle_id          vehicle_ref.vehicle_id%TYPE;
    v_service_id          service.service_id%TYPE;
    v_order_unmatched_id     orders.order_id%TYPE;  -- no SERVICE_ID at all
    v_order_unpriced_id      orders.order_id%TYPE;  -- SERVICE_ID set, but not priced
    v_order_priced_id        orders.order_id%TYPE;  -- priced, but no Stripe link yet
    v_order_wrong_status_id  orders.order_id%TYPE;  -- priced, but already Payment Received (TASK-031)
    v_order_webhook_id       orders.order_id%TYPE;  -- priced, Awaiting Payment -- TASK-032/033 handle_event fixture

    c_webhook_secret  CONSTANT VARCHAR2(50) := 'whsec_TEST_032_033_' || DBMS_RANDOM.STRING('U', 10);

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

    -- TASK-032/033: builds a Stripe-Signature header value the exact same
    -- way pkg_stripe.verify_signature checks one -- HMAC-SHA256 of
    -- "<p_timestamp>.<p_payload>" using p_secret as the key, hex-encoded.
    -- Lets this file exercise handle_event's signature-verification gate
    -- with a genuinely valid signature, not just malformed/missing ones.
    FUNCTION compute_signature(
        p_payload   IN VARCHAR2,
        p_timestamp IN PLS_INTEGER,
        p_secret    IN VARCHAR2
    ) RETURN VARCHAR2 IS
        l_signed_payload VARCHAR2(32767);
    BEGIN
        l_signed_payload := TO_CHAR(p_timestamp) || '.' || p_payload;
        RETURN LOWER(RAWTOHEX(
            DBMS_CRYPTO.MAC(
                src => UTL_I18N.STRING_TO_RAW(l_signed_payload, 'AL32UTF8'),
                typ => DBMS_CRYPTO.HMAC_SH256,
                key => UTL_I18N.STRING_TO_RAW(p_secret, 'AL32UTF8')
            )
        ));
    END compute_signature;

    FUNCTION current_epoch RETURN PLS_INTEGER IS
    BEGIN
        RETURN ROUND((CAST((SYSTIMESTAMP AT TIME ZONE 'UTC') AS DATE) - DATE '1970-01-01') * 86400);
    END current_epoch;

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

    -- TASK-032/033: override STRIPE_WEBHOOK_SECRET with a fixture value for
    -- this test run. Not restored to the placeholder afterwards on
    -- purpose -- the whole script ROLLBACKs at the end (see Summary +
    -- cleanup), so a live admin-set value (if any) is untouched.
    MERGE INTO app_setting tgt
    USING (SELECT 'STRIPE_WEBHOOK_SECRET' AS setting_key, c_webhook_secret AS setting_value FROM dual) src
    ON (tgt.setting_key = src.setting_key)
    WHEN MATCHED THEN UPDATE SET tgt.setting_value = src.setting_value
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

    -- TASK-031: priced order, but already moved past Awaiting Payment --
    -- everything create_payment_link would otherwise need is present
    -- (SERVICE_ID, SERVICE_PRICE, RETURN_SHIPPING_FEE), only the status is
    -- wrong.
    INSERT INTO orders (
        tracking_token, status, vehicle_id, category_id, part_number_entered,
        service_id, description, customer_name, customer_email, customer_phone,
        return_address_street, return_address_city, return_address_state, return_address_zip,
        idempotency_key
    ) VALUES (
        'TEST-TOKEN-030-D-' || DBMS_RANDOM.STRING('U', 20), 'Payment Received', v_vehicle_id, v_category_id, 'test-pn-030-d',
        v_service_id, 'Already-paid fixture order for TASK-031 tests',
        'Test Customer', 'test.customer@example.com', '808-555-0100',
        '123 Test St', 'Honolulu', 'HI', '96813',
        'TEST-IDEMP-030-D-' || DBMS_RANDOM.STRING('U', 20)
    ) RETURNING order_id INTO v_order_wrong_status_id;

    pkg_pricing.price_order(p_order_id => v_order_wrong_status_id, p_service_id => v_service_id);

    -- TASK-032/033: priced, Awaiting Payment -- exactly the state a real
    -- order is in when Stripe's checkout.session.completed webhook for it
    -- arrives.
    INSERT INTO orders (
        tracking_token, status, vehicle_id, category_id, part_number_entered,
        service_id, description, customer_name, customer_email, customer_phone,
        return_address_street, return_address_city, return_address_state, return_address_zip,
        idempotency_key
    ) VALUES (
        'TEST-TOKEN-030-E-' || DBMS_RANDOM.STRING('U', 20), 'Awaiting Payment', v_vehicle_id, v_category_id, 'test-pn-030-e',
        v_service_id, 'Webhook fixture order for TASK-032/033 tests',
        'Test Customer', 'test.customer@example.com', '808-555-0100',
        '123 Test St', 'Honolulu', 'HI', '96813',
        'TEST-IDEMP-030-E-' || DBMS_RANDOM.STRING('U', 20)
    ) RETURNING order_id INTO v_order_webhook_id;

    pkg_pricing.price_order(p_order_id => v_order_webhook_id, p_service_id => v_service_id);

    DBMS_OUTPUT.PUT_LINE('Fixtures created: category=' || v_category_id || ' vehicle=' || v_vehicle_id
        || ' service=' || v_service_id || ' order_unmatched=' || v_order_unmatched_id
        || ' order_unpriced=' || v_order_unpriced_id || ' order_priced=' || v_order_priced_id
        || ' order_wrong_status=' || v_order_wrong_status_id || ' order_webhook=' || v_order_webhook_id);
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
    -- create_payment_link: order is priced and has a SERVICE_ID, but is
    -- not in Awaiting Payment status (TASK-031).
    ----------------------------------------------------------------------
    DECLARE
        v_dummy  VARCHAR2(500);
        v_raised BOOLEAN := FALSE;
        v_detail VARCHAR2(4000);
    BEGIN
        BEGIN
            v_dummy := pkg_stripe.create_payment_link(v_order_wrong_status_id);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('create_payment_link rejects a priced order that is not in Awaiting Payment status (ORA-20096)',
               v_raised AND mentions_code(v_detail, -20096), v_detail);
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
    -- TASK-033: handle_event -- missing Stripe-Signature header.
    -- "changes nothing": asserts no STRIPE_EVENT row was written, not just
    -- the 400 status.
    ----------------------------------------------------------------------
    DECLARE
        v_status_code   PLS_INTEGER;
        v_response_body VARCHAR2(4000);
        v_event_id      VARCHAR2(100) := 'evt_test_missing_header_' || DBMS_RANDOM.STRING('U', 10);
        v_payload       VARCHAR2(4000);
        v_row_count     PLS_INTEGER;
    BEGIN
        v_payload := '{"id":"' || v_event_id || '","type":"checkout.session.completed","data":{"object":{"payment_status":"paid","metadata":{"order_id":"' || v_order_webhook_id || '"}}}}';

        pkg_stripe.handle_event(
            p_payload          => v_payload,
            p_signature_header => NULL,
            p_status_code      => v_status_code,
            p_response_body    => v_response_body
        );

        SELECT COUNT(*) INTO v_row_count FROM stripe_event WHERE event_id = v_event_id;

        report('handle_event rejects a missing Stripe-Signature header (400, nothing written)',
               v_status_code = 400 AND v_row_count = 0, 'status=' || v_status_code || ' rows=' || v_row_count);
    END;

    ----------------------------------------------------------------------
    -- TASK-033: handle_event -- signature computed with the WRONG secret.
    ----------------------------------------------------------------------
    DECLARE
        v_status_code   PLS_INTEGER;
        v_response_body VARCHAR2(4000);
        v_event_id      VARCHAR2(100) := 'evt_test_bad_sig_' || DBMS_RANDOM.STRING('U', 10);
        v_payload       VARCHAR2(4000);
        v_timestamp     PLS_INTEGER := current_epoch;
        v_bad_sig       VARCHAR2(64);
        v_header        VARCHAR2(200);
        v_row_count     PLS_INTEGER;
    BEGIN
        v_payload := '{"id":"' || v_event_id || '","type":"checkout.session.completed","data":{"object":{"payment_status":"paid","metadata":{"order_id":"' || v_order_webhook_id || '"}}}}';
        v_bad_sig := compute_signature(v_payload, v_timestamp, 'whsec_WRONG_SECRET');
        v_header  := 't=' || v_timestamp || ',v1=' || v_bad_sig;

        pkg_stripe.handle_event(
            p_payload          => v_payload,
            p_signature_header => v_header,
            p_status_code      => v_status_code,
            p_response_body    => v_response_body
        );

        SELECT COUNT(*) INTO v_row_count FROM stripe_event WHERE event_id = v_event_id;

        report('handle_event rejects a signature computed with the wrong secret (400, nothing written)',
               v_status_code = 400 AND v_row_count = 0, 'status=' || v_status_code || ' rows=' || v_row_count);
    END;

    ----------------------------------------------------------------------
    -- TASK-033: handle_event -- correctly-signed but stale timestamp
    -- (older than c_timestamp_tolerance_seconds).
    ----------------------------------------------------------------------
    DECLARE
        v_status_code   PLS_INTEGER;
        v_response_body VARCHAR2(4000);
        v_event_id      VARCHAR2(100) := 'evt_test_stale_ts_' || DBMS_RANDOM.STRING('U', 10);
        v_payload       VARCHAR2(4000);
        v_stale_ts      PLS_INTEGER := current_epoch - 3600; -- 1 hour old, well past the 300s tolerance
        v_sig           VARCHAR2(64);
        v_header        VARCHAR2(200);
        v_row_count     PLS_INTEGER;
    BEGIN
        v_payload := '{"id":"' || v_event_id || '","type":"checkout.session.completed","data":{"object":{"payment_status":"paid","metadata":{"order_id":"' || v_order_webhook_id || '"}}}}';
        v_sig    := compute_signature(v_payload, v_stale_ts, c_webhook_secret);
        v_header := 't=' || v_stale_ts || ',v1=' || v_sig;

        pkg_stripe.handle_event(
            p_payload          => v_payload,
            p_signature_header => v_header,
            p_status_code      => v_status_code,
            p_response_body    => v_response_body
        );

        SELECT COUNT(*) INTO v_row_count FROM stripe_event WHERE event_id = v_event_id;

        report('handle_event rejects a correctly-signed but stale (>300s old) timestamp (400, nothing written)',
               v_status_code = 400 AND v_row_count = 0, 'status=' || v_status_code || ' rows=' || v_row_count);
    END;

    ----------------------------------------------------------------------
    -- TASK-032: handle_event -- a validly-signed, unrecognized event type
    -- is recorded (for audit) but not acted on: order status untouched.
    ----------------------------------------------------------------------
    DECLARE
        v_status_code    PLS_INTEGER;
        v_response_body  VARCHAR2(4000);
        v_event_id       VARCHAR2(100) := 'evt_test_ignored_type_' || DBMS_RANDOM.STRING('U', 10);
        v_payload        VARCHAR2(4000);
        v_timestamp      PLS_INTEGER := current_epoch;
        v_sig            VARCHAR2(64);
        v_header         VARCHAR2(200);
        v_row_count      PLS_INTEGER;
        v_status_after   orders.status%TYPE;
    BEGIN
        v_payload := '{"id":"' || v_event_id || '","type":"payment_intent.created","data":{"object":{"payment_status":"paid","metadata":{"order_id":"' || v_order_webhook_id || '"}}}}';
        v_sig    := compute_signature(v_payload, v_timestamp, c_webhook_secret);
        v_header := 't=' || v_timestamp || ',v1=' || v_sig;

        pkg_stripe.handle_event(
            p_payload          => v_payload,
            p_signature_header => v_header,
            p_status_code      => v_status_code,
            p_response_body    => v_response_body
        );

        SELECT COUNT(*) INTO v_row_count FROM stripe_event WHERE event_id = v_event_id;
        SELECT status INTO v_status_after FROM orders WHERE order_id = v_order_webhook_id;

        report('handle_event records but ignores an unrecognized event type (200, recorded, order untouched)',
               v_status_code = 200 AND v_row_count = 1 AND v_status_after = 'Awaiting Payment',
               'status=' || v_status_code || ' rows=' || v_row_count || ' order_status=' || v_status_after);
    END;

    ----------------------------------------------------------------------
    -- TASK-032/033: handle_event -- valid checkout.session.completed for
    -- v_order_webhook_id. The happy path: 200, STRIPE_EVENT row recorded
    -- with PROCESSED='Y' and ORDER_ID resolved, ORDERS.STRIPE_PAYMENT_
    -- STATUS updated, order moved to Payment Received. Then redelivers the
    -- SAME event to prove idempotency.
    ----------------------------------------------------------------------
    DECLARE
        v_status_code   PLS_INTEGER;
        v_response_body VARCHAR2(4000);
        v_event_id      VARCHAR2(100) := 'evt_test_happy_path_' || DBMS_RANDOM.STRING('U', 10);
        v_payload       VARCHAR2(4000);
        v_timestamp     PLS_INTEGER := current_epoch;
        v_sig           VARCHAR2(64);
        v_header        VARCHAR2(200);
        v_processed     stripe_event.processed%TYPE;
        v_resolved_id   stripe_event.order_id%TYPE;
        v_status_after  orders.status%TYPE;
        v_pay_status    orders.stripe_payment_status%TYPE;
        v_row_count     PLS_INTEGER;
    BEGIN
        v_payload := '{"id":"' || v_event_id || '","type":"checkout.session.completed","data":{"object":{"payment_status":"paid","metadata":{"order_id":"' || v_order_webhook_id || '"}}}}';
        v_sig    := compute_signature(v_payload, v_timestamp, c_webhook_secret);
        v_header := 't=' || v_timestamp || ',v1=' || v_sig;

        pkg_stripe.handle_event(
            p_payload          => v_payload,
            p_signature_header => v_header,
            p_status_code      => v_status_code,
            p_response_body    => v_response_body
        );

        SELECT processed, order_id INTO v_processed, v_resolved_id FROM stripe_event WHERE event_id = v_event_id;
        SELECT status, stripe_payment_status INTO v_status_after, v_pay_status FROM orders WHERE order_id = v_order_webhook_id;

        report('handle_event processes a validly-signed checkout.session.completed (200, event recorded)',
               v_status_code = 200, 'status=' || v_status_code);
        report('handle_event resolves STRIPE_EVENT.ORDER_ID from data.object.metadata.order_id',
               v_resolved_id = v_order_webhook_id, 'resolved=' || v_resolved_id);
        report('handle_event marks the event PROCESSED (''Y'')',
               v_processed = 'Y', 'processed=' || v_processed);
        report('handle_event updates ORDERS.STRIPE_PAYMENT_STATUS from data.object.payment_status',
               v_pay_status = 'paid', 'stripe_payment_status=' || v_pay_status);
        report('handle_event moves the order to Payment Received via pkg_order_status.change_status',
               v_status_after = 'Payment Received', 'order_status=' || v_status_after);

        -- TASK-032: idempotency -- redelivering the SAME event_id (Stripe
        -- retries a webhook whose response it didn't see, or the endpoint
        -- returned non-2xx) must be a no-op: still 200, but not reprocessed
        -- (no second STRIPE_EVENT row for this event_id).
        pkg_stripe.handle_event(
            p_payload          => v_payload,
            p_signature_header => v_header,
            p_status_code      => v_status_code,
            p_response_body    => v_response_body
        );

        SELECT COUNT(*) INTO v_row_count FROM stripe_event WHERE event_id = v_event_id;
        report('handle_event treats a redelivered event_id as a no-op (200, still exactly 1 STRIPE_EVENT row)',
               v_status_code = 200 AND v_row_count = 1, 'status=' || v_status_code || ' rows=' || v_row_count);
    END;

    ----------------------------------------------------------------------
    -- Summary + cleanup
    ----------------------------------------------------------------------
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');
    DBMS_OUTPUT.PUT_LINE('TASK-030/031/032/033 pkg_stripe tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');
    DBMS_OUTPUT.PUT_LINE('NOTE: the actual Stripe create/read round-trip is NOT covered here -- see this file''s header comment.');

    ROLLBACK; -- discard every fixture row above.

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-030/031/032/033 pkg_stripe tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
