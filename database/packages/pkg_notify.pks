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
--      APEX_MAIL.SEND's p_template_static_id, so the Static ID must match
--      one of those five strings exactly (case-sensitive). This is App
--      Builder-only work (per this
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
    -- APEX_MAIL.SEND (its template overload, APEX 23.1+) against the Email Template whose
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
    -- Does NOT itself check "already sent" / enforce exactly-once -- that
    -- guarantee is send_once's job (below). send() is deliberately just
    -- "send this one, right now, and log it"; most callers should use
    -- send_once instead unless they specifically want an unconditional
    -- (re)send.
    -- ------------------------------------------------------------------------
    PROCEDURE send(
        p_order_id           IN NUMBER,
        p_email_type         IN VARCHAR2,
        p_extra_placeholders IN CLOB DEFAULT NULL,
        p_recipient_override IN VARCHAR2 DEFAULT NULL
    );

    -- ------------------------------------------------------------------------
    -- already_sent
    -- TRUE if EMAIL_LOG already has a row for this (p_order_id,
    -- p_email_type) pair, regardless of whether that attempt's RESULT was
    -- SUCCESS or FAILED -- "exactly once" here means "attempted once", not
    -- "delivered once": a FAILED row still represents a real APEX_MAIL call
    -- that was made, and silently retrying it on every subsequent call
    -- (e.g. every idempotent pkg_order.submit_order replay) would defeat
    -- the "once" guarantee just as surely as sending twice would. A caller
    -- that specifically wants to retry a FAILED send does so explicitly via
    -- send(), not send_once().
    -- ------------------------------------------------------------------------
    FUNCTION already_sent(p_order_id IN NUMBER, p_email_type IN VARCHAR2) RETURN BOOLEAN;

    -- ------------------------------------------------------------------------
    -- send_once
    -- send(), guarded by already_sent -- a no-op if EMAIL_LOG already has a
    -- row for this (p_order_id, p_email_type). This is what every trigger
    -- point (TASK-028/029/031) should call instead of send() directly, so
    -- "each email is sent exactly once per order" (each of those tasks' own
    -- acceptance criteria) holds automatically even when the caller itself
    -- might run more than once for the same order -- e.g.
    -- pkg_order.submit_order's idempotent-replay branch, or an admin
    -- retrying a status change.
    -- ------------------------------------------------------------------------
    PROCEDURE send_once(
        p_order_id           IN NUMBER,
        p_email_type         IN VARCHAR2,
        p_extra_placeholders IN CLOB DEFAULT NULL,
        p_recipient_override IN VARCHAR2 DEFAULT NULL
    );

    -- ------------------------------------------------------------------------
    -- admin_order_url
    -- Builds the f94517 (admin) Page 11 order-detail link for p_order_id --
    -- e.g. for the ADMIN_NEW_ORDER email's #ADMIN_ORDER_URL# placeholder
    -- (TASK-028). A sibling to default_placeholders' own #TRACKING_URL#
    -- construction, just pointed at the admin app instead of the public
    -- one -- kept here, rather than duplicated in every admin-facing
    -- caller, since this package already owns APP_BASE_URL/app-link logic.
    -- ------------------------------------------------------------------------
    FUNCTION admin_order_url(p_order_id IN NUMBER) RETURN VARCHAR2;

END pkg_notify;
/
