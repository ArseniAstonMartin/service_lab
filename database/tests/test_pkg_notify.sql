-- ============================================================================
-- test_pkg_notify.sql
-- TASK-027: Unit tests for pkg_notify.
--
-- Run via SQL Workshop -> SQL Commands (or SQLcl) AFTER pkg_notify has been
-- installed. Self-contained: creates its own TEST_-prefixed fixture rows and
-- ROLLBACKs everything at the end.
--
-- What this DOES exercise, unlike test_pkg_stripe.sql: pkg_notify.send's
-- happy path is reachable even without live SMTP/Approved Sender, because
-- send() never raises on a delivery failure -- it always logs to EMAIL_LOG
-- and returns quietly (see pkg_notify.pks). So this script calls send() for
-- real and checks that exactly one EMAIL_LOG row appears with a SUCCESS or
-- FAILED result (either is a pass for this test -- the point is that send()
-- didn't raise and did log). What it can NOT verify without a live session
-- is which of the two actually happens, or that mail is genuinely
-- delivered -- that depends on whether the ORDER_SUBMITTED/ADMIN_NEW_ORDER
-- Email Templates exist yet (f94517 Shared Components) and whether SMTP is
-- configured, both manual prerequisites documented in pkg_notify.pks.
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count   PLS_INTEGER := 0;
    v_fail_count   PLS_INTEGER := 0;

    v_category_id   module_category.category_id%TYPE;
    v_vehicle_id    vehicle_ref.vehicle_id%TYPE;
    v_service_id    service.service_id%TYPE;
    v_order_id      orders.order_id%TYPE;
    v_admin_email   app_setting.setting_value%TYPE;

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

BEGIN
    ----------------------------------------------------------------------
    -- Fixtures
    ----------------------------------------------------------------------
    INSERT INTO module_category (name, display_seq)
        VALUES ('TEST_CATEGORY_027', 999)
        RETURNING category_id INTO v_category_id;

    INSERT INTO vehicle_ref (make, model, year)
        VALUES ('TEST_MAKE_027', 'TEST_MODEL_027', 2024)
        RETURNING vehicle_id INTO v_vehicle_id;

    MERGE INTO price_tier tgt
    USING (SELECT 'T027' AS tier_code, 150.00 AS amount FROM dual) src
    ON (tgt.tier_code = src.tier_code)
    WHEN NOT MATCHED THEN INSERT (tier_code, amount) VALUES (src.tier_code, src.amount);

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_027', 'T027', 'TEST_SET_027', 'N')
        RETURNING service_id INTO v_service_id;

    INSERT INTO orders (
        tracking_token, status, vehicle_id, category_id, part_number_entered,
        service_id, description, customer_name, customer_email, customer_phone,
        return_address_street, return_address_city, return_address_state, return_address_zip,
        idempotency_key
    ) VALUES (
        'TEST-TOKEN-027-' || DBMS_RANDOM.STRING('U', 20), 'Pending Review', v_vehicle_id, v_category_id, 'test-pn-027',
        v_service_id, 'Fixture order for TASK-027 tests',
        'Test Customer', 'test.customer@example.com', '808-555-0100',
        '123 Test St', 'Honolulu', 'HI', '96813',
        'TEST-IDEMP-027-' || DBMS_RANDOM.STRING('U', 20)
    ) RETURNING order_id INTO v_order_id;

    SELECT setting_value INTO v_admin_email FROM app_setting WHERE setting_key = 'ADMIN_EMAIL';

    DBMS_OUTPUT.PUT_LINE('Fixtures created: category=' || v_category_id || ' vehicle=' || v_vehicle_id
        || ' service=' || v_service_id || ' order=' || v_order_id);
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');

    ----------------------------------------------------------------------
    -- default_placeholders: unknown order_id
    ----------------------------------------------------------------------
    DECLARE
        v_dummy  CLOB;
        v_raised BOOLEAN := FALSE;
        v_detail VARCHAR2(4000);
    BEGIN
        BEGIN
            v_dummy := pkg_notify.default_placeholders(-999999);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('default_placeholders rejects an unknown order_id (ORA-20090)',
               v_raised AND mentions_code(v_detail, -20090), v_detail);
    END;

    ----------------------------------------------------------------------
    -- default_placeholders: valid order_id returns the expected keys
    ----------------------------------------------------------------------
    DECLARE
        v_json CLOB;
    BEGIN
        v_json := pkg_notify.default_placeholders(v_order_id);
        report('default_placeholders includes ORDER_ID for a valid order',
               JSON_VALUE(v_json, '$.ORDER_ID') = TO_CHAR(v_order_id), v_json);
        report('default_placeholders includes TRACKING_URL for a valid order',
               JSON_VALUE(v_json, '$.TRACKING_URL') IS NOT NULL, v_json);
    END;

    ----------------------------------------------------------------------
    -- send: unknown order_id
    ----------------------------------------------------------------------
    DECLARE
        v_raised BOOLEAN := FALSE;
        v_detail VARCHAR2(4000);
    BEGIN
        BEGIN
            pkg_notify.send(p_order_id => -999999, p_email_type => 'ORDER_SUBMITTED');
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('send rejects an unknown order_id (ORA-20090)',
               v_raised AND mentions_code(v_detail, -20090), v_detail);
    END;

    ----------------------------------------------------------------------
    -- send: unknown email_type
    ----------------------------------------------------------------------
    DECLARE
        v_raised BOOLEAN := FALSE;
        v_detail VARCHAR2(4000);
    BEGIN
        BEGIN
            pkg_notify.send(p_order_id => v_order_id, p_email_type => 'NOT_A_REAL_TYPE');
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('send rejects an unknown email_type (ORA-20095)',
               v_raised AND mentions_code(v_detail, -20095), v_detail);
    END;

    ----------------------------------------------------------------------
    -- send: valid call never raises, and logs exactly one EMAIL_LOG row
    -- (SUCCESS or FAILED -- both are a pass here; see header comment).
    ----------------------------------------------------------------------
    DECLARE
        v_raised     BOOLEAN := FALSE;
        v_log_count  PLS_INTEGER;
        v_result     email_log.result%TYPE;
    BEGIN
        BEGIN
            pkg_notify.send(p_order_id => v_order_id, p_email_type => 'ORDER_SUBMITTED');
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
        END;
        report('send never raises for a valid order/email_type, even without live SMTP', NOT v_raised);

        SELECT COUNT(*) INTO v_log_count
          FROM email_log
         WHERE order_id = v_order_id AND email_type = 'ORDER_SUBMITTED';
        report('send writes exactly one EMAIL_LOG row', v_log_count = 1, 'count=' || v_log_count);

        IF v_log_count = 1 THEN
            SELECT result INTO v_result FROM email_log
             WHERE order_id = v_order_id AND email_type = 'ORDER_SUBMITTED';
            report('EMAIL_LOG.result is SUCCESS or FAILED', v_result IN ('SUCCESS', 'FAILED'), v_result);
        END IF;
    END;

    ----------------------------------------------------------------------
    -- send: ADMIN_NEW_ORDER defaults the recipient to APP_SETTING.ADMIN_EMAIL
    ----------------------------------------------------------------------
    DECLARE
        v_recipient email_log.recipient%TYPE;
    BEGIN
        pkg_notify.send(p_order_id => v_order_id, p_email_type => 'ADMIN_NEW_ORDER');

        SELECT recipient INTO v_recipient
          FROM email_log
         WHERE order_id = v_order_id AND email_type = 'ADMIN_NEW_ORDER'
           AND ROWNUM = 1
         ORDER BY email_log_id DESC;

        report('send defaults ADMIN_NEW_ORDER recipient to APP_SETTING.ADMIN_EMAIL',
               v_recipient = v_admin_email, v_recipient || ' vs ' || v_admin_email);
    END;

    ----------------------------------------------------------------------
    -- send: p_recipient_override wins over the default recipient
    ----------------------------------------------------------------------
    DECLARE
        v_recipient email_log.recipient%TYPE;
    BEGIN
        pkg_notify.send(p_order_id => v_order_id, p_email_type => 'MODULE_RECEIVED',
                         p_recipient_override => 'override.test@example.com');

        SELECT recipient INTO v_recipient
          FROM email_log
         WHERE order_id = v_order_id AND email_type = 'MODULE_RECEIVED'
           AND ROWNUM = 1
         ORDER BY email_log_id DESC;

        report('p_recipient_override overrides the default recipient',
               v_recipient = 'override.test@example.com', v_recipient);
    END;

    ----------------------------------------------------------------------
    -- Summary + cleanup
    ----------------------------------------------------------------------
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');
    DBMS_OUTPUT.PUT_LINE('TASK-027 pkg_notify tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');
    DBMS_OUTPUT.PUT_LINE('NOTE: a SUCCESS/FAILED EMAIL_LOG result is not itself proof of delivery --');
    DBMS_OUTPUT.PUT_LINE('that needs live SMTP config and the 5 Email Templates in f94517. See pkg_notify.pks.');

    ROLLBACK; -- discard every fixture row above (including any EMAIL_LOG rows this test wrote).

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-027 pkg_notify tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
