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
        -- the existing order and does nothing else. Checked before the
        -- savepoint below -- there is nothing to protect yet.
        ------------------------------------------------------------------
        BEGIN
            SELECT order_id, tracking_token
              INTO p_order_id, p_tracking_token
              FROM orders
             WHERE idempotency_key = p_idempotency_key;

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
    END submit_order;

END pkg_order;
/
