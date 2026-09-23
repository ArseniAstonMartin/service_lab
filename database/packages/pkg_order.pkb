-- ============================================================================
-- pkg_order.pkb
-- TASK-015: atomic order creation for both submission paths.
-- See pkg_order.pks for the public contract and design rationale.
--
-- On atomicity: submit_order marks a SAVEPOINT before doing any write, and
-- if anything from that point on raises, rolls back to it and re-raises.
-- That undoes every write this call made -- ORDERS, ORDER_PHOTO,
-- ORDER_ANSWER, the first ORDER_STATUS_HISTORY row, and, on the matched
-- path, pkg_pricing.price_order's UPDATE and pkg_order_status.change_
-- status's UPDATE + history row -- without depending on the caller to roll
-- back correctly itself (a ROLLBACK TO SAVEPOINT only undoes work done
-- since that savepoint; it does not end the transaction, so the caller's
-- own COMMIT/ROLLBACK of whatever it did before calling submit_order is
-- untouched). This is the same "guarantee cleanup, then re-raise" shape
-- pkg_order_status.change_status uses for its own context-flag cleanup.
--
-- TASK-028 note on commit timing: that task's acceptance criteria call for
-- the ORDER_SUBMITTED/ADMIN_NEW_ORDER emails to fire "after a successful
-- commit". submit_order deliberately does NOT issue a COMMIT of its own to
-- satisfy that literally -- every other package in this schema (pkg_
-- pricing, pkg_order_status, pkg_stripe, ...) leaves the COMMIT to the
-- caller by design, and this package's own header above documents callers
-- relying on that. Making submit_order COMMIT internally would also be a
-- correctness hazard for every self-contained test script in this project
-- (test_pkg_order.sql included): those scripts insert their own TEST_-
-- prefixed fixture rows (MODULE_CATEGORY, VEHICLE_REF, SERVICE, ...) in the
-- SAME session/transaction before calling submit_order, and a COMMIT inside
-- submit_order commits the WHOLE current transaction, not just this
-- procedure's own writes -- there is no such thing as a partial commit in
-- Oracle. That would permanently write every fixture row (not just the
-- ORDERS row) into this shared apex.oracle.com workspace, defeating the
-- final ROLLBACK every test in this project relies on to stay self-
-- contained. So instead, send_order_notifications below is called once the
-- SAVEPOINT-protected write block has completed with no exception raised
-- (the strongest "this succeeded" signal available without an internal
-- COMMIT) -- both here and on the idempotent-replay path. In the real
-- runtime (an APEX page process), that point is immediately followed by
-- APEX's own automatic commit of the process, with no user-facing step in
-- between, so in practice this is equivalent to "after a successful
-- commit" for every real submission; the only residual gap is a caller
-- that calls submit_order and then fails to commit for its own unrelated
-- reasons, which would leave a customer notified about data that was never
-- actually persisted -- a known, accepted trade-off, documented here should
-- a future agent with live App Builder access want to revisit it.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY pkg_order AS

    -- ----------------------------------------------------------------------------
    -- current_actor
    -- CHANGED_BY for the initial ORDER_STATUS_HISTORY row this package
    -- writes directly (see submit_order). Deliberately the same resolution
    -- pkg_order_status.change_status uses internally for its own history
    -- rows (APEX_APPLICATION.g_user, falling back to 'SYSTEM' outside an
    -- APEX session) -- duplicated rather than exposed from pkg_order_status,
    -- since that package keeps it private and this is the only other place
    -- that needs it.
    -- ----------------------------------------------------------------------------
    FUNCTION current_actor RETURN VARCHAR2 IS
        l_user VARCHAR2(50);
    BEGIN
        l_user := APEX_APPLICATION.g_user;
        RETURN NVL(l_user, 'SYSTEM');
    EXCEPTION
        WHEN OTHERS THEN
            RETURN 'SYSTEM';
    END current_actor;

    -- ----------------------------------------------------------------------------
    -- log_error
    -- Same convention as pkg_stripe.log_error/pkg_notify's own internal
    -- error handling: a small private, autonomous-transaction logger, since
    -- no shared logging package exists yet. Used only by
    -- send_order_notifications below, to make sure a bug in THIS
    -- procedure's own SQL (building placeholders, resolving the admin URL,
    -- ...) can never surface as a submit_order failure for an order that,
    -- by the time this runs, has already been fully and correctly built --
    -- see send_order_notifications.
    -- ----------------------------------------------------------------------------
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

    -- ----------------------------------------------------------------------------
    -- send_order_notifications
    -- TASK-028: dispatches email #1 (ORDER_SUBMITTED, to the customer) and
    -- email #5 (ADMIN_NEW_ORDER, to APP_SETTING.ADMIN_EMAIL) for an order
    -- that submit_order has just (or previously) built. Called from both of
    -- submit_order's exit points -- see pkg_order.pkb's header comment for
    -- why this sits where it does rather than after an actual COMMIT.
    --
    -- Uses pkg_notify.send_once, not send, for both emails -- so calling
    -- this more than once for the same order_id (the idempotent-replay
    -- path calls it on every replay, not just the first) never sends a
    -- duplicate: EMAIL_LOG already has a row for that (order_id,
    -- email_type) after the first successful dispatch, and send_once no-ops
    -- from then on. This is this task's own acceptance criterion ("each
    -- email is sent exactly once per order, checked in EMAIL_LOG").
    --
    -- #1's wording differs by path (PRD: "next steps specific to the
    -- path") via the NEXT_STEPS placeholder, computed here from ORDERS.
    -- MATCHED_ENTRY_ID rather than by asking the caller, since by this
    -- point that's already the authoritative, server-decided answer.
    --
    -- #5 gets CUSTOMER_PHONE, PART_NUMBER and ADMIN_ORDER_URL (a link to
    -- f94517 Page 11, from pkg_notify.admin_order_url) on top of the usual
    -- defaults -- and deliberately nothing photo-related: PRD/TASK-028
    -- acceptance criteria require any uploaded photo be reached only
    -- through the admin app itself, never through the email.
    --
    -- Wrapped in its own exception handler that logs to APP_ERROR_LOG and
    -- swallows -- a bug here must never turn an already-successful order
    -- submission into a failure the customer sees.
    -- ----------------------------------------------------------------------------
    PROCEDURE send_order_notifications(p_order_id IN orders.order_id%TYPE) IS
        l_matched_entry_id  orders.matched_entry_id%TYPE;
        l_part_number       orders.part_number_entered%TYPE;
        l_customer_phone    orders.customer_phone%TYPE;
        l_next_steps        VARCHAR2(500);
        l_customer_json     CLOB;
        l_admin_json        CLOB;
    BEGIN
        SELECT matched_entry_id, part_number_entered, customer_phone
          INTO l_matched_entry_id, l_part_number, l_customer_phone
          FROM orders
         WHERE order_id = p_order_id;

        l_next_steps := CASE
            WHEN l_matched_entry_id IS NOT NULL THEN
                'Watch your inbox for a secure Stripe payment link -- we will send it shortly, and work on your module begins as soon as payment is received.'
            ELSE
                'Our technicians are reviewing your Part Number to confirm compatibility. We will follow up by email, typically within 1-2 business days, once that review is complete.'
        END;

        SELECT JSON_OBJECT('NEXT_STEPS' VALUE l_next_steps RETURNING CLOB)
          INTO l_customer_json
          FROM dual;

        pkg_notify.send_once(
            p_order_id           => p_order_id,
            p_email_type         => 'ORDER_SUBMITTED',
            p_extra_placeholders => l_customer_json
        );

        SELECT JSON_OBJECT(
                   'CUSTOMER_PHONE'  VALUE l_customer_phone,
                   'PART_NUMBER'     VALUE l_part_number,
                   'ADMIN_ORDER_URL' VALUE pkg_notify.admin_order_url(p_order_id)
                   RETURNING CLOB)
          INTO l_admin_json
          FROM dual;

        pkg_notify.send_once(
            p_order_id           => p_order_id,
            p_email_type         => 'ADMIN_NEW_ORDER',
            p_extra_placeholders => l_admin_json
        );
    EXCEPTION
        WHEN OTHERS THEN
            log_error(
                p_source   => 'PKG_ORDER.SEND_ORDER_NOTIFICATIONS',
                p_message  => SQLERRM,
                p_order_id => p_order_id
            );
            -- Deliberately swallowed -- see this procedure's header comment.
    END send_order_notifications;

    -- ----------------------------------------------------------------------------
    -- submit_order
    -- ----------------------------------------------------------------------------
    PROCEDURE submit_order(
        p_vehicle_id             IN  NUMBER,
        p_category_id            IN  NUMBER,
        p_part_number            IN  VARCHAR2,
        p_service_id             IN  NUMBER DEFAULT NULL,
        p_description            IN  CLOB,
        p_customer_name          IN  VARCHAR2,
        p_customer_email         IN  VARCHAR2,
        p_customer_phone         IN  VARCHAR2,
        p_return_address_street  IN  VARCHAR2,
        p_return_address_city    IN  VARCHAR2,
        p_return_address_state   IN  VARCHAR2 DEFAULT 'HI',
        p_return_address_zip     IN  VARCHAR2,
        p_answers                IN  t_answer_input_tab,
        p_photos                 IN  t_photo_input_tab,
        p_idempotency_key        IN  VARCHAR2,
        p_order_id               OUT NUMBER,
        p_tracking_token         OUT VARCHAR2
    ) IS
        l_matched_entry_id  compatibility_entry.entry_id%TYPE;
        l_service_id        orders.service_id%TYPE;
        l_tracking_token    orders.tracking_token%TYPE;
        l_actor             VARCHAR2(50);
        l_photo_id          order_photo.photo_id%TYPE;
        l_confirmed_count   PLS_INTEGER;
    BEGIN
        ------------------------------------------------------------------
        -- Idempotent replay: a repeated submit with the same key returns
        -- the existing order and does no further writes of its own. Still
        -- (harmlessly, via send_once) re-runs notification dispatch --
        -- see pkg_order.pks / this file's header comment. Checked before
        -- the savepoint below -- there is nothing to protect yet.
        ------------------------------------------------------------------
        BEGIN
            SELECT order_id, tracking_token
              INTO p_order_id, p_tracking_token
              FROM orders
             WHERE idempotency_key = p_idempotency_key;

            send_order_notifications(p_order_id);
            RETURN; -- existing order found: no new writes at all.
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                NULL; -- fall through and create the order below.
        END;

        SAVEPOINT sp_submit_order;

        BEGIN
            ------------------------------------------------------------------
            -- The one decision this procedure never takes on faith from the
            -- caller: is this Part Number actually supported. Re-checked
            -- here even though the wizard already showed the customer a
            -- result.
            ------------------------------------------------------------------
            l_matched_entry_id := pkg_compat.find_match(
                p_vehicle_id  => p_vehicle_id,
                p_category_id => p_category_id,
                p_part_number => p_part_number
            );

            IF l_matched_entry_id IS NOT NULL THEN
                IF p_service_id IS NULL THEN
                    RAISE_APPLICATION_ERROR(-20080,
                        'pkg_order.submit_order: this Part Number matched a compatibility entry, but no service was selected.');
                END IF;

                SELECT COUNT(*) INTO l_confirmed_count
                  FROM compatibility_service
                 WHERE entry_id = l_matched_entry_id
                   AND service_id = p_service_id;

                IF l_confirmed_count = 0 THEN
                    RAISE_APPLICATION_ERROR(-20081,
                        'pkg_order.submit_order: SERVICE_ID ' || p_service_id
                        || ' is not a confirmed service for this Part Number.');
                END IF;

                l_service_id := p_service_id;
            ELSE
                -- Not matched: SERVICE_ID/MATCHED_ENTRY_ID are NULL
                -- regardless of whatever p_service_id the caller passed
                -- (TASK-015 acceptance criteria) -- the server's own match
                -- decision is authoritative, not the client's.
                l_service_id := NULL;
            END IF;

            l_tracking_token := pkg_security.generate_tracking_token;
            l_actor           := current_actor;

            ------------------------------------------------------------------
            -- ORDERS: always created at Pending Review -- TRG_ORDERS_STATUS_
            -- GUARD does not fire on INSERT (only UPDATE OF status), so this
            -- direct value is not a "change" through pkg_order_status. The
            -- matched path transitions it below via pkg_order_status.
            ------------------------------------------------------------------
            INSERT INTO orders (
                tracking_token, status, vehicle_id, category_id, part_number_entered,
                matched_entry_id, service_id, description,
                customer_name, customer_email, customer_phone,
                return_address_street, return_address_city, return_address_state, return_address_zip,
                idempotency_key
            ) VALUES (
                l_tracking_token, 'Pending Review', p_vehicle_id, p_category_id, p_part_number,
                l_matched_entry_id, l_service_id, p_description,
                p_customer_name, p_customer_email, p_customer_phone,
                p_return_address_street, p_return_address_city, p_return_address_state, p_return_address_zip,
                p_idempotency_key
            ) RETURNING order_id INTO p_order_id;

            ------------------------------------------------------------------
            -- First ORDER_STATUS_HISTORY row. Written directly (not through
            -- pkg_order_status.change_status, which validates a *transition*
            -- from an existing status and has nothing to transition from on
            -- a brand-new row) -- see the design note in TASK-006's
            -- TRG_ORDERS_STATUS_GUARD and TASK-012's pkg_order_status header.
            ------------------------------------------------------------------
            INSERT INTO order_status_history (order_id, status, changed_by)
            VALUES (p_order_id, 'Pending Review', l_actor);

            ------------------------------------------------------------------
            -- Photos
            ------------------------------------------------------------------
            FOR i IN 1 .. p_photos.COUNT LOOP
                pkg_security.store_order_photo(
                    p_order_id       => p_order_id,
                    p_photo_type     => p_photos(i).photo_type,
                    p_temp_file_name => p_photos(i).temp_file_name,
                    p_photo_id       => l_photo_id
                );
            END LOOP;

            ------------------------------------------------------------------
            -- Dynamic-question answers. Saved as given for both paths -- see
            -- pkg_order.pks / progress.md for when a Pending Review order
            -- actually has any to save (its service, and so its question
            -- set, isn't known yet).
            ------------------------------------------------------------------
            FOR i IN 1 .. p_answers.COUNT LOOP
                INSERT INTO order_answer (order_id, question_code, answer_value)
                VALUES (p_order_id, p_answers(i).question_code, p_answers(i).answer_value);
            END LOOP;

            ------------------------------------------------------------------
            -- Matched path only: snapshot prices, then move Pending Review
            -- -> Awaiting Payment (writes the second ORDER_STATUS_HISTORY
            -- row).
            ------------------------------------------------------------------
            IF l_matched_entry_id IS NOT NULL THEN
                pkg_pricing.price_order(p_order_id => p_order_id, p_service_id => l_service_id);

                pkg_order_status.change_status(
                    p_order_id   => p_order_id,
                    p_new_status => 'Awaiting Payment',
                    p_changed_by => l_actor
                );
            END IF;

            p_tracking_token := l_tracking_token;
        EXCEPTION
            WHEN OTHERS THEN
                ROLLBACK TO SAVEPOINT sp_submit_order;
                RAISE;
        END;

        ------------------------------------------------------------------
        -- TASK-028: the write block above completed with no exception --
        -- the order is fully and correctly built. See this file's header
        -- comment for why notification dispatch sits here rather than
        -- after an actual COMMIT statement.
        ------------------------------------------------------------------
        send_order_notifications(p_order_id);
    END submit_order;

END pkg_order;
/
