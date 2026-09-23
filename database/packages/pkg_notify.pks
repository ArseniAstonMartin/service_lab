-- ============================================================================
-- pkg_notify.pks
-- TASK-027: transactional-email infrastructure (PRD section 9's 5 triggers).
--
-- Manual prerequisites (none of this is possible from plain SQL, which is
-- exactly why this task's own acceptance criteria list them separately from
-- the PL/SQL deliverable):
--   1. SMTP relay (OCI Email Delivery, SendGrid, or Mailgun) configured at
--      instance or workspace level (App Builder -> Workspace Utilities, or
--      Instance Administration for an instance-level relay). This session
--      has no live App Builder access, so it cannot be done here -- see
--      pkg_notify.pkb's header for the same note repeated where it matters
--      operationally.
--   2. The sender address in APP_SETTING.MAIL_FROM approved with that SMTP
--      provider (Approved Sender, or SPF/DKIM records on the sending
--      domain) -- otherwise every send() call below will queue successfully
--      but never actually deliver.
--   3. Five Email Templates created in f94517 Shared Components -> Email
--      Templates, each with its Static ID set EXACTLY to one of the
--      EMAIL_LOG.EMAIL_TYPE values already fixed by CK_EMAIL_LOG_TYPE
--      (database/ddl/040_constraints.sql):
--        ORDER_SUBMITTED, PAYMENT_LINK, MODULE_RECEIVED, SHIPPED_BACK,
--        ADMIN_NEW_ORDER
--      pkg_notify.send passes p_email_type straight through as
--      APEX_WEB_SERVICE... no -- as APEX_MAIL.SEND_TEMPLATED_EMAIL's
--      p_static_id, so the Static ID must match one of those five strings
--      exactly (case-sensitive). This is App Builder-only work (per this
--      project's "never hand-edit apex/f*.sql" rule) and needs a live
--      session -- see TASK-028/029/031 for what each template's own subject/
--      body and #PLACEHOLDER# markup should say.
--
-- Every template can rely on five placeholders pkg_notify.default_placeholders
-- always supplies: #ORDER_ID#, #CUSTOMER_NAME#, #TRACKING_TOKEN#,
-- #TRACKING_URL# (the public f92606 Page 30 tracking link), #ORDER_STATUS#.
-- The caller of send() (TASK-028/029/031, one per trigger) supplies whatever
-- else that specific template needs (e.g. #PAYMENT_URL# for PAYMENT_LINK,
-- #RETURN_TRACKING_NO# for SHIPPED_BACK) via p_extra_placeholders, a JSON
-- object CLOB merged on top of the defaults (JSON_MERGEPATCH -- its own keys
-- win on conflict).
-- ============================================================================
CREATE OR REPLACE PACKAGE pkg_notify AUTHID DEFINER AS

    -- ------------------------------------------------------------------------
    -- default_placeholders
    -- Builds the JSON object of the five placeholders every template can
    -- rely on (see header) for p_order_id, as a CLOB ready to pass to
    -- send()'s p_extra_placeholders (or to JSON_MERGEPATCH with a caller's
    -- own extra fields before calling send -- send() does this same merge
    -- internally, so most callers never need to call this directly; it is
    -- exposed for previewing/testing what a template would receive).
    -- Raises -20090 if p_order_id does not exist.
    -- ------------------------------------------------------------------------
    FUNCTION default_placeholders(p_order_id IN NUMBER) RETURN CLOB;

    -- ------------------------------------------------------------------------
    -- send
    -- Sends one of the 5 transactional emails for p_order_id via
    -- APEX_MAIL.SEND_TEMPLATED_EMAIL against the Email Template whose
    -- Static ID equals p_email_type, and writes exactly one EMAIL_LOG row
    -- (SUCCESS or FAILED) regardless of outcome.
    --
    -- p_extra_placeholders: an optional JSON object CLOB (e.g.
    -- '{"PAYMENT_URL":"https://...","AMOUNT":"245.00"}') merged over
    -- default_placeholders(p_order_id) -- its keys win on conflict. NULL is
    -- fine for a template that only needs the five defaults.
    --
    -- p_recipient_override: NULL sends to ORDERS.CUSTOMER_EMAIL, except for
    -- ADMIN_NEW_ORDER which defaults to APP_SETTING.ADMIN_EMAIL. Pass a
    -- value here to send somewhere else instead (mainly for testing).
    --
    -- Deliberately never raises for a mail/template/SMTP failure -- only
    -- for a programming error (unknown p_order_id: -20090, unknown
    -- p_email_type: -20095). Any failure from APEX_MAIL itself is caught,
    -- written to EMAIL_LOG as FAILED with the error text, and swallowed, so
    -- the business transaction that triggered the email (order submission,
    -- a status change, ...) is never rolled back by an email delivery
    -- problem -- this is this task's own acceptance criterion, not a
    -- shortcut. The EMAIL_LOG write itself is autonomous (survives even if
    -- the caller's own transaction later rolls back for an unrelated
    -- reason), since an email that was actually queued/sent is an
    -- irreversible side effect that the log must keep recording regardless.
    --
    -- Does NOT itself check "already sent" / enforce exactly-once --
    -- EMAIL_LOG's own comment says that guarantee is the CALLER's job
    -- (pkg_order / pkg_order_status query EMAIL_LOG before invoking send).
    -- send() is deliberately just "send this one, right now, and log it".
    -- ------------------------------------------------------------------------
    PROCEDURE send(
        p_order_id           IN NUMBER,
        p_email_type         IN VARCHAR2,
        p_extra_placeholders IN CLOB DEFAULT NULL,
        p_recipient_override IN VARCHAR2 DEFAULT NULL
    );

END pkg_notify;
/
