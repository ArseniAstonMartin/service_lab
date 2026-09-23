-- ============================================================================
-- pkg_pricing.pks
-- TASK-014: server-side calculation of service price, return shipping fee
-- and order total, and the only place that snapshots those amounts into
-- ORDERS.
--
-- PRD 5.4 acceptance criteria: "no page ever takes a price from a page
-- item" -- every price a customer or admin sees is computed here, from
-- PRICE_TIER/APP_SETTING, never trusted from client-submitted input.
-- ============================================================================
CREATE OR REPLACE PACKAGE pkg_pricing AUTHID DEFINER AS

    -- ------------------------------------------------------------------------
    -- get_service_price
    -- The current price for p_service_id, read through
    -- SERVICE.PRICE_TIER -> PRICE_TIER.AMOUNT (never a live join is cached
    -- or trusted from a page item -- callers always call this function).
    -- Raises -20070 if p_service_id does not exist.
    -- ------------------------------------------------------------------------
    FUNCTION get_service_price(p_service_id IN NUMBER) RETURN NUMBER;

    -- ------------------------------------------------------------------------
    -- get_return_fee
    -- The current flat return-shipping fee, read from
    -- APP_SETTING('RETURN_SHIPPING_FEE') (PRD 4.5/5.4: admin-editable,
    -- $20-30 range -- range is an admin convention, not enforced here).
    -- Raises -20071 if the setting row is missing or not a valid number.
    -- ------------------------------------------------------------------------
    FUNCTION get_return_fee RETURN NUMBER;

    -- ------------------------------------------------------------------------
    -- calc_total
    -- get_service_price(p_service_id) + get_return_fee. Convenience for
    -- anywhere that needs the total without snapshotting it (e.g. an APEX
    -- page displaying "Estimated total" before submission).
    -- ------------------------------------------------------------------------
    FUNCTION calc_total(p_service_id IN NUMBER) RETURN NUMBER;

    -- ------------------------------------------------------------------------
    -- price_order
    -- Computes get_service_price(p_service_id) and get_return_fee, and
    -- snapshots ORDERS.SERVICE_PRICE / RETURN_SHIPPING_FEE / TOTAL_AMOUNT
    -- for p_order_id in one UPDATE. This is the ONLY procedure in the
    -- schema that is allowed to write those three columns (PRD 5.4
    -- acceptance criteria: "prices are snapshotted into ORDERS only
    -- through this package") -- pkg_order.submit_order (TASK-015) and
    -- pkg_review.confirm_compatibility (TASK-040) call this rather than
    -- ever UPDATE-ing those columns themselves.
    --
    -- Snapshotted values are frozen at call time (PRD 5.4: a later edit to
    -- PRICE_TIER.AMOUNT or APP_SETTING must never retroactively change an
    -- already-priced order) -- calling this again re-prices the order at
    -- today's rates, which is intentional only for the admin-driven
    -- re-price case (TASK-040); ordinary flows call it exactly once.
    --
    -- Raises -20070/-20071 (see above) if the price inputs can't be
    -- resolved, or -20072 if p_order_id does not exist.
    -- ------------------------------------------------------------------------
    PROCEDURE price_order(
        p_order_id   IN NUMBER,
        p_service_id IN NUMBER
    );

END pkg_pricing;
/
