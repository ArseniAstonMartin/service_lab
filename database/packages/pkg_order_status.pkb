-- ============================================================================
-- pkg_order_status.pkb
-- TASK-012: order status state machine, history and a notification hook.
-- TASK-029: fills in on_status_changed with emails #3/#4.
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
    -- log_error (private)
    -- TASK-029. Same convention as pkg_stripe.log_error / pkg_order.log_error:
    -- a small private, autonomous-transaction logger, since no shared
    -- logging package exists yet. Used only by on_status_changed below, so
    -- a bug in the notification step (building placeholders, a missing
    -- Email Template, ...) can never surface as a change_status failure for
    -- a status change that, by the time this runs, has already been
    -- correctly written to ORDERS and ORDER_STATUS_HISTORY.
    ----------------------------------------------------------------------------
    PROCEDURE log_error(
        p_source   IN VARCHAR2,
        p_message  IN VARCHAR2,
        p_order_id IN NUMBER DEFAULT NULL
    ) IS
        PRAGMA AUTONOMOUS_TRANSACTION;
    BEGIN
        INSERT INTO app_error_log (error_source, error_message, order_id)
        VALUES (p_source, SUBSTR(p_message, 1, 4000), p_order_id);

        COMMIT;
    END log_error;

    ----------------------------------------------------------------------------
    -- on_status_changed (private)
    -- Notification hook, called by change_status after every successful
    -- status change and its ORDER_STATUS_HISTORY row.
    --
    -- TASK-029: sends email #3 (MODULE_RECEIVED, to the customer) on the
    -- transition to Block Received, and email #4 (SHIPPED_BACK, to the
    -- customer) on the transition to Ready / Shipped Back -- including
    -- RETURN_TRACKING_NO when the admin has set one (TASK-037 sets it when
    -- moving an order to this status, but change_status does not require
    -- it, so this reads whatever is on the row at the moment of the
    -- transition rather than requiring it as a parameter). No email for
    -- any other status, including In Progress, matching this task's own
    -- acceptance criteria ("No email for In Progress or any other status").
    -- Both sends go through pkg_notify.send_once, so a change_status call
    -- that somehow re-fires the same transition (there is no legitimate way
    -- to today, since TRG_ORDERS_STATUS_GUARD only allows a real status
    -- change, but the guarantee costs nothing to keep) can never double-
    -- send.
    --
    -- Still empty for TASK-031's Awaiting Payment / email #2 case -- that
    -- task adds its own branch here (and the Stripe payment-link creation
    -- alongside it) without needing to touch this task's two branches.
    --
    -- The whole notification step is wrapped in WHEN OTHERS -> log_error,
    -- exactly like TASK-028's pkg_order.send_order_notifications: a
    -- notification bug must never roll back or fail the status change
    -- itself, which by this point has already committed-worthy work behind
    -- it (the UPDATE and the ORDER_STATUS_HISTORY INSERT).
    ----------------------------------------------------------------------------
    PROCEDURE on_status_changed(
        p_order_id    IN NUMBER,
        p_old_status  IN VARCHAR2,
        p_new_status  IN VARCHAR2,
        p_comment     IN VARCHAR2
    ) IS
        l_return_tracking_no  orders.return_tracking_no%TYPE;
        l_extra_json          CLOB;
    BEGIN
        IF p_new_status = 'Block Received' THEN
            pkg_notify.send_once(p_order_id => p_order_id, p_email_type => 'MODULE_RECEIVED');

        ELSIF p_new_status = 'Ready / Shipped Back' THEN
            SELECT return_tracking_no INTO l_return_tracking_no
              FROM orders
             WHERE order_id = p_order_id;

            SELECT JSON_OBJECT('RETURN_TRACKING_NO' VALUE l_return_tracking_no RETURNING CLOB)
              INTO l_extra_json
              FROM dual;

            pkg_notify.send_once(
                p_order_id           => p_order_id,
                p_email_type         => 'SHIPPED_BACK',
                p_extra_placeholders => l_extra_json
            );
        END IF;
        -- Every other status (Pending Review, Awaiting Payment, Payment
        -- Received, In Progress, Completed): no email from this hook.
        -- Awaiting Payment's email #2 is TASK-031's own branch, not yet
        -- added here.
    EXCEPTION
        WHEN OTHERS THEN
            log_error(
                p_source   => 'PKG_ORDER_STATUS.ON_STATUS_CHANGED',
                p_message  => SQLERRM,
                p_order_id => p_order_id
            );
            -- Deliberately swallowed -- see the procedure comment above.
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
        -- on f94517 Page 11 has nothing to offer).

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
