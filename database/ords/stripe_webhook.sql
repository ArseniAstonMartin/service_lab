-- ============================================================================
-- database/ords/stripe_webhook.sql
-- TASK-032/033. Registers the public ORDS endpoint Stripe posts webhook
-- events to. All of the actual logic (signature verification, idempotent
-- recording, event processing) lives in pkg_stripe.handle_event -- this
-- module is a thin adapter: read the raw body and the Stripe-Signature
-- header off the HTTP request, hand them to handle_event, and translate its
-- OUT parameters into an HTTP response.
--
-- Resulting public URL (once this workspace's ORDS REST base path is
-- known): https://<ords-base>/wksp_hawaiiautomotive/stripe/webhook -- this
-- is the URL to register in the Stripe Dashboard (Developers -> Webhooks
-- -> Add endpoint) for the checkout.session.completed event, and is also
-- the trigger for setting the real APP_SETTING.STRIPE_WEBHOOK_SECRET value
-- (see pkg_stripe.pks header) once Stripe hands back that endpoint's
-- signing secret.
--
-- p_source_type => ORDS.source_type_plsql runs a plain PL/SQL block per
-- request rather than a query -- appropriate here since this "resource" is
-- really a procedure call, not a row set. Two ORDS-provided facilities are
-- used:
--   * :body_text -- an implicit CLOB bind ORDS populates with the raw,
--     unparsed request body. Using this (rather than re-deriving the body
--     from a parsed representation) is what makes signature verification
--     possible at all -- Stripe signs the exact bytes it sent, so anything
--     that re-serializes or reformats the JSON would break verification.
--   * OWA_UTIL.GET_CGI_ENV('HTTP_STRIPE_SIGNATURE') -- standard CGI header
--     naming (header name upper-cased, '-' -> '_', 'HTTP_' prefix) reads
--     the Stripe-Signature request header.
-- :status is the ORDS-provided bind for setting the HTTP response status
-- code; the response body is written with htp.p.
--
-- No COMMIT here: ORDS auto-commits a source_type_plsql handler's PL/SQL
-- block after it completes without error (assumed, unverified live -- same
-- caveat as every other live-dependency in this task set), so
-- pkg_stripe.handle_event follows the same "caller commits" convention
-- every other package in this schema uses and does not COMMIT internally.
-- ============================================================================
BEGIN
    ORDS.DEFINE_MODULE(
        p_module_name    => 'stripe.webhook',
        p_base_path      => 'stripe/',
        p_items_per_page => 0,
        p_status         => 'PUBLISHED',
        p_comments       => 'TASK-032/033: receives Stripe webhook deliveries (checkout.session.completed) and hands them to pkg_stripe.handle_event.'
    );

    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'stripe.webhook',
        p_pattern        => 'webhook'
    );

    ORDS.DEFINE_HANDLER(
        p_module_name    => 'stripe.webhook',
        p_pattern        => 'webhook',
        p_method         => 'POST',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    l_signature_header  VARCHAR2(1000);
    l_status_code       PLS_INTEGER;
    l_response_body     VARCHAR2(4000);
BEGIN
    l_signature_header := OWA_UTIL.GET_CGI_ENV('HTTP_STRIPE_SIGNATURE');

    pkg_stripe.handle_event(
        p_payload          => :body_text,
        p_signature_header => l_signature_header,
        p_status_code      => l_status_code,
        p_response_body    => l_response_body
    );

    :status := l_status_code;
    htp.p(l_response_body);
END;
]'
    );

    COMMIT;
END;
/
