-- ============================================================================
-- test_pkg_pricing.sql
-- TASK-014: Unit tests for pkg_pricing.
--
-- Run via SQL Workshop -> SQL Commands (or SQLcl) AFTER pkg_pricing has been
-- installed (which needs 010-060_*.sql, since it references SERVICE,
-- PRICE_TIER, APP_SETTING and ORDERS). Self-contained: creates its own
-- TEST_-prefixed fixture rows (not the TASK-008 seed data) and ROLLBACKs
-- everything at the end, so it is safe to run against a schema with real
-- data in it.
--
-- The RETURN_SHIPPING_FEE tests below deliberately mutate the real,
-- singleton APP_SETTING row (get_return_fee always reads that fixed key --
-- there is no TEST_-prefixed variant to use instead). This is done inside
-- a SAVEPOINT that is rolled back before the script continues, so every
-- other test in this script (and the schema outside this script) always
-- sees the original value; the final ROLLBACK is a second, redundant
-- safety net.
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count      PLS_INTEGER := 0;
    v_fail_count      PLS_INTEGER := 0;

    v_category_id     module_category.category_id%TYPE;
    v_vehicle_id      vehicle_ref.vehicle_id%TYPE;
    v_service_id      service.service_id%TYPE;
    v_order_id        orders.order_id%TYPE;
    v_return_fee      NUMBER;

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

    PROCEDURE expect_price(
        p_test_name      IN VARCHAR2,
        p_service_id     IN NUMBER,
        p_expected_price IN NUMBER
    ) IS
        v_actual NUMBER;
    BEGIN
        v_actual := pkg_pricing.get_service_price(p_service_id);
        report(p_test_name, v_actual = p_expected_price,
               'expected=' || p_expected_price || ' actual=' || NVL(TO_CHAR(v_actual), 'NULL'));
    EXCEPTION
        WHEN OTHERS THEN
            report(p_test_name, FALSE, SQLERRM);
    END expect_price;

    -- Small helper: does an error message mention a given ORA-2xxxx code.
    FUNCTION sqlcode_matches(p_message IN VARCHAR2, p_code IN NUMBER) RETURN BOOLEAN IS
    BEGIN
        RETURN p_message IS NOT NULL AND INSTR(p_message, TO_CHAR(p_code)) > 0;
    END sqlcode_matches;

    -- Asserts a call raises ORA-20070 (bad service_id, from
    -- get_service_price).
    PROCEDURE expect_service_error(p_test_name IN VARCHAR2, p_service_id IN NUMBER) IS
        v_dummy  NUMBER;
        v_raised BOOLEAN := FALSE;
        v_detail VARCHAR2(4000);
    BEGIN
        BEGIN
            v_dummy := pkg_pricing.get_service_price(p_service_id);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report(p_test_name, v_raised AND sqlcode_matches(v_detail, -20070), v_detail);
    EXCEPTION
        WHEN OTHERS THEN
            report(p_test_name, FALSE, SQLERRM);
    END expect_service_error;

