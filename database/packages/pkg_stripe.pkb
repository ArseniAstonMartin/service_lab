-- ============================================================================
-- pkg_stripe.pkb
-- TASK-030: create a Stripe Payment Link for an order and read it back.
-- TASK-031: create_payment_link now refuses an order not currently in
-- Awaiting Payment status. See pkg_stripe.pks for the public contract, the
-- required Web Credential setup, and design rationale.
-- TASK-032/033: added handle_event (Stripe webhook entry point) plus its
-- private helpers get_app_setting and verify_signature. See pks for the
-- full design writeup; the short version is: verify_signature fails closed
-- (returns FALSE) on anything it can't positively confirm -- missing
-- header, unconfigured secret, unparseable t=/v1= fields, bad HMAC, or a
-- stale timestamp -- and handle_event never writes to the database until
-- that check passes.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY pkg_stripe AS

    c_api_base                    CONSTANT VARCHAR2(100) := 'https://api.stripe.com/v1';
    c_credential_static_id        CONSTANT VARCHAR2(50)  := 'STRIPE_SECRET_KEY'; -- must match the Web Credential's Static ID (see pks)
    c_currency                    CONSTANT VARCHAR2(3)   := 'usd';
    c_webhook_secret_setting_key  CONSTANT VARCHAR2(50)  := 'STRIPE_WEBHOOK_SECRET'; -- APP_SETTING.SETTING_KEY (see pks header)
    c_timestamp_tolerance_seconds CONSTANT PLS_INTEGER   := 300; -- TASK-033: reject a Stripe-Signature t= older/newer than this many seconds

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

        -- APEX_WEB_SERVICE.MAKE_REST_REQUEST has no p_content_type parameter
        -- (live-confirmed 2026-09-24: PLS-00306, wrong number/types of
        -- arguments) -- the documented way to set a request header is via
        -- the APEX_WEB_SERVICE.g_request_headers array before the call.
        APEX_WEB_SERVICE.g_request_headers.DELETE;
        APEX_WEB_SERVICE.g_request_headers(1).name  := 'Content-Type';
        APEX_WEB_SERVICE.g_request_headers(1).value := 'application/x-www-form-urlencoded';

        l_response := APEX_WEB_SERVICE.MAKE_REST_REQUEST(
            p_url                  => c_api_base || '/payment_links',
            p_http_method          => 'POST',
            p_credential_static_id => c_credential_static_id,
            p_body                 => l_body
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

    ----------------------------------------------------------------------------
    -- get_app_setting
    -- TASK-033. Same shape as pkg_notify.get_setting -- returns NULL (never
    -- raises) for an unconfigured/missing key, so verify_signature can treat
    -- "no webhook secret set yet" as just another reason to fail closed.
    ----------------------------------------------------------------------------
    FUNCTION get_app_setting(p_key IN VARCHAR2) RETURN VARCHAR2 IS
        l_value app_setting.setting_value%TYPE;
    BEGIN
        SELECT setting_value INTO l_value FROM app_setting WHERE setting_key = p_key;
        RETURN l_value;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN NULL;
    END get_app_setting;

    ----------------------------------------------------------------------------
    -- sha256_raw (private)
    -- STANDARD_HASH cannot be called directly as a plain PL/SQL function --
    -- live-confirmed 2026-09-24: PLS-00201 "identifier 'STANDARD_HASH' must
    -- be declared". Like a handful of other SQL-only built-ins, it is only
    -- recognized inside an embedded SQL statement, so it must be invoked via
    -- SELECT ... INTO ... FROM DUAL. This wraps that so every other
    -- STANDARD_HASH use in this body stays a plain function call.
    ----------------------------------------------------------------------------
    FUNCTION sha256_raw(p_input IN RAW) RETURN RAW IS
        l_out RAW(32);
    BEGIN
        SELECT STANDARD_HASH(p_input, 'SHA256') INTO l_out FROM dual;
        RETURN l_out;
    END sha256_raw;

    ----------------------------------------------------------------------------
    -- hmac_sha256 (private)
    -- Hand-built HMAC-SHA256 (RFC 2104) using only STANDARD_HASH and
    -- UTL_RAW -- neither privilege-gated in this workspace, unlike
    -- DBMS_CRYPTO (see verify_signature's header comment for why this
    -- exists at all). Block size for SHA-256 is 64 bytes:
    --   K' = K, hashed down to 32 bytes if longer than 64, then
    --        zero-padded on the right to exactly 64 bytes if shorter
    --   ipad = K' XOR (0x36 repeated 64 times)
    --   opad = K' XOR (0x5c repeated 64 times)
    --   HMAC(K, m) = SHA256( opad || SHA256( ipad || m ) )
    ----------------------------------------------------------------------------
    FUNCTION hmac_sha256(p_key IN RAW, p_msg IN RAW) RETURN RAW IS
        c_block_size CONSTANT PLS_INTEGER := 64; -- SHA-256 HMAC block size, in bytes
        l_key        RAW(64);
        l_ipad_mask  RAW(64);
        l_opad_mask  RAW(64);
        l_ipad       RAW(64);
        l_opad       RAW(64);
        l_inner      RAW(32);
    BEGIN
        l_key := p_key;

        IF UTL_RAW.LENGTH(l_key) > c_block_size THEN
            l_key := sha256_raw(l_key); -- down to 32 bytes
        END IF;

        IF UTL_RAW.LENGTH(l_key) < c_block_size THEN
            l_key := UTL_RAW.CONCAT(
                l_key,
                UTL_RAW.COPIES(HEXTORAW('00'), c_block_size - UTL_RAW.LENGTH(l_key))
            );
        END IF;

        l_ipad_mask := UTL_RAW.COPIES(HEXTORAW('36'), c_block_size);
        l_opad_mask := UTL_RAW.COPIES(HEXTORAW('5C'), c_block_size);

        l_ipad := UTL_RAW.BIT_XOR(l_key, l_ipad_mask);
        l_opad := UTL_RAW.BIT_XOR(l_key, l_opad_mask);

        l_inner := sha256_raw(UTL_RAW.CONCAT(l_ipad, p_msg));

        RETURN sha256_raw(UTL_RAW.CONCAT(l_opad, l_inner));
    END hmac_sha256;

    ----------------------------------------------------------------------------
    -- verify_signature
    -- TASK-033. Verifies a Stripe-Signature header (format
    -- "t=<unix ts>,v1=<hex hmac>[,v0=...]") against p_payload, using
    -- APP_SETTING.STRIPE_WEBHOOK_SECRET as the HMAC key. Fails closed
    -- (returns FALSE) on any of: missing/unparseable header, unconfigured
    -- secret, non-numeric or out-of-tolerance timestamp, or a signature
    -- mismatch -- never raises, so handle_event can treat every failure
    -- mode identically (400, nothing written).
    --
    -- l_signed_payload is built as t || '.' || raw body and HMAC'd exactly
    -- as Stripe computes it. It's a VARCHAR2(32767) local variable rather
    -- than a table column, so it safely holds a full webhook payload (up to
    -- ~32K bytes) regardless of this database's MAX_STRING_SIZE setting,
    -- which only limits column widths, not local PL/SQL variables --
    -- comfortably larger than any realistic checkout.session.completed
    -- payload, so DBMS_LOB.SUBSTR here does not risk silently truncating a
    -- real payload before it's signed.
    --
    -- Deliberately simplified relative to a production-grade webhook
    -- verifier, both acceptable for this task's acceptance criteria: the
    -- hex comparison is a plain string comparison rather than
    -- constant-time (timing-attack resistance is not a stated requirement
    -- here), and only the first v1= value is checked (no support for
    -- Stripe's signing-secret rotation, where two v1= values can appear
    -- briefly during rollover).
    ----------------------------------------------------------------------------
    FUNCTION verify_signature(
        p_payload          IN CLOB,
        p_signature_header IN VARCHAR2
    ) RETURN BOOLEAN IS
        l_webhook_secret  VARCHAR2(200);
        l_timestamp_str   VARCHAR2(50);
        l_provided_sig    VARCHAR2(200);
        l_timestamp       PLS_INTEGER;
        l_now_epoch       PLS_INTEGER;
        l_signed_payload  VARCHAR2(32767);
        l_computed_sig    VARCHAR2(64);
    BEGIN
        IF p_signature_header IS NULL THEN
            RETURN FALSE;
        END IF;

        l_webhook_secret := get_app_setting(c_webhook_secret_setting_key);
        IF l_webhook_secret IS NULL THEN
            RETURN FALSE;
        END IF;

        l_timestamp_str := REGEXP_SUBSTR(p_signature_header, '(^|,)t=([^,]*)', 1, 1, NULL, 2);
        l_provided_sig   := REGEXP_SUBSTR(p_signature_header, '(^|,)v1=([^,]*)', 1, 1, NULL, 2);

        IF l_timestamp_str IS NULL OR l_provided_sig IS NULL THEN
            RETURN FALSE;
        END IF;

        BEGIN
            l_timestamp := TO_NUMBER(l_timestamp_str);
        EXCEPTION
            WHEN VALUE_ERROR THEN
                RETURN FALSE;
        END;

        l_now_epoch := ROUND((CAST((SYSTIMESTAMP AT TIME ZONE 'UTC') AS DATE) - DATE '1970-01-01') * 86400);

        IF ABS(l_now_epoch - l_timestamp) > c_timestamp_tolerance_seconds THEN
            RETURN FALSE;
        END IF;

        l_signed_payload := l_timestamp_str || '.' || DBMS_LOB.SUBSTR(p_payload, 32000, 1);

        -- DEVIATION from the original design (live-verified 2026-09-24):
        -- this workspace's schema has no EXECUTE privilege on DBMS_CRYPTO
        -- (see pkg_security.pkb's generate_tracking_token header comment
        -- for the same live-confirmed restriction), so DBMS_CRYPTO.MAC is
        -- replaced with a hand-built HMAC-SHA256 using only STANDARD_HASH
        -- (a native SQL function, SHA-256 digest = 32 bytes = the RFC 2104
        -- HMAC block size for this hash) and UTL_RAW (bitwise XOR/concat,
        -- not privilege-gated) -- the standard construction:
        --   HMAC(K, m) = H( (K' XOR opad) || H( (K' XOR ipad) || m ) )
        -- with K' = K, right-padded with zero bytes to the 64-byte SHA-256
        -- block size (or hashed down to 32 bytes first if longer than 64).
        l_computed_sig := LOWER(RAWTOHEX(hmac_sha256(
            p_key => UTL_I18N.STRING_TO_RAW(l_webhook_secret, 'AL32UTF8'),
            p_msg => UTL_I18N.STRING_TO_RAW(l_signed_payload, 'AL32UTF8')
        )));

        RETURN l_computed_sig = LOWER(l_provided_sig);
    EXCEPTION
        WHEN OTHERS THEN
            -- Fail closed on anything unexpected (e.g. a malformed secret) --
            -- never let a verification-time error be mistaken for a valid
            -- signature.
            RETURN FALSE;
    END verify_signature;

    ----------------------------------------------------------------------------
    -- handle_event
    -- TASK-032/033. See pks for the full design writeup.
    ----------------------------------------------------------------------------
    PROCEDURE handle_event(
        p_payload           IN  CLOB,
        p_signature_header  IN  VARCHAR2,
        p_status_code        OUT PLS_INTEGER,
        p_response_body        OUT VARCHAR2
    ) IS
        l_event_id       stripe_event.event_id%TYPE;
        l_event_type     stripe_event.event_type%TYPE;
        l_order_id       orders.order_id%TYPE;
        l_payment_status VARCHAR2(50);
    BEGIN
        IF p_payload IS NULL OR DBMS_LOB.GETLENGTH(p_payload) = 0 THEN
            p_status_code   := 400;
            p_response_body := 'Empty request body.';
            RETURN;
        END IF;

        -- TASK-033: signature verification gate. Nothing below this point
        -- runs, and nothing is written to the database, unless this passes.
        IF NOT verify_signature(p_payload, p_signature_header) THEN
            p_status_code   := 400;
            p_response_body := 'Invalid or missing Stripe-Signature.';
            RETURN;
        END IF;

        l_event_id   := JSON_VALUE(p_payload, '$.id');
        l_event_type := JSON_VALUE(p_payload, '$.type');

        IF l_event_id IS NULL THEN
            p_status_code   := 400;
            p_response_body := 'Malformed event: missing id.';
            RETURN;
        END IF;

        -- TASK-032: idempotent event recording. A retried/duplicate Stripe
        -- delivery (same event_id) hits STRIPE_EVENT's UNIQUE(event_id)
        -- constraint and is answered 200 without reprocessing.
        BEGIN
            INSERT INTO stripe_event (event_id, event_type, order_id, payload, processed)
            VALUES (l_event_id, l_event_type, NULL, p_payload, 'N');
        EXCEPTION
            WHEN DUP_VAL_ON_INDEX THEN
                p_status_code   := 200;
                p_response_body := 'Duplicate event, already recorded.';
                RETURN;
        END;

        -- TASK-032: only checkout.session.completed (a paid Payment Link)
        -- is acted on; every other event type is recorded above (for
        -- audit) but otherwise ignored.
        IF l_event_type != 'checkout.session.completed' THEN
            p_status_code   := 200;
            p_response_body := 'Event recorded; type not handled.';
            RETURN;
        END IF;

        l_order_id       := TO_NUMBER(JSON_VALUE(p_payload, '$.data.object.metadata.order_id'));
        l_payment_status := JSON_VALUE(p_payload, '$.data.object.payment_status');

        BEGIN
            IF l_order_id IS NULL THEN
                RAISE_APPLICATION_ERROR(-20095,
                    'pkg_stripe.handle_event: event ' || l_event_id
                    || ' has no data.object.metadata.order_id.');
            END IF;

            -- Record the resolved order_id on the event row now, even if
            -- the status-change step below fails -- STRIPE_EVENT.ORDER_ID
            -- is populated "once the handler looks it up" per its own
            -- column comment, independent of PROCESSED.
            UPDATE stripe_event SET order_id = l_order_id WHERE event_id = l_event_id;

            UPDATE orders SET stripe_payment_status = l_payment_status WHERE order_id = l_order_id;

            pkg_order_status.change_status(
                p_order_id    => l_order_id,
                p_new_status  => 'Payment Received',
                p_changed_by  => 'SYSTEM'
            );

            UPDATE stripe_event SET processed = 'Y' WHERE event_id = l_event_id;
        EXCEPTION
            WHEN OTHERS THEN
                -- TASK-032: any failure resolving the order or advancing
                -- its status is logged and swallowed here -- the event was
                -- validly received and durably recorded above, so the
                -- response is still 200 (STRIPE_EVENT.PROCESSED stays 'N'
                -- for manual follow-up); a non-2xx response would just make
                -- Stripe retry the same delivery forever for a problem
                -- retrying can't fix.
                log_error(
                    p_source   => 'PKG_STRIPE.HANDLE_EVENT',
                    p_message  => SQLERRM,
                    p_order_id => l_order_id,
                    p_context  => 'event_id=' || l_event_id || ' event_type=' || l_event_type
                );
        END;

        p_status_code   := 200;
        p_response_body := 'Event processed.';
    EXCEPTION
        WHEN OTHERS THEN
            -- Defense in depth: handle_event must never raise. Anything
            -- unanticipated (e.g. a malformed payload JSON_VALUE can't
            -- parse) falls through to here rather than propagating to the
            -- ORDS handler.
            log_error(
                p_source  => 'PKG_STRIPE.HANDLE_EVENT',
                p_message => SQLERRM,
                p_context => 'unexpected error in handle_event'
            );
            p_status_code   := 400;
            p_response_body := 'Malformed request.';
    END handle_event;

END pkg_stripe;
/
