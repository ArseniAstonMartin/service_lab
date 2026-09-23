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
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count   PLS_INTEGER := 0;
    v_fail_count   PLS_INTEGER := 0;

    v_category_id  module_category.category_id%TYPE;
    v_vehicle_id   vehicle_ref.vehicle_id%TYPE;
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

    -- Direct INSERT with an initial status -- TRG_ORDERS_STATUS_GUARD does
    -- not fire on INSERT (only UPDATE OF status), matching how
    -- pkg_order.submit_order (TASK-015) will create orders.
    INSERT INTO orders (
        tracking_token, status, vehicle_id, category_id, part_number_entered,
        description, customer_name, customer_email, customer_phone,
        return_address_street, return_address_city, return_address_state, return_address_zip,
        idempotency_key
    ) VALUES (
        'TEST-TOKEN-012-' || DBMS_RANDOM.STRING('U', 20), 'Pending Review', v_vehicle_id, v_category_id, 'test-pn-012',
        'Test fixture order for TASK-012 pkg_order_status tests',
        'Test Customer', 'test.customer@example.com', '808-555-0100',
        '123 Test St', 'Honolulu', 'HI', '96813',
        'TEST-IDEMP-012-' || DBMS_RANDOM.STRING('U', 20)
    ) RETURNING order_id INTO v_order_id;

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

    expect_transition_ok('change_status: In Progress -> Ready / Shipped Back', v_order_id, 'Ready / Shipped Back');
    expect_transition_ok('change_status: Ready / Shipped Back -> Completed', v_order_id, 'Completed');

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
    DBMS_OUTPUT.PUT_LINE('TASK-012 pkg_order_status tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');

    ROLLBACK; -- discard every fixture row and status change above.

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-012 pkg_order_status tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
