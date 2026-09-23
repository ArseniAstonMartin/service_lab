-- ============================================================================
-- pkg_stripe.pkb
-- TASK-030: create a Stripe Payment Link for an order and read it back.
-- TASK-031: create_payment_link now refuses an order not currently in
-- Awaiting Payment status. See pkg_stripe.pks for the public contract, the
-- required Web Credential setup, and design rationale.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY pkg_stripe AS

    c_api_base              CONSTANT VARCHAR2(100) := 'https://api.stripe.com/v1';
    c_credential_static_id  CONSTANT VARCHAR2(50)  := 'STRIPE_SECRET_KEY'; -- must match the Web Credential's Static ID (see pks)
    c_currency              CONSTANT VARCHAR2(3)   := 'usd';

    ----------------------------------------------------------------------------
    -- log_error
    -- Autonomous so an APP_ERROR_LOG row survives even when the caller
    -- rolls back after the exception this package raises right after
    -- calling it -- an error log that disappears along with the failed
    -- transaction it was meant to explain would defeat its own purpose.
    -- Every other package in this schema (pkg_order, pkg_order_status, ...)
    -- deliberately avoids autonomous transactions so an error rolls back
    -- everything; this is the one place that specific pattern is wrong, and
    -- the one place TASK-030's acceptance criteria explicitly asks for a
    -- durable log.
    ----------------------------------------------------------------------------
    PROCEDURE log_error(
        p_source   IN VARCHAR2,
        p_message  IN VARCHAR2,
        p_order_id IN NUMBER DEFAULT NULL,
        p_context  IN VARCHAR2 DEFAULT NULL
    ) IS
        PRAGMA AUTONOMOUS_TRANSACTION;
    BEGIN
        INSERT INTO app_error_log (error_source, error_message, order_id, context_info)
        VALUES (p_source, SUBSTR(p_message, 1, 4000), p_order_id, SUBSTR(p_context, 1, 4000));

        COMMIT;
    END log_error;

    ----------------------------------------------------------------------------
    -- fetch_payment_link
    -- Shared GET /v1/payment_links/{id} call used by both
    -- create_payment_link's idempotent branch (re-reading the URL of an
    -- already-created link) and get_payment_link_status. Returns the raw
    -- JSON response body; raises -20092 (after logging) on a non-2xx
    -- response.
    ----------------------------------------------------------------------------
    FUNCTION fetch_payment_link(
        p_link_id  IN VARCHAR2,
        p_order_id IN NUMBER,
        p_caller   IN VARCHAR2
    ) RETURN CLOB IS
        l_response      CLOB;
        l_status_code   PLS_INTEGER;
        l_error_message VARCHAR2(4000);
    BEGIN
        l_response := APEX_WEB_SERVICE.MAKE_REST_REQUEST(
            p_url                  => c_api_base || '/payment_links/' || UTL_URL.ESCAPE(p_link_id, TRUE),
            p_http_method          => 'GET',
            p_credential_static_id => c_credential_static_id
        );
        l_status_code := APEX_WEB_SERVICE.g_status_code;

        IF l_status_code NOT BETWEEN 200 AND 299 THEN
            l_error_message := NVL(JSON_VALUE(l_response, '$.error.message'), 'HTTP ' || l_status_code);
            log_error(
                p_source   => p_caller,
                p_message  => l_error_message,
                p_order_id => p_order_id,
                p_context  => 'HTTP ' || l_status_code || ' from GET /v1/payment_links/' || p_link_id
            );
            RAISE_APPLICATION_ERROR(-20092,
                p_caller || ': Stripe API error for ORDER_ID ' || p_order_id || ': ' || l_error_message);
        END IF;

        RETURN l_response;
    END fetch_payment_link;

    ----------------------------------------------------------------------------
    -- create_payment_link
    ----------------------------------------------------------------------------
    FUNCTION create_payment_link(p_order_id IN NUMBER) RETURN VARCHAR2 IS
        l_status             orders.status%TYPE;
        l_service_name       service.name%TYPE;
        l_service_price      orders.service_price%TYPE;
        l_return_fee         orders.return_shipping_fee%TYPE;
        l_existing_link_id   orders.stripe_payment_link_id%TYPE;
        l_body               VARCHAR2(4000);
        l_response           CLOB;
        l_status_code        PLS_INTEGER;
        l_error_message      VARCHAR2(4000);
        l_link_id            VARCHAR2(100);
        l_link_url           VARCHAR2(500);
    BEGIN
        BEGIN
            SELECT o.status, o.service_price, o.return_shipping_fee, o.stripe_payment_link_id, sv.name
              INTO l_status, l_service_price, l_return_fee, l_existing_link_id, l_service_name
              FROM orders o
              JOIN service sv ON sv.service_id = o.service_id
             WHERE o.order_id = p_order_id;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20090,
                    'pkg_stripe.create_payment_link: ORDER_ID ' || p_order_id
                    || ' does not exist, or has no SERVICE_ID set yet.');
        END;

        IF l_service_price IS NULL OR l_return_fee IS NULL THEN
            RAISE_APPLICATION_ERROR(-20091,
                'pkg_stripe.create_payment_link: ORDER_ID ' || p_order_id
                || ' has not been priced yet (pkg_pricing.price_order must run first).');
        END IF;

        -- TASK-031 acceptance criteria: refuse an order in any status other
        -- than Awaiting Payment -- checked before the idempotent branch
        -- below, so a call for an order that has since moved on (e.g. paid
        -- already, now Payment Received or later) is refused rather than
        -- quietly handing back the old link's URL again. Checked after the
        -- priced check above (existence -> priced -> status -> idempotent)
        -- so an order that is both unpriced AND not Awaiting Payment still
        -- gets the more specific -20091 ("not priced yet") rather than the
        -- more generic -20096 -- matching how a not-yet-reviewed order
        -- (Pending Review, unpriced) should be diagnosed.
        IF l_status != 'Awaiting Payment' THEN
            RAISE_APPLICATION_ERROR(-20096,
                'pkg_stripe.create_payment_link: ORDER_ID ' || p_order_id
                || ' is not in Awaiting Payment status (currently "' || l_status
                || '") -- a payment link can only be created for an order awaiting payment.');
        END IF;

        -- Idempotent: don't create a second link for an order that already
        -- has one -- re-fetch and return the existing link's current URL.
        IF l_existing_link_id IS NOT NULL THEN
            RETURN JSON_VALUE(
                fetch_payment_link(l_existing_link_id, p_order_id, 'PKG_STRIPE.CREATE_PAYMENT_LINK'),
                '$.url'
            );
        END IF;

        l_body :=
               'line_items[0][price_data][currency]=' || c_currency
            || '&line_items[0][price_data][product_data][name]=' || UTL_URL.ESCAPE(l_service_name, TRUE)
            || '&line_items[0][price_data][unit_amount]=' || TO_CHAR(ROUND(l_service_price * 100))
            || '&line_items[0][quantity]=1'
            || '&line_items[1][price_data][currency]=' || c_currency
            || '&line_items[1][price_data][product_data][name]=' || UTL_URL.ESCAPE('Return Shipping', TRUE)
            || '&line_items[1][price_data][unit_amount]=' || TO_CHAR(ROUND(l_return_fee * 100))
            || '&line_items[1][quantity]=1'
            || '&metadata[order_id]=' || TO_CHAR(p_order_id);

        l_response := APEX_WEB_SERVICE.MAKE_REST_REQUEST(
            p_url                  => c_api_base || '/payment_links',
            p_http_method          => 'POST',
            p_credential_static_id => c_credential_static_id,
            p_body                 => l_body,
            p_content_type         => 'application/x-www-form-urlencoded'
        );
        l_status_code := APEX_WEB_SERVICE.g_status_code;

        IF l_status_code NOT BETWEEN 200 AND 299 THEN
            l_error_message := NVL(JSON_VALUE(l_response, '$.error.message'), 'HTTP ' || l_status_code);
            log_error(
                p_source   => 'PKG_STRIPE.CREATE_PAYMENT_LINK',
                p_message  => l_error_message,
                p_order_id => p_order_id,
                p_context  => 'HTTP ' || l_status_code || ' from POST /v1/payment_links'
            );
            RAISE_APPLICATION_ERROR(-20092,
                'pkg_stripe.create_payment_link: Stripe API error for ORDER_ID ' || p_order_id
                || ': ' || l_error_message);
        END IF;

        l_link_id  := JSON_VALUE(l_response, '$.id');
        l_link_url := JSON_VALUE(l_response, '$.url');

        IF l_link_id IS NULL OR l_link_url IS NULL THEN
            log_error(
                p_source   => 'PKG_STRIPE.CREATE_PAYMENT_LINK',
                p_message  => 'Stripe returned a 2xx response with no id/url',
                p_order_id => p_order_id,
                p_context  => DBMS_LOB.SUBSTR(l_response, 4000, 1)
            );
            RAISE_APPLICATION_ERROR(-20093,
                'pkg_stripe.create_payment_link: Stripe returned an unexpected response for ORDER_ID '
                || p_order_id || '.');
        END IF;

        UPDATE orders SET stripe_payment_link_id = l_link_id WHERE order_id = p_order_id;

        RETURN l_link_url;
    END create_payment_link;

    ----------------------------------------------------------------------------
    -- get_payment_link_status
    ----------------------------------------------------------------------------
    FUNCTION get_payment_link_status(p_order_id IN NUMBER) RETURN VARCHAR2 IS
        l_link_id  orders.stripe_payment_link_id%TYPE;
        l_response CLOB;
    BEGIN
        BEGIN
            SELECT stripe_payment_link_id INTO l_link_id FROM orders WHERE order_id = p_order_id;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20090,
                    'pkg_stripe.get_payment_link_status: ORDER_ID ' || p_order_id || ' does not exist.');
        END;

        IF l_link_id IS NULL THEN
            RAISE_APPLICATION_ERROR(-20094,
                'pkg_stripe.get_payment_link_status: ORDER_ID ' || p_order_id || ' has no payment link yet.');
        END IF;

        l_response := fetch_payment_link(l_link_id, p_order_id, 'PKG_STRIPE.GET_PAYMENT_LINK_STATUS');

        RETURN CASE WHEN JSON_VALUE(l_response, '$.active') = 'true' THEN 'ACTIVE' ELSE 'INACTIVE' END;
    END get_payment_link_status;

END pkg_stripe;
/
