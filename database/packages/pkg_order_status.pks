-- ============================================================================
-- pkg_order_status.pks
-- TASK-012: order status state machine, history and a notification hook.
-- TASK-029: filled in on_status_changed (see pkg_order_status.pkb) to send
-- email #3 (MODULE_RECEIVED) on the transition to Block Received and email
-- #4 (SHIPPED_BACK) on the transition to Ready / Shipped Back. No public
-- signature changed by this task.
--
-- The single place that is allowed to change ORDERS.STATUS -- enforced by
-- TRG_ORDERS_STATUS_GUARD (050_triggers.sql, TASK-006), which rejects any
-- UPDATE of ORDERS.STATUS not bracketed by PKG_ORDER_STATUS_CTX.allow_change
-- / done_changing, both of which only this package's change_status calls.
-- ============================================================================
CREATE OR REPLACE PACKAGE pkg_order_status AUTHID DEFINER AS

    -- Row/collection types for get_next_statuses, declared here (not in the
    -- body) so SQL can consume the pipelined function via
    -- TABLE(pkg_order_status.get_next_statuses(:P_ORDER_ID)) -- the pattern
    -- TASK-037's f94517 admin select list will use as its LOV source.
    TYPE t_next_status_row IS RECORD (
        status_code  order_status_ref.status_code%TYPE,
        display_seq  order_status_ref.display_seq%TYPE
    );
    TYPE t_next_status_tab IS TABLE OF t_next_status_row;

    -- ------------------------------------------------------------------------
    -- get_next_statuses
    -- Pipelined: pipes zero or one row -- the single status this linear state
    -- machine allows next for p_order_id's current status, or zero rows if
    -- the order is in a terminal status (Completed) or doesn't exist. Zero-
    -- or-one rather than "many" reflects the PRD's linear lifecycle (no
    -- branching next steps in v1); still shaped as a table function so a
    -- future non-linear transition (e.g. TASK-049's Block Received ->
    -- Pending Review) can pipe more than one row without an interface
    -- change.
    -- ------------------------------------------------------------------------
    FUNCTION get_next_statuses(p_order_id IN NUMBER) RETURN t_next_status_tab PIPELINED;

    -- ------------------------------------------------------------------------
    -- change_status
    -- Validates p_new_status is the (only) allowed next status for the
    -- order's current status, applies it (authorized via
    -- PKG_ORDER_STATUS_CTX so TRG_ORDERS_STATUS_GUARD allows the UPDATE),
    -- writes an ORDER_STATUS_HISTORY row, then calls the on_status_changed
    -- hook (TASK-029: sends emails #3/#4 for the two statuses that need
    -- one; a no-op for every other status). Raises a readable error -- and
    -- leaves ORDERS.STATUS unchanged -- on an invalid transition or an
    -- unknown order id.
    --
    -- p_changed_by: explicit actor (e.g. 'SYSTEM' from the Stripe webhook,
    -- TASK-032). NULL (the default) resolves to the live APEX session's
    -- APP_USER, falling back to 'SYSTEM' outside an APEX session (TASK-012
    -- acceptance criteria).
    -- p_comment: accepted now, unused until TASK-049 (Block Received ->
    -- Pending Review requires one) -- keeping the parameter here means that
    -- future task doesn't need to change this procedure's signature.
    -- ------------------------------------------------------------------------
    PROCEDURE change_status(
        p_order_id    IN NUMBER,
        p_new_status  IN VARCHAR2,
        p_changed_by  IN VARCHAR2 DEFAULT NULL,
        p_comment     IN VARCHAR2 DEFAULT NULL
    );

END pkg_order_status;
/
