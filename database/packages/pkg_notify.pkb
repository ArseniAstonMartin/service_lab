-- ============================================================================
-- pkg_notify.pkb
-- TASK-027: transactional-email infrastructure.
-- See pkg_notify.pks for the public contract and the required manual SMTP
-- relay / Email Template setup.
--
-- DEVIATION from the original design (live-verified 2026-09-24):
-- APEX_MAIL.SEND_TEMPLATED_EMAIL does not exist (PLS-00302, component must
-- be declared) -- there is no such procedure/function in APEX_MAIL. The
-- real template-email API, added in APEX 23.1, is an overload of
-- APEX_MAIL.SEND itself: p_template_static_id plus two PARALLEL
-- apex_t_varchar2 arrays (p_placeholder_names / p_placeholder_values), not
-- a single JSON blob. send() below still builds/merges placeholders as
-- JSON internally (JSON_MERGEPATCH, confirmed available) since that keeps
-- the public p_extra_placeholders contract callers (pkg_order, pkg_order_
-- status) already use unchanged, then converts the merged JSON object into
-- the two parallel arrays via JSON_OBJECT_T/JSON_KEY_LIST (native PL/SQL
-- JSON types, not privilege-gated) right before the APEX_MAIL.SEND call.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY pkg_notify AS

    c_public_app_id  CONSTANT VARCHAR2(10) := '92606'; -- f92606, Page 30 = public tracking (TASK-025)
    c_tracking_page   CONSTANT VARCHAR2(10) := '30';
    c_admin_app_id     CONSTANT VARCHAR2(10) := '94517'; -- f94517, Page 11 = admin order detail (TASK-028)
    c_admin_order_page  CONSTANT VARCHAR2(10) := '11';

    ----------------------------------------------------------------------------
    -- get_setting
    -- Small private helper -- no shared pkg_setting package exists yet, and
    -- introducing one is out of scope for this task; NULL (not an
    -- exception) for a missing key, since callers here already treat a NULL
    -- MAIL_FROM/ADMIN_EMAIL as "not configured yet" rather than a hard error.
    ----------------------------------------------------------------------------
    FUNCTION get_setting(p_key IN VARCHAR2) RETURN VARCHAR2 IS
        l_value app_setting.setting_value%TYPE;
    BEGIN
        SELECT setting_value INTO l_value FROM app_setting WHERE setting_key = p_key;
        RETURN l_value;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN NULL;
    END get_setting;

    ----------------------------------------------------------------------------
    -- default_placeholders
    ----------------------------------------------------------------------------
    FUNCTION default_placeholders(p_order_id IN NUMBER) RETURN CLOB IS
        l_json      CLOB;
        l_base_url  app_setting.setting_value%TYPE;
    BEGIN
        l_base_url := get_setting('APP_BASE_URL');

        SELECT JSON_OBJECT(
                   'ORDER_ID'       VALUE o.order_id,
                   'CUSTOMER_NAME'  VALUE o.customer_name,
                   'TRACKING_TOKEN' VALUE o.tracking_token,
                   'TRACKING_URL'   VALUE l_base_url || 'f?p=' || c_public_app_id || ':' || c_tracking_page
                                     || ':::::P' || c_tracking_page || '_TOKEN:' || o.tracking_token,
                   'ORDER_STATUS'   VALUE o.status
                   RETURNING CLOB)
          INTO l_json
          FROM orders o
         WHERE o.order_id = p_order_id;

        RETURN l_json;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20090,
                'pkg_notify.default_placeholders: ORDER_ID ' || p_order_id || ' does not exist.');
    END default_placeholders;

    ----------------------------------------------------------------------------
    -- admin_order_url
    ----------------------------------------------------------------------------
    FUNCTION admin_order_url(p_order_id IN NUMBER) RETURN VARCHAR2 IS
        l_base_url app_setting.setting_value%TYPE;
    BEGIN
        l_base_url := get_setting('APP_BASE_URL');

        RETURN l_base_url || 'f?p=' || c_admin_app_id || ':' || c_admin_order_page
               || ':::::P' || c_admin_order_page || '_ORDER_ID:' || p_order_id;
    END admin_order_url;

    ----------------------------------------------------------------------------
    -- already_sent
    ----------------------------------------------------------------------------
    FUNCTION already_sent(p_order_id IN NUMBER, p_email_type IN VARCHAR2) RETURN BOOLEAN IS
        l_count PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO l_count
          FROM email_log
         WHERE order_id = p_order_id AND email_type = p_email_type;

        RETURN l_count > 0;
    END already_sent;

    ----------------------------------------------------------------------------
    -- log_email
    -- Autonomous for the same reason pkg_stripe.log_error is: the email
    -- (if it made it to APEX_MAIL) is an irreversible side effect, so the
    -- EMAIL_LOG row recording it must survive even if the caller's own
    -- transaction rolls back afterward for a reason unrelated to the email
    -- itself -- otherwise EMAIL_LOG could show no record of a mail that was
    -- genuinely queued, breaking the exactly-once check callers rely on it
    -- for (see the table comment in database/ddl/030_config_and_logs.sql).
    ----------------------------------------------------------------------------
    PROCEDURE log_email(
        p_order_id   IN NUMBER,
        p_email_type IN VARCHAR2,
        p_recipient  IN VARCHAR2,
        p_result     IN VARCHAR2,
        p_error_text IN VARCHAR2 DEFAULT NULL
    ) IS
        PRAGMA AUTONOMOUS_TRANSACTION;
    BEGIN
        INSERT INTO email_log (order_id, email_type, recipient, result, error_text)
        VALUES (p_order_id, p_email_type, p_recipient, p_result, SUBSTR(p_error_text, 1, 4000));

        COMMIT;
    END log_email;

    ----------------------------------------------------------------------------
    -- send
    ----------------------------------------------------------------------------
    PROCEDURE send(
        p_order_id           IN NUMBER,
        p_email_type         IN VARCHAR2,
        p_extra_placeholders IN CLOB DEFAULT NULL,
        p_recipient_override IN VARCHAR2 DEFAULT NULL
    ) IS
        l_customer_email  orders.customer_email%TYPE;
        l_recipient       VARCHAR2(320);
        l_from            app_setting.setting_value%TYPE;
        l_placeholders    CLOB;
        l_mail_id         NUMBER;
    BEGIN
        IF p_email_type NOT IN ('ORDER_SUBMITTED', 'PAYMENT_LINK', 'MODULE_RECEIVED',
                                 'SHIPPED_BACK', 'ADMIN_NEW_ORDER') THEN
            RAISE_APPLICATION_ERROR(-20095,
                'pkg_notify.send: unknown EMAIL_TYPE ''' || p_email_type
                || ''' (must match a CK_EMAIL_LOG_TYPE value).');
        END IF;

        BEGIN
            SELECT customer_email INTO l_customer_email FROM orders WHERE order_id = p_order_id;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20090,
                    'pkg_notify.send: ORDER_ID ' || p_order_id || ' does not exist.');
        END;

        l_recipient := COALESCE(
            p_recipient_override,
            CASE WHEN p_email_type = 'ADMIN_NEW_ORDER' THEN get_setting('ADMIN_EMAIL') ELSE l_customer_email END
        );

        -- No recipient resolved (most likely: ADMIN_EMAIL not configured) --
        -- log it as a failure and return quietly, same as any other send
        -- failure: never raise, never block the caller's transaction.
        IF l_recipient IS NULL THEN
            log_email(p_order_id, p_email_type, '(none)', 'FAILED',
                'No recipient resolved -- ADMIN_EMAIL app_setting missing?');
            RETURN;
        END IF;

        l_from := get_setting('MAIL_FROM');

        l_placeholders := default_placeholders(p_order_id);
        IF p_extra_placeholders IS NOT NULL THEN
            SELECT JSON_MERGEPATCH(l_placeholders, p_extra_placeholders)
              INTO l_placeholders
              FROM dual;
        END IF;

        BEGIN
            -- Convert the merged JSON placeholders object into the parallel
            -- name/value arrays APEX_MAIL.SEND's template overload actually
            -- takes (see this file's header comment).
            DECLARE
                l_obj    JSON_OBJECT_T := JSON_OBJECT_T.parse(l_placeholders);
                l_keys   JSON_KEY_LIST := l_obj.get_keys;
                l_names  apex_t_varchar2 := apex_t_varchar2();
                l_values apex_t_varchar2 := apex_t_varchar2();
            BEGIN
                FOR i IN 1 .. l_keys.COUNT LOOP
                    l_names.EXTEND;
                    l_values.EXTEND;
                    l_names(l_names.COUNT)   := l_keys(i);
                    l_values(l_values.COUNT) := l_obj.get_String(l_keys(i));
                END LOOP;

                l_mail_id := APEX_MAIL.SEND(
                    p_template_static_id => p_email_type,
                    p_placeholder_names  => l_names,
                    p_placeholder_values => l_values,
                    p_to                 => l_recipient,
                    p_from               => l_from
                );
            END;

            log_email(p_order_id, p_email_type, l_recipient, 'SUCCESS');
        EXCEPTION
            WHEN OTHERS THEN
                log_email(p_order_id, p_email_type, l_recipient, 'FAILED', SQLERRM);
                -- Deliberately not re-raised -- see the header comment on
                -- send() in pkg_notify.pks.
        END;
    END send;

    ----------------------------------------------------------------------------
    -- send_once
    ----------------------------------------------------------------------------
    PROCEDURE send_once(
        p_order_id           IN NUMBER,
        p_email_type         IN VARCHAR2,
        p_extra_placeholders IN CLOB DEFAULT NULL,
        p_recipient_override IN VARCHAR2 DEFAULT NULL
    ) IS
    BEGIN
        IF NOT already_sent(p_order_id, p_email_type) THEN
            send(
                p_order_id           => p_order_id,
                p_email_type         => p_email_type,
                p_extra_placeholders => p_extra_placeholders,
                p_recipient_override => p_recipient_override
            );
        END IF;
    END send_once;

END pkg_notify;
/
