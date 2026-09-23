-- ============================================================================
-- pkg_stripe.pks
-- TASK-030: create a Stripe Payment Link for an order and read it back.
--
-- Manual prerequisite (cannot be done from SQL -- this is exactly why PRD
-- 10 / this task's acceptance criteria require it to live outside code and
-- git in the first place): before this package can be called, a Web
-- Credential must exist in this workspace's Shared Components -> Web
-- Credentials with:
--   Static ID:      STRIPE_SECRET_KEY   (must match c_credential_static_id
--                                        in pkg_stripe.pkb exactly)
--   Auth Type:      HTTP Basic Authentication
--   Username:       the Stripe secret key (sk_test_... in test mode,
--                    sk_live_... in production -- Stripe's own convention
--                    is "API key as the Basic-Auth username, password
--                    blank")
--   Password:       left blank
-- The key itself is never stored in this repository -- pkg_stripe only
-- ever references it by STATIC ID via APEX_WEB_SERVICE's
-- p_credential_static_id, which resolves it server-side at request time.
-- ============================================================================
CREATE OR REPLACE PACKAGE pkg_stripe AUTHID DEFINER AS

    -- ------------------------------------------------------------------------
    -- create_payment_link
    -- Creates a Stripe Payment Link (POST /v1/payment_links) for
    -- p_order_id with two line items -- the order's confirmed service (at
    -- its snapshotted ORDERS.SERVICE_PRICE) and Return Shipping (at
    -- ORDERS.RETURN_SHIPPING_FEE) -- and metadata.order_id set to
    -- p_order_id (so the Stripe webhook handler, TASK-032, can resolve the
    -- order from the event without any other lookup). Stores the returned
    -- link id on ORDERS.STRIPE_PAYMENT_LINK_ID and returns the link's
    -- checkout URL (needed once, immediately, for email #2 -- TASK-031 --
    -- and not persisted anywhere else, since Stripe can always be asked
    -- for it again by id).
    --
    -- Requires the order to already be priced (ORDERS.SERVICE_PRICE and
    -- RETURN_SHIPPING_FEE both set -- i.e. pkg_pricing.price_order has
    -- already run for it) and to have a SERVICE_ID -- raises -20090/-20091
    -- otherwise.
    --
    -- Idempotent: if ORDERS.STRIPE_PAYMENT_LINK_ID is already set for this
    -- order, no new link is created -- the existing link's current URL is
    -- re-fetched from Stripe and returned instead (TASK-031's "a repeated
    -- call does not create a second link" requirement holds even called
    -- directly, not only through the caller pkg_order_status.change_status
    -- will use in TASK-031).
    --
    -- On any Stripe API failure (network error, non-2xx response, or a 2xx
    -- response missing id/url), the failure is written to APP_ERROR_LOG
    -- (in its own autonomous transaction, so the log entry survives even
    -- if the caller's transaction is rolled back after the exception this
    -- raises) and re-raised as -20092/-20093 with a readable message.
    -- ------------------------------------------------------------------------
    FUNCTION create_payment_link(p_order_id IN NUMBER) RETURN VARCHAR2;

    -- ------------------------------------------------------------------------
    -- get_payment_link_status
    -- Reads back the Payment Link already created for p_order_id (GET
    -- /v1/payment_links/{id}) and returns 'ACTIVE' or 'INACTIVE' based on
    -- Stripe's own "active" flag on the Payment Link object -- this is
    -- whether the link itself is still usable, NOT whether the order has
    -- been paid (payment completion arrives via the webhook, TASK-032/033,
    -- not by polling this). Mainly a verification/diagnostic entry point:
    -- proving the create -> read round-trip works end-to-end against
    -- Stripe test mode is this task's own acceptance criterion.
    --
    -- Raises -20090 for an unknown ORDER_ID, -20094 if the order has no
    -- payment link yet, or -20092 on a Stripe API failure (see
    -- create_payment_link).
    -- ------------------------------------------------------------------------
    FUNCTION get_payment_link_status(p_order_id IN NUMBER) RETURN VARCHAR2;

END pkg_stripe;
/
