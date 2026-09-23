-- ============================================================================
-- test_pkg_order_status.sql
-- TASK-012: Unit tests for pkg_order_status.
--
-- Run via SQL Workshop -> SQL Commands (or SQLcl) AFTER pkg_order_status has
-- been installed (which needs 010-060_*.sql, since it references ORDERS,
-- ORDER_STATUS_HISTORY, ORDER_STATUS_REF and PKG_ORDER_STATUS_CTX).
-- Self-contained: creates its own fixture rows and ROLLBACKs everything at
-- the end, so it is safe to run against a schema with real data in it.
--
-- Covers: the full linear happy-path walk through all 7 statuses (with a
-- history row and get_next_statuses check at every step), an invalid
-- transition being rejected with STATUS left unchanged, a terminal-status
-- order offering no next status, an unknown order id being rejected, and
-- CHANGED_BY resolving to 'SYSTEM' by default (no APEX session in this
-- script) vs. an explicit p_changed_by override.
--
-- TASK-029: added EMAIL_LOG assertions for the transition to Block Received
-- (email #3, MODULE_RECEIVED) and to Ready / Shipped Back (email #4,
-- SHIPPED_BACK, with a RETURN_TRACKING_NO set beforehand), plus a final
-- check that no OTHER transition in the walk wrote an EMAIL_LOG row of its
-- own.
--
-- TASK-031: gave the fixture order a SERVICE_ID and pricing (matching how a
-- matched order really reaches Awaiting Payment) so the transition to
-- Awaiting Payment exercises on_status_changed's new branch, and asserts
-- that transition still succeeds (status moves, history row written) even
-- though this session has no live Stripe test-mode credential or network
-- path to api.stripe.com -- pkg_stripe.create_payment_link's own failure
-- is swallowed and logged by on_status_changed, exactly like a
-- pkg_notify failure would be. It deliberately does NOT assert that a
-- PAYMENT_LINK email was actually sent, since that depends on
-- pkg_stripe.create_payment_link actually succeeding against live Stripe
-- test mode -- the same limitation test_pkg_stripe.sql's own header
-- comment already documents for that package's tests. The final
-- cross-check at the end of the happy path is written to tolerate either
-- outcome: it asserts no EMAIL_LOG row of any type OTHER than
-- PAYMENT_LINK/MODULE_RECEIVED/SHIPPED_BACK exists, rather than an exact
-- row count that would depend on whether Stripe was actually reachable.
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count   PLS_INTEGER := 0;
    v_fail_count   PLS_INTEGER := 0;

    v_category_id  module_category.category_id%TYPE;
    v_vehicle_id   vehicle_ref.vehicle_id%TYPE;
    v_service_id   service.service_id%TYPE;  -- TASK-031
    v_order_id     orders.order_id%TYPE;

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

    -- Asserts change_status(p_order_id, p_new_status) succeeds, ORDERS.STATUS
    -- actually moved to p_new_status, and a matching ORDER_STATUS_HISTORY row
    -- was written.
    PROCEDURE expect_transition_ok(
        p_test_name   IN VARCHAR2,
        p_order_id    IN NUMBER,
        p_new_status  IN VARCHAR2,
        p_changed_by  IN VARCHAR2 DEFAULT NULL
    ) IS
        v_status         orders.status%TYPE;
        v_history_count  PLS_INTEGER;
    BEGIN
        pkg_order_status.change_status(
            p_order_id   => p_order_id,
            p_new_status => p_new_status,
            p_changed_by => p_changed_by
        );

        SELECT status INTO v_status FROM orders WHERE order_id = p_order_id;

        SELECT COUNT(*) INTO v_history_count
          FROM order_status_history
         WHERE order_id = p_order_id AND status = p_new_status;

        report(p_test_name, v_status = p_new_status AND v_history_count > 0,
               'status=' || v_status || ' history_rows=' || v_history_count);
    EXCEPTION
        WHEN OTHERS THEN
            report(p_test_name, FALSE, SQLERRM);
    END expect_transition_ok;

    -- Asserts change_status(p_order_id, p_new_status) raises, AND that
    -- ORDERS.STATUS is unchanged from p_expected_unchanged_status afterward
    -- (TASK-012 acceptance criteria: "leaves the status unchanged").
    PROCEDURE expect_transition_rejected(
        p_test_name                IN VARCHAR2,
        p_order_id                 IN NUMBER,
        p_new_status                IN VARCHAR2,
        p_expected_unchanged_status IN VARCHAR2
    ) IS
        v_status       orders.status%TYPE;
        v_raised       BOOLEAN := FALSE;
        v_detail       VARCHAR2(4000);
    BEGIN
        BEGIN
            pkg_order_status.change_status(p_order_id => p_order_id, p_new_status => p_new_status);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;

        SELECT status INTO v_status FROM orders WHERE order_id = p_order_id;

        report(p_test_name,
               v_raised AND v_status = p_expected_unchanged_status,
               CASE WHEN NOT v_raised THEN 'expected an error, none was raised'
                    WHEN v_status != p_expected_unchanged_status THEN 'status changed to ' || v_status || ' despite rejection'
                    ELSE v_detail END);
    END expect_transition_rejected;

