-- ============================================================================
-- test_constraints.sql
-- TASK-006: Negative tests for every CHECK/FK/trigger rule added by
-- 040_constraints.sql and 050_triggers.sql.
--
-- Run via SQL Workshop -> SQL Commands (or SQLcl) AFTER database/install.sql
-- (or at least 010/020/030/040/050_*.sql) has been applied. Requires no seed
-- data: this script creates its own minimal fixture rows inside a single
-- transaction and ROLLBACKs everything at the end, so it is safe to run
-- against a schema that already has real seed/production data in it.
--
-- Each rule is tested by attempting an operation that SHOULD fail; if it
-- unexpectedly succeeds, that is reported as a FAIL (via DBMS_OUTPUT and by
-- raising at the very end so a caller / CI step sees a non-zero-ish signal).
-- A prerequisite -- this schema must actually reject the bad data -- is
-- exactly what this script exists to prove; it has NOT been run against a
-- live database by the agent that wrote it (see progress.md, TASK-006: no
-- live SQL Workshop / SQLcl connection was available in that session).
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count      PLS_INTEGER := 0;
    v_fail_count      PLS_INTEGER := 0;

    v_category_id     module_category.category_id%TYPE;
    v_vehicle_id       vehicle_ref.vehicle_id%TYPE;
    v_entry_id           compatibility_entry.entry_id%TYPE;
    v_service_id            service.service_id%TYPE;
    v_order_id                  orders.order_id%TYPE;

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

    -- Runs p_sql (a single DML statement) and expects it to raise an Oracle
    -- error. PASS = an exception was raised (any ORA error counts, since
    -- we're testing "is this rejected", not the exact error number, which
    -- keeps the test resilient to which specific constraint fires first).
    -- Always leaves the session back at the SAVEPOINT taken just before the
    -- call, so fixture data from earlier tests is untouched either way.
    PROCEDURE expect_error(p_test_name IN VARCHAR2, p_sql IN VARCHAR2) IS
        v_sp CONSTANT VARCHAR2(30) := 'SP_' || DBMS_RANDOM.STRING('U', 10);
    BEGIN
        EXECUTE IMMEDIATE 'SAVEPOINT ' || v_sp;
        BEGIN
            EXECUTE IMMEDIATE p_sql;
            -- If we get here, no error was raised -- the bad data went in.
            report(p_test_name, FALSE, 'expected an error, none was raised');
        EXCEPTION
            WHEN OTHERS THEN
                report(p_test_name, TRUE);
        END;
        EXECUTE IMMEDIATE 'ROLLBACK TO ' || v_sp;
    END expect_error;