BEGIN
    ----------------------------------------------------------------------
    -- Fixtures
    ----------------------------------------------------------------------
    INSERT INTO module_category (name, display_seq)
        VALUES ('TEST_CATEGORY_014', 999)
        RETURNING category_id INTO v_category_id;

    INSERT INTO vehicle_ref (make, model, year)
        VALUES ('TEST_MAKE_014', 'TEST_MODEL_014', 2022)
        RETURNING vehicle_id INTO v_vehicle_id;

    MERGE INTO price_tier tgt
    USING (SELECT 'T014' AS tier_code, 175.50 AS amount FROM dual) src
    ON (tgt.tier_code = src.tier_code)
    WHEN NOT MATCHED THEN INSERT (tier_code, amount) VALUES (src.tier_code, src.amount);

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_014', 'T014', 'TEST_SET_014', 'N')
        RETURNING service_id INTO v_service_id;

    INSERT INTO orders (
        tracking_token, status, vehicle_id, category_id, part_number_entered,
        description, customer_name, customer_email, customer_phone,
        return_address_street, return_address_city, return_address_state, return_address_zip,
        idempotency_key
    ) VALUES (
        'TEST-TOKEN-014-' || DBMS_RANDOM.STRING('U', 20), 'Pending Review', v_vehicle_id, v_category_id, 'test-pn-014',
        'Test fixture order for TASK-014 pkg_pricing tests',
        'Test Customer', 'test.customer@example.com', '808-555-0100',
        '123 Test St', 'Honolulu', 'HI', '96813',
        'TEST-IDEMP-014-' || DBMS_RANDOM.STRING('U', 20)
    ) RETURNING order_id INTO v_order_id;

    DBMS_OUTPUT.PUT_LINE('Fixtures created: category=' || v_category_id || ' vehicle=' || v_vehicle_id
        || ' service=' || v_service_id || ' order=' || v_order_id);
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');

    ----------------------------------------------------------------------
    -- get_service_price
    ----------------------------------------------------------------------
    expect_price('get_service_price returns PRICE_TIER.AMOUNT through SERVICE.PRICE_TIER',
        v_service_id, 175.50);

    expect_service_error('get_service_price raises for an unknown service_id', -999999);

    ----------------------------------------------------------------------
    -- get_return_fee (happy path: whatever the real APP_SETTING row holds
    -- right now -- not mutated by this block)
    ----------------------------------------------------------------------
    DECLARE
        v_setting_amount NUMBER;
    BEGIN
        v_return_fee := pkg_pricing.get_return_fee;

        SELECT TO_NUMBER(setting_value) INTO v_setting_amount
          FROM app_setting WHERE setting_key = 'RETURN_SHIPPING_FEE';

        report('get_return_fee matches APP_SETTING(''RETURN_SHIPPING_FEE'')',
               v_return_fee = v_setting_amount,
               'get_return_fee=' || v_return_fee || ' app_setting=' || v_setting_amount);
    EXCEPTION
        WHEN OTHERS THEN
            report('get_return_fee matches APP_SETTING(''RETURN_SHIPPING_FEE'')', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- calc_total = service price + return fee
    ----------------------------------------------------------------------
    DECLARE
        v_total NUMBER;
    BEGIN
        v_total := pkg_pricing.calc_total(v_service_id);
        report('calc_total returns service price + return fee',
               v_total = 175.50 + v_return_fee,
               'expected=' || (175.50 + v_return_fee) || ' actual=' || v_total);
    EXCEPTION
        WHEN OTHERS THEN
            report('calc_total returns service price + return fee', FALSE, SQLERRM);
    END;

    DECLARE
        v_dummy  NUMBER;
        v_raised BOOLEAN := FALSE;
    BEGIN
        BEGIN
            v_dummy := pkg_pricing.calc_total(-999999);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
        END;
        report('calc_total raises for an unknown service_id', v_raised);
    END;

    ----------------------------------------------------------------------
    -- price_order: snapshots ORDERS.SERVICE_PRICE / RETURN_SHIPPING_FEE /
    -- TOTAL_AMOUNT in one UPDATE
    ----------------------------------------------------------------------
    DECLARE
        v_service_price  orders.service_price%TYPE;
        v_fee            orders.return_shipping_fee%TYPE;
        v_total          orders.total_amount%TYPE;
    BEGIN
        pkg_pricing.price_order(p_order_id => v_order_id, p_service_id => v_service_id);

        SELECT service_price, return_shipping_fee, total_amount
          INTO v_service_price, v_fee, v_total
          FROM orders WHERE order_id = v_order_id;

        report('price_order snapshots SERVICE_PRICE/RETURN_SHIPPING_FEE/TOTAL_AMOUNT onto ORDERS',
               v_service_price = 175.50 AND v_fee = v_return_fee AND v_total = 175.50 + v_return_fee,
               'service_price=' || v_service_price || ' fee=' || v_fee || ' total=' || v_total);
    EXCEPTION
        WHEN OTHERS THEN
            report('price_order snapshots SERVICE_PRICE/RETURN_SHIPPING_FEE/TOTAL_AMOUNT onto ORDERS', FALSE, SQLERRM);
    END;

    DECLARE
        v_raised BOOLEAN := FALSE;
    BEGIN
        BEGIN
            pkg_pricing.price_order(p_order_id => -999999, p_service_id => v_service_id);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
        END;
        report('price_order rejects an unknown order_id', v_raised);
    END;

    -- Bad service_id on a real order: must raise, and must NOT leave the
    -- order partially priced (price_order resolves both amounts before
    -- touching ORDERS).
    DECLARE
        v_raised          BOOLEAN := FALSE;
        v_price_before    orders.service_price%TYPE;
        v_price_after     orders.service_price%TYPE;
    BEGIN
        SELECT service_price INTO v_price_before FROM orders WHERE order_id = v_order_id;

        BEGIN
            pkg_pricing.price_order(p_order_id => v_order_id, p_service_id => -999999);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
        END;

        SELECT service_price INTO v_price_after FROM orders WHERE order_id = v_order_id;

        report('price_order with a bad service_id raises and leaves ORDERS untouched',
               v_raised AND v_price_after = v_price_before,
               'before=' || v_price_before || ' after=' || v_price_after);
    END;

    ----------------------------------------------------------------------
    -- get_return_fee error paths -- mutate the real APP_SETTING row inside
    -- a SAVEPOINT, restore it immediately after.
    ----------------------------------------------------------------------
    SAVEPOINT sp_before_setting_mutation;

    -- Guarantee a row exists (in case seed/010_reference_data.sql was
    -- never run), so the "invalid value" test below has something to
    -- corrupt.
    MERGE INTO app_setting tgt
    USING (SELECT 'RETURN_SHIPPING_FEE' AS setting_key, '25.00' AS setting_value FROM dual) src
    ON (tgt.setting_key = src.setting_key)
    WHEN NOT MATCHED THEN INSERT (setting_key, setting_value) VALUES (src.setting_key, src.setting_value);

    UPDATE app_setting SET setting_value = 'NOT-A-NUMBER' WHERE setting_key = 'RETURN_SHIPPING_FEE';

    DECLARE
        v_dummy  NUMBER;
        v_raised BOOLEAN := FALSE;
    BEGIN
        BEGIN
            v_dummy := pkg_pricing.get_return_fee;
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
        END;
        report('get_return_fee raises when APP_SETTING.RETURN_SHIPPING_FEE is not a number', v_raised);
    END;

    DELETE FROM app_setting WHERE setting_key = 'RETURN_SHIPPING_FEE';

    DECLARE
        v_dummy  NUMBER;
        v_raised BOOLEAN := FALSE;
    BEGIN
        BEGIN
            v_dummy := pkg_pricing.get_return_fee;
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
        END;
        report('get_return_fee raises when APP_SETTING has no RETURN_SHIPPING_FEE row', v_raised);
    END;

    ROLLBACK TO SAVEPOINT sp_before_setting_mutation; -- restore the real setting row untouched

    DECLARE
        v_after NUMBER;
    BEGIN
        v_after := pkg_pricing.get_return_fee;
        report('APP_SETTING.RETURN_SHIPPING_FEE is restored after the error-path tests',
               v_after = v_return_fee, 'expected=' || v_return_fee || ' actual=' || v_after);
    EXCEPTION
        WHEN OTHERS THEN
            report('APP_SETTING.RETURN_SHIPPING_FEE is restored after the error-path tests', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- Summary + cleanup
    ----------------------------------------------------------------------
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');
    DBMS_OUTPUT.PUT_LINE('TASK-014 pkg_pricing tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');

    ROLLBACK; -- discard every fixture row and price snapshot above.

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-014 pkg_pricing tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