BEGIN
    ----------------------------------------------------------------------
    -- Fixtures
    ----------------------------------------------------------------------
    INSERT INTO module_category (name, display_seq)
        VALUES ('TEST_CATEGORY_012', 999)
        RETURNING category_id INTO v_category_id;

    INSERT INTO vehicle_ref (make, model, year)
        VALUES ('TEST_MAKE_012', 'TEST_MODEL_012', 2020)
        RETURNING vehicle_id INTO v_vehicle_id;

    -- TASK-031: a service + price tier, so the fixture order can carry a
    -- SERVICE_ID and be priced before it reaches Awaiting Payment -- the
    -- same shape a real matched order is in by the time
    -- pkg_order.submit_order calls change_status for that transition.
    MERGE INTO price_tier tgt
    USING (SELECT 'T012' AS tier_code, 150.00 AS amount FROM dual) src
    ON (tgt.tier_code = src.tier_code)
    WHEN NOT MATCHED THEN INSERT (tier_code, amount) VALUES (src.tier_code, src.amount);

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_012', 'T012', 'TEST_SET_012', 'N')
        RETURNING service_id INTO v_service_id;

    MERGE INTO app_setting tgt
    USING (SELECT 'RETURN_SHIPPING_FEE' AS setting_key, '25.00' AS setting_value FROM dual) src
    ON (tgt.setting_key = src.setting_key)
    WHEN NOT MATCHED THEN INSERT (setting_key, setting_value) VALUES (src.setting_key, src.setting_value);

    -- Direct INSERT with an initial status -- TRG_ORDERS_STATUS_GUARD does
    -- not fire on INSERT (only UPDATE OF status), matching how
    -- pkg_order.submit_order (TASK-015) will create orders.
    INSERT INTO orders (
        tracking_token, status, vehicle_id, category_id, part_number_entered,
        service_id, description, customer_name, customer_email, customer_phone,
        return_address_street, return_address_city, return_address_state, return_address_zip,
        idempotency_key
    ) VALUES (
        'TEST-TOKEN-012-' || DBMS_RANDOM.STRING('U', 20), 'Pending Review', v_vehicle_id, v_category_id, 'test-pn-012',
        v_service_id, 'Test fixture order for TASK-012 pkg_order_status tests',
        'Test Customer', 'test.customer@example.com', '808-555-0100',
        '123 Test St', 'Honolulu', 'HI', '96813',
        'TEST-IDEMP-012-' || DBMS_RANDOM.STRING('U', 20)
    ) RETURNING order_id INTO v_order_id;

    -- TASK-031: price the order now, matching where a real matched order
    -- would be by the time it first reaches Awaiting Payment (pkg_pricing
    -- runs before pkg_order.submit_order calls change_status for that
    -- transition).
    pkg_pricing.price_order(p_order_id => v_order_id, p_service_id => v_service_id);

    DBMS_OUTPUT.PUT_LINE('Fixture order created: order_id=' || v_order_id || ' initial status=Pending Review');
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');

    ----------------------------------------------------------------------
    -- get_next_statuses before any transition
    ----------------------------------------------------------------------
    DECLARE
        v_next_code  VARCHAR2(30);
    BEGIN
        SELECT status_code INTO v_next_code
          FROM TABLE(pkg_order_status.get_next_statuses(v_order_id));

        report('get_next_statuses(Pending Review order) returns exactly "Awaiting Payment"',
               v_next_code = 'Awaiting Payment');
    EXCEPTION
        WHEN OTHERS THEN
            report('get_next_statuses(Pending Review order) returns exactly "Awaiting Payment"', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- Invalid transition: skipping ahead is rejected, status unchanged
    ----------------------------------------------------------------------
    expect_transition_rejected(
        'change_status rejects skipping Pending Review -> Payment Received',
        v_order_id, 'Payment Received', 'Pending Review'
    );

    expect_transition_rejected(
        'change_status rejects an unrecognized status value',
        v_order_id, 'Not A Real Status', 'Pending Review'
    );

    ----------------------------------------------------------------------
    -- Happy path: walk the full linear lifecycle, one step at a time
    ----------------------------------------------------------------------
    -- TASK-031: this transition now also runs on_status_changed's
    -- Awaiting Payment branch (pkg_stripe.create_payment_link + email #2).
    -- expect_transition_ok still passes here even though this session has
    -- no live Stripe credential/network path -- on_status_changed's
    -- WHEN OTHERS -> log_error swallows that failure, exactly as it would
    -- swallow a pkg_notify failure, so the status change and history row
    -- this assertion actually checks are unaffected either way. See this
    -- file's header comment for why the PAYMENT_LINK email itself is not
    -- separately asserted.
    expect_transition_ok('change_status: Pending Review -> Awaiting Payment', v_order_id, 'Awaiting Payment');
    expect_transition_ok('change_status: Awaiting Payment -> Payment Received', v_order_id, 'Payment Received');

    -- CHANGED_BY default: no APEX session in this script, so it must fall
    -- back to 'SYSTEM' (TASK-012 acceptance criteria).
    DECLARE
        v_changed_by  order_status_history.changed_by%TYPE;
    BEGIN
        pkg_order_status.change_status(p_order_id => v_order_id, p_new_status => 'Block Received');

        SELECT changed_by INTO v_changed_by
          FROM order_status_history
         WHERE order_id = v_order_id AND status = 'Block Received';

        report('change_status defaults CHANGED_BY to SYSTEM outside an APEX session',
               v_changed_by = 'SYSTEM', 'changed_by=' || v_changed_by);
    EXCEPTION
        WHEN OTHERS THEN
            report('change_status defaults CHANGED_BY to SYSTEM outside an APEX session', FALSE, SQLERRM);
    END;

    -- TASK-029: the transition just above (-> Block Received) must have
    -- sent exactly one MODULE_RECEIVED email to the customer, via
    -- on_status_changed -> pkg_notify.send_once.
    DECLARE
        v_email_count  PLS_INTEGER;
        v_recipient    email_log.recipient%TYPE;
    BEGIN
        SELECT COUNT(*) INTO v_email_count
          FROM email_log
         WHERE order_id = v_order_id AND email_type = 'MODULE_RECEIVED';

        SELECT recipient INTO v_recipient
          FROM email_log
         WHERE order_id = v_order_id AND email_type = 'MODULE_RECEIVED' AND ROWNUM = 1;

        report('change_status: -> Block Received sends exactly one MODULE_RECEIVED email to the customer',
               v_email_count = 1 AND v_recipient = 'test.customer@example.com',
               'count=' || v_email_count || ' recipient=' || v_recipient);
    EXCEPTION
        WHEN OTHERS THEN
            report('change_status: -> Block Received sends exactly one MODULE_RECEIVED email to the customer', FALSE, SQLERRM);
    END;

    -- Explicit p_changed_by override (e.g. how TASK-032's Stripe webhook
    -- handler will call this for a system-driven transition).
    DECLARE
        v_changed_by  order_status_history.changed_by%TYPE;
    BEGIN
        pkg_order_status.change_status(
            p_order_id   => v_order_id,
            p_new_status => 'In Progress',
            p_changed_by => 'WEBHOOK_TEST'
        );

        SELECT changed_by INTO v_changed_by
          FROM order_status_history
         WHERE order_id = v_order_id AND status = 'In Progress';

        report('change_status honors an explicit p_changed_by override',
               v_changed_by = 'WEBHOOK_TEST', 'changed_by=' || v_changed_by);
    EXCEPTION
        WHEN OTHERS THEN
            report('change_status honors an explicit p_changed_by override', FALSE, SQLERRM);
    END;

    -- TASK-029: set RETURN_TRACKING_NO the way TASK-037's admin page will
    -- when it moves an order to Ready / Shipped Back (a direct UPDATE --
    -- TRG_ORDERS_STATUS_GUARD only guards the STATUS column, not this one),
    -- so the SHIPPED_BACK email below has a real value to carry.
    UPDATE orders SET return_tracking_no = 'TEST-RETURN-TRACKING-029' WHERE order_id = v_order_id;

    expect_transition_ok('change_status: In Progress -> Ready / Shipped Back', v_order_id, 'Ready / Shipped Back');

    -- TASK-029: the transition just above must have sent exactly one
    -- SHIPPED_BACK email to the customer.
    DECLARE
        v_email_count  PLS_INTEGER;
        v_recipient    email_log.recipient%TYPE;
    BEGIN
        SELECT COUNT(*) INTO v_email_count
          FROM email_log
         WHERE order_id = v_order_id AND email_type = 'SHIPPED_BACK';

        SELECT recipient INTO v_recipient
          FROM email_log
         WHERE order_id = v_order_id AND email_type = 'SHIPPED_BACK' AND ROWNUM = 1;

        report('change_status: -> Ready / Shipped Back sends exactly one SHIPPED_BACK email to the customer',
               v_email_count = 1 AND v_recipient = 'test.customer@example.com',
               'count=' || v_email_count || ' recipient=' || v_recipient);
    EXCEPTION
        WHEN OTHERS THEN
            report('change_status: -> Ready / Shipped Back sends exactly one SHIPPED_BACK email to the customer', FALSE, SQLERRM);
    END;

    expect_transition_ok('change_status: Ready / Shipped Back -> Completed', v_order_id, 'Completed');

    -- Across the ENTIRE happy-path walk above (7 statuses, 6 transitions),
    -- only Awaiting Payment (TASK-031, PAYMENT_LINK -- IF the live Stripe
    -- call happened to succeed; not guaranteed in this session, see this
    -- file's header comment), Block Received (TASK-029, MODULE_RECEIVED)
    -- and Ready / Shipped Back (TASK-029, SHIPPED_BACK) can EVER have
    -- produced an EMAIL_LOG row -- Payment Received, In Progress and
    -- Completed must each be a hard no-op for this hook (TASK-029
    -- acceptance criteria: "No email for In Progress or any other status").
    -- So rather than asserting an exact total (which would depend on
    -- whether Stripe was actually reachable), this asserts every EMAIL_LOG
    -- row for the fixture order has one of exactly these three types, and
    -- MODULE_RECEIVED/SHIPPED_BACK's own "exactly one" checks above already
    -- pin those two down precisely.
    DECLARE
        v_unexpected_count  PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_unexpected_count
          FROM email_log
         WHERE order_id = v_order_id
           AND email_type NOT IN ('PAYMENT_LINK', 'MODULE_RECEIVED', 'SHIPPED_BACK');

        report('EMAIL_LOG has no row of any type other than PAYMENT_LINK/MODULE_RECEIVED/SHIPPED_BACK for the fixture order',
               v_unexpected_count = 0, 'unexpected_count=' || v_unexpected_count);
    EXCEPTION
        WHEN OTHERS THEN
            report('EMAIL_LOG has no row of any type other than PAYMENT_LINK/MODULE_RECEIVED/SHIPPED_BACK for the fixture order', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- Terminal status: no next status, and no further transition allowed
    ----------------------------------------------------------------------
    DECLARE
        v_next_count  PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_next_count
          FROM TABLE(pkg_order_status.get_next_statuses(v_order_id));

        report('get_next_statuses(Completed order) returns zero rows', v_next_count = 0);
    EXCEPTION
        WHEN OTHERS THEN
            report('get_next_statuses(Completed order) returns zero rows', FALSE, SQLERRM);
    END;

    expect_transition_rejected(
        'change_status rejects any transition out of the terminal Completed status',
        v_order_id, 'Pending Review', 'Completed'
    );

    ----------------------------------------------------------------------
    -- Unknown order id
    ----------------------------------------------------------------------
    DECLARE
        v_raised  BOOLEAN := FALSE;
    BEGIN
        BEGIN
            pkg_order_status.change_status(p_order_id => -999999, p_new_status => 'Awaiting Payment');
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
        END;
        report('change_status rejects an unknown order_id', v_raised);
    END;

    DECLARE
        v_next_count  PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_next_count
          FROM TABLE(pkg_order_status.get_next_statuses(-999999));

        report('get_next_statuses(unknown order_id) returns zero rows rather than raising', v_next_count = 0);
    EXCEPTION
        WHEN OTHERS THEN
            report('get_next_statuses(unknown order_id) returns zero rows rather than raising', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- Summary + cleanup
    ----------------------------------------------------------------------
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');
    DBMS_OUTPUT.PUT_LINE('TASK-012/TASK-029/TASK-031 pkg_order_status tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');

    ROLLBACK; -- discard every fixture row, status change and EMAIL_LOG row above.

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-012/TASK-029/TASK-031 pkg_order_status tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
