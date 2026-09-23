-- ============================================================================
-- pkg_pricing.pkb
-- TASK-014: server-side calculation of service price, return shipping fee
-- and order total. See pkg_pricing.pks for the public contract and design
-- rationale.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY pkg_pricing AS

    ----------------------------------------------------------------------------
    -- get_service_price
    ----------------------------------------------------------------------------
    FUNCTION get_service_price(p_service_id IN NUMBER) RETURN NUMBER IS
        l_amount price_tier.amount%TYPE;
    BEGIN
        SELECT pt.amount
          INTO l_amount
          FROM service sv
          JOIN price_tier pt ON pt.tier_code = sv.price_tier
         WHERE sv.service_id = p_service_id;

        RETURN l_amount;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20070, 'pkg_pricing.get_service_price: no such SERVICE_ID ' || p_service_id || '.');
    END get_service_price;

    ----------------------------------------------------------------------------
    -- get_return_fee
    ----------------------------------------------------------------------------
    FUNCTION get_return_fee RETURN NUMBER IS
        l_raw_value  app_setting.setting_value%TYPE;
    BEGIN
        SELECT setting_value
          INTO l_raw_value
          FROM app_setting
         WHERE setting_key = 'RETURN_SHIPPING_FEE';

        RETURN TO_NUMBER(l_raw_value);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20071, 'pkg_pricing.get_return_fee: APP_SETTING has no RETURN_SHIPPING_FEE row.');
        WHEN VALUE_ERROR THEN
            RAISE_APPLICATION_ERROR(-20071, 'pkg_pricing.get_return_fee: APP_SETTING.RETURN_SHIPPING_FEE is not a valid number (' || l_raw_value || ').');
    END get_return_fee;

    ----------------------------------------------------------------------------
    -- calc_total
    ----------------------------------------------------------------------------
    FUNCTION calc_total(p_service_id IN NUMBER) RETURN NUMBER IS
    BEGIN
        RETURN get_service_price(p_service_id) + get_return_fee;
    END calc_total;

    ----------------------------------------------------------------------------
    -- price_order
    ----------------------------------------------------------------------------
    PROCEDURE price_order(
        p_order_id   IN NUMBER,
        p_service_id IN NUMBER
    ) IS
        l_service_price  NUMBER;
        l_return_fee     NUMBER;
        l_rows_updated   PLS_INTEGER;
    BEGIN
        -- Resolve both amounts before touching ORDERS, so a bad
        -- p_service_id or a broken APP_SETTING row never leaves ORDERS
        -- partially priced.
        l_service_price := get_service_price(p_service_id);
        l_return_fee    := get_return_fee;

        UPDATE orders
           SET service_price       = l_service_price,
               return_shipping_fee = l_return_fee,
               total_amount        = l_service_price + l_return_fee,
               updated_at          = SYSTIMESTAMP
         WHERE order_id = p_order_id;

        l_rows_updated := SQL%ROWCOUNT;

        IF l_rows_updated = 0 THEN
            RAISE_APPLICATION_ERROR(-20072, 'pkg_pricing.price_order: no such ORDER_ID ' || p_order_id || '.');
        END IF;
    END price_order;

END pkg_pricing;
/
