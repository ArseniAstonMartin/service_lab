-- ============================================================================
-- pkg_order_status.pkb
-- TASK-012: order status state machine, history and a notification hook.
-- See pkg_order_status.pks for the public contract and design rationale.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY pkg_order_status AS

    ----------------------------------------------------------------------------
    -- next_status_for (private)
    -- Single source of truth for the linear state machine (PRD section 6):
    --   Pending Review -> Awaiting Payment -> Payment Received ->
    --   Block Received -> In Progress -> Ready / Shipped Back -> Completed.
    -- Returns the one allowed next status for p_current_status, or NULL if
    -- p_current_status is terminal (Completed) or unrecognized.
    --
    -- "Matched orders start directly at Awaiting Payment" (TASK-012
    -- acceptance criteria) is NOT a transition through this function --
    -- pkg_order.submit_order (TASK-015) sets that as the initial INSERT
    -- value, and TRG_ORDERS_STATUS_GUARD (TASK-006) does not fire on
    -- INSERT, only on UPDATE of STATUS.
    --
    -- A future backward transition (TASK-049: Block Received -> Pending
    -- Review, with a required comment) is intentionally NOT included here
    -- yet -- that task adds its own branch (and change_status's handling of
    -- p_comment) rather than this task guessing at its shape.
    ----------------------------------------------------------------------------
    FUNCTION next_status_for(p_current_status IN VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        CASE p_current_status
            WHEN 'Pending Review'       THEN RETURN 'Awaiting Payment';
            WHEN 'Awaiting Payment'     THEN RETURN 'Payment Received';
            WHEN 'Payment Received'     THEN RETURN 'Block Received';
            WHEN 'Block Received'       THEN RETURN 'In Progress';
            WHEN 'In Progress'          THEN RETURN 'Ready / Shipped Back';
            WHEN 'Ready / Shipped Back' THEN RETURN 'Completed';
            ELSE RETURN NULL; -- 'Completed' (terminal) or anything unrecognized
        END CASE;
    END next_status_for;

    ----------------------------------------------------------------------------
    -- current_actor (private)
    -- APP_USER from the live APEX session if one exists, else 'SYSTEM'
    -- (TASK-012 acceptance criteria). APEX_APPLICATION.G_USER is a plain
    -- package variable that defaults to NULL until APEX initializes a
    -- session, so reading it outside a live APEX session is safe (no
    -- exception) -- the WHEN OTHERS below is defensive only, for a session
    -- where APEX_APPLICATION itself is not accessible.
    ----------------------------------------------------------------------------
    FUNCTION current_actor RETURN VARCHAR2 IS
        l_user VARCHAR2(255);
    BEGIN
        BEGIN
            l_user := APEX_APPLICATION.g_user;
        EXCEPTION
            WHEN OTHERS THEN
                l_user := NULL;
        END;
        RETURN NVL(l_user, 'SYSTEM');
    END current_actor;

    ----------------------------------------------------------------------------
    -- on_status_changed (private)
    -- Notification hook, called by change_status after every successful
    -- status change and its ORDER_STATUS_HISTORY row.
    --
    -- Empty for TASK-012. Filled in by:
    --   TASK-031: on the transition to Awaiting Payment -- create the Stripe
    --             payment link (pkg_stripe) and send email #2.
    --   TASK-029: on the transition to Block Received -- send email #3.
    --             On the transition to Ready / Shipped Back -- send email #4.
    -- Kept as a single hook point (rather than each of those tasks editing
    -- change_status's own transition-validation logic) so that logic never
    -- has to change again once notification behavior is added on top of it.
    ----------------------------------------------------------------------------
    PROCEDURE on_status_changed(
        p_order_id    IN NUMBER,
        p_old_status  IN VARCHAR2,
        p_new_status  IN VARCHAR2,
        p_comment     IN VARCHAR2
    ) IS
    BEGIN
        NULL; -- TASK-028/029/031 fill this in; intentionally empty for TASK-012.
    END on_status_changed;

    ----------------------------------------------------------------------------
    -- get_next_statuses
    ----------------------------------------------------------------------------
    FUNCTION get_next_statuses(p_order_id IN NUMBER) RETURN t_next_status_tab PIPELINED IS
        l_current_status  orders.status%TYPE;
        l_next_status     VARCHAR2(30);
        l_row             t_next_status_row;
    BEGIN
        SELECT status INTO l_current_status FROM orders WHERE order_id = p_order_id;

        l_next_status := next_status_for(l_current_status);

        IF l_next_status IS NOT NULL THEN
            SELECT status_code, display_seq
              INTO l_row.status_code, l_row.display_seq
              FROM order_status_ref
             WHERE status_code = l_next_status;

            PIPE ROW (l_row);
        END IF;
        -- Terminal/unrecognized current status: pipes zero rows -- an empty
        -- LOV, exactly right for a Completed order (TASK-037's select list
        -- on f200 Page 11 has nothing to offer).

        RETURN;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN; -- Unknown order_id: empty result set, not an error -- an
                     -- LOV query should never itself blow up a page.
    END get_next_statuses;

    ----------------------------------------------------------------------------
    -- change_status
    ----------------------------------------------------------------------------
    PROCEDURE change_status(
        p_order_id    IN NUMBER,
        p_new_status  IN VARCHAR2,
        p_changed_by  IN VARCHAR2 DEFAULT NULL,
        p_comment     IN VARCHAR2 DEFAULT NULL
    ) IS
        l_current_status  orders.status%TYPE;
        l_allowed_next    VARCHAR2(30);
        l_changed_by      order_status_history.changed_by%TYPE;
    BEGIN
        BEGIN
            SELECT status
              INTO l_current_status
              FROM orders
             WHERE order_id = p_order_id
             FOR UPDATE;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20060,
                    'pkg_order_status.change_status: no order found for ORDER_ID ' || p_order_id || '.');
        END;

        l_allowed_next := next_status_for(l_current_status);

        IF l_allowed_next IS NULL OR l_allowed_next != p_new_status THEN
            RAISE_APPLICATION_ERROR(-20061,
                'pkg_order_status.change_status: cannot move order ' || p_order_id || ' from "'
                || l_current_status || '" to "' || p_new_status || '". '
                || CASE WHEN l_allowed_next IS NULL
                        THEN '"' || l_current_status || '" is a terminal status; no further transitions are allowed.'
                        ELSE 'The only allowed next status from here is "' || l_allowed_next || '".'
                   END);
        END IF;

        l_changed_by := NVL(p_changed_by, current_actor);

        -- Authorize the UPDATE for TRG_ORDERS_STATUS_GUARD (TASK-006), and
        -- guarantee the authorization flag is cleared even if the UPDATE
        -- itself fails for an unrelated reason (e.g. a future CHECK this
        -- schema doesn't have yet) -- otherwise a failed change_status call
        -- would leave PKG_ORDER_STATUS_CTX permanently "open" for the rest
        -- of the session.
        BEGIN
            pkg_order_status_ctx.allow_change;
            UPDATE orders SET status = p_new_status WHERE order_id = p_order_id;
        EXCEPTION
            WHEN OTHERS THEN
                pkg_order_status_ctx.done_changing;
                RAISE;
        END;
        pkg_order_status_ctx.done_changing;

        INSERT INTO order_status_history (order_id, status, changed_by)
        VALUES (p_order_id, p_new_status, l_changed_by);

        on_status_changed(
            p_order_id   => p_order_id,
            p_old_status => l_current_status,
            p_new_status => p_new_status,
            p_comment    => p_comment
        );
    END change_status;

END pkg_order_status;
/