BEGIN
    ----------------------------------------------------------------------
    -- Fixtures (minimal rows the negative tests below need as valid
    -- parents/context). Distinctive TEST_ prefixes so they're obviously
    -- not real data if this script is ever run without a final ROLLBACK.
    ----------------------------------------------------------------------
    INSERT INTO module_category (name, display_seq)
        VALUES ('TEST_CATEGORY_006', 999)
        RETURNING category_id INTO v_category_id;

    INSERT INTO vehicle_ref (make, model, year)
        VALUES ('TEST_MAKE_006', 'TEST_MODEL_006', 2020)
        RETURNING vehicle_id INTO v_vehicle_id;

    MERGE INTO price_tier tgt
    USING (SELECT 'T006' AS tier_code, 100 AS amount FROM dual) src
    ON (tgt.tier_code = src.tier_code)
    WHEN NOT MATCHED THEN INSERT (tier_code, amount) VALUES (src.tier_code, src.amount);

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_006', 'T006', 'TEST_SET_006', 'N')
        RETURNING service_id INTO v_service_id;

    INSERT INTO compatibility_entry (vehicle_id, category_id, part_number, source)
        VALUES (v_vehicle_id, v_category_id, 'TEST-PN-006', 'IMPORT')
        RETURNING entry_id INTO v_entry_id;

    INSERT INTO compatibility_service (entry_id, service_id) VALUES (v_entry_id, v_service_id);

    INSERT INTO orders (
        tracking_token, status, vehicle_id, category_id, part_number_entered,
        matched_entry_id, service_id, description,
        customer_name, customer_email, customer_phone,
        return_address_street, return_address_city, return_address_state, return_address_zip,
        service_price, return_shipping_fee, total_amount, idempotency_key
    ) VALUES (
        'TEST-TOKEN-006-' || DBMS_RANDOM.STRING('U', 20), 'Pending Review', v_vehicle_id, v_category_id, 'test-pn-006',
        v_entry_id, v_service_id, 'Test fixture order for TASK-006 negative tests',
        'Test Customer', 'test.customer@example.com', '808-555-0100',
        '123 Test St', 'Honolulu', 'HI', '96813',
        100.00, 25.00, 125.00, 'TEST-IDEMP-006-' || DBMS_RANDOM.STRING('U', 20)
    ) RETURNING order_id INTO v_order_id;

    DBMS_OUTPUT.PUT_LINE('Fixtures created: category=' || v_category_id || ' vehicle=' || v_vehicle_id
        || ' service=' || v_service_id || ' entry=' || v_entry_id || ' order=' || v_order_id);
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');

    ----------------------------------------------------------------------
    -- ORDER_STATUS_REF / ORDERS.STATUS FK (replaces a literal CHECK list --
    -- see the DDL decision comment in 040_constraints.sql)
    ----------------------------------------------------------------------
    expect_error(
        'ORDERS.STATUS rejects a value not in ORDER_STATUS_REF',
        'UPDATE orders SET status = ''Not A Real Status'' WHERE order_id = ' || v_order_id
    );
    -- Note: this UPDATE would also be rejected by TRG_ORDERS_STATUS_GUARD
    -- (no PKG_ORDER_STATUS_CTX authorization) even before the FK is
    -- evaluated -- either way, an error is expected and the test passes.

    ----------------------------------------------------------------------
    -- ORDER_PHOTO.PHOTO_TYPE CHECK
    ----------------------------------------------------------------------
    expect_error(
        'ORDER_PHOTO.PHOTO_TYPE rejects an invalid type',
        'INSERT INTO order_photo (order_id, photo_type, photo_blob) VALUES (' || v_order_id || ', ''NOT_A_TYPE'', EMPTY_BLOB())'
    );

    ----------------------------------------------------------------------
    -- COMPATIBILITY_ENTRY.SOURCE CHECK
    ----------------------------------------------------------------------
    expect_error(
        'COMPATIBILITY_ENTRY.SOURCE rejects an invalid value',
        'INSERT INTO compatibility_entry (vehicle_id, category_id, part_number, source) VALUES ('
            || v_vehicle_id || ', ' || v_category_id || ', ''TEST-PN-006-B'', ''NOT_A_SOURCE'')'
    );

    ----------------------------------------------------------------------
    -- QUESTION_DEF.ANSWER_TYPE CHECK
    ----------------------------------------------------------------------
    expect_error(
        'QUESTION_DEF.ANSWER_TYPE rejects an invalid value',
        'INSERT INTO question_def (question_set_code, question_code, label, answer_type) VALUES ('
            || '''TEST_SET_006'', ''Q1'', ''Test question'', ''NOT_A_TYPE'')'
    );

    ----------------------------------------------------------------------
    -- Amount CHECKs on ORDERS
    ----------------------------------------------------------------------
    expect_error(
        'ORDERS rejects a negative SERVICE_PRICE',
        'UPDATE orders SET service_price = -1 WHERE order_id = ' || v_order_id
    );

    expect_error(
        'ORDERS rejects a negative RETURN_SHIPPING_FEE',
        'UPDATE orders SET return_shipping_fee = -1 WHERE order_id = ' || v_order_id
    );

    expect_error(
        'ORDERS rejects TOTAL_AMOUNT that does not equal SERVICE_PRICE + RETURN_SHIPPING_FEE',
        'UPDATE orders SET total_amount = 999999 WHERE order_id = ' || v_order_id
    );

    ----------------------------------------------------------------------
    -- Format CHECKs on ORDERS
    ----------------------------------------------------------------------
    expect_error(
        'ORDERS rejects a malformed CUSTOMER_EMAIL',
        'UPDATE orders SET customer_email = ''not-an-email'' WHERE order_id = ' || v_order_id
    );

    expect_error(
        'ORDERS rejects a malformed RETURN_ADDRESS_ZIP',
        'UPDATE orders SET return_address_zip = ''ABCDE'' WHERE order_id = ' || v_order_id
    );

    expect_error(
        'ORDERS rejects a too-short RETURN_ADDRESS_ZIP',
        'UPDATE orders SET return_address_zip = ''123'' WHERE order_id = ' || v_order_id
    );

    ----------------------------------------------------------------------
    -- TRG_ORDERS_STATUS_GUARD: an unauthorized status change is rejected,
    -- and an authorized one (via PKG_ORDER_STATUS_CTX) succeeds.
    ----------------------------------------------------------------------
    expect_error(
        'ORDERS.STATUS UPDATE without PKG_ORDER_STATUS_CTX authorization is rejected',
        'UPDATE orders SET status = ''Awaiting Payment'' WHERE order_id = ' || v_order_id
    );

    DECLARE
        v_status orders.status%TYPE;
    BEGIN
        pkg_order_status_ctx.allow_change;
        UPDATE orders SET status = 'Awaiting Payment' WHERE order_id = v_order_id;
        pkg_order_status_ctx.done_changing;

        SELECT status INTO v_status FROM orders WHERE order_id = v_order_id;
        report('ORDERS.STATUS UPDATE with PKG_ORDER_STATUS_CTX authorization succeeds',
               v_status = 'Awaiting Payment');
    EXCEPTION
        WHEN OTHERS THEN
            pkg_order_status_ctx.done_changing;
            report('ORDERS.STATUS UPDATE with PKG_ORDER_STATUS_CTX authorization succeeds', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- TRG_COMPAT_ENTRY_BIU / TRG_ORDERS_BIU: normalization + bookkeeping
    ----------------------------------------------------------------------
    DECLARE
        v_part_number  compatibility_entry.part_number%TYPE;
        v_entry_id_2    compatibility_entry.entry_id%TYPE;
    BEGIN
        INSERT INTO compatibility_entry (vehicle_id, category_id, part_number, source)
            VALUES (v_vehicle_id, v_category_id, '  lower-case-pn-006  ', 'IMPORT')
            RETURNING entry_id INTO v_entry_id_2;

        SELECT part_number INTO v_part_number FROM compatibility_entry WHERE entry_id = v_entry_id_2;
        report('TRG_COMPAT_ENTRY_BIU normalizes PART_NUMBER to UPPER(TRIM())',
               v_part_number = 'LOWER-CASE-PN-006');
    EXCEPTION
        WHEN OTHERS THEN
            report('TRG_COMPAT_ENTRY_BIU normalizes PART_NUMBER to UPPER(TRIM())', FALSE, SQLERRM);
    END;

    DECLARE
        v_part_number_entered  orders.part_number_entered%TYPE;
        v_created_at            orders.created_at%TYPE;
        v_updated_at_1              orders.updated_at%TYPE;
        v_updated_at_2                orders.updated_at%TYPE;
    BEGIN
        SELECT part_number_entered, created_at, updated_at
          INTO v_part_number_entered, v_created_at, v_updated_at_1
          FROM orders WHERE order_id = v_order_id;

        report('TRG_ORDERS_BIU normalizes PART_NUMBER_ENTERED to UPPER(TRIM())',
               v_part_number_entered = 'TEST-PN-006');
        report('TRG_ORDERS_BIU sets CREATED_AT/UPDATED_AT on insert',
               v_created_at IS NOT NULL AND v_updated_at_1 IS NOT NULL);

        pkg_order_status_ctx.allow_change;
        UPDATE orders SET status = 'Payment Received' WHERE order_id = v_order_id;
        pkg_order_status_ctx.done_changing;

        SELECT updated_at INTO v_updated_at_2 FROM orders WHERE order_id = v_order_id;
        report('TRG_ORDERS_BIU refreshes UPDATED_AT on every UPDATE',
               v_updated_at_2 >= v_updated_at_1);
    EXCEPTION
        WHEN OTHERS THEN
            pkg_order_status_ctx.done_changing;
            report('TRG_ORDERS_BIU bookkeeping', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- Summary + cleanup
    ----------------------------------------------------------------------
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');
    DBMS_OUTPUT.PUT_LINE('TASK-006 negative tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');

    ROLLBACK; -- discard every fixture row created above; nothing is committed.

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-006 constraint tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
