-- ============================================================================
-- pkg_order.pks
-- TASK-015: atomic order creation for both submission paths.
--
-- The single entry point the wizard's final "submit" step (f100 Page 15,
-- TASK-022) calls. Everything a submission produces -- the ORDERS row, its
-- photos, its dynamic-question answers and its first ORDER_STATUS_HISTORY
-- row -- is written here, in one PL/SQL call, so a caller that does not
-- commit until submit_order returns gets all-or-nothing behavior for free
-- (see pkg_order.pkb's header comment for how that atomicity is actually
-- achieved).
--
-- submit_order never trusts the client on the one question that matters
-- most -- "is this Part Number supported" -- it always re-runs
-- pkg_compat.find_match itself (PRD 4.2: "the system never silently
-- guesses"), even though the wizard already showed the customer a match/
-- no-match result on an earlier page.
-- ============================================================================
CREATE OR REPLACE PACKAGE pkg_order AUTHID DEFINER AS

    -- ------------------------------------------------------------------------
    -- Dynamic-question answers to save. Associative array (not a SQL-level
    -- collection type) because the only caller is PL/SQL -- an APEX page
    -- process building it from APEX_APPLICATION.g_f01/g_f02-style page
    -- items or from a collection -- never a SQL query.
    -- ------------------------------------------------------------------------
    -- Populate densely from index 1 (p_answers(p_answers.COUNT + 1) := ...)
    -- -- submit_order iterates 1 .. p_answers.COUNT, a sparse array would
    -- silently skip rows.
    TYPE t_answer_input_row IS RECORD (
        question_code  order_answer.question_code%TYPE,
        answer_value   order_answer.answer_value%TYPE
    );
    TYPE t_answer_input_tab IS TABLE OF t_answer_input_row INDEX BY PLS_INTEGER;

    -- ------------------------------------------------------------------------
    -- Photos to store. p_temp_file_name is a name from
    -- APEX_APPLICATION_TEMP_FILES (the wizard's File Upload items,
    -- TASK-017); p_photo_type is STICKER/DONOR/ORIGINAL
    -- (ck_order_photo_type, TASK-006).
    -- ------------------------------------------------------------------------
    -- Same dense-from-1 convention as t_answer_input_tab above.
    TYPE t_photo_input_row IS RECORD (
        photo_type      order_photo.photo_type%TYPE,
        temp_file_name  VARCHAR2(400)
    );
    TYPE t_photo_input_tab IS TABLE OF t_photo_input_row INDEX BY PLS_INTEGER;

    -- ------------------------------------------------------------------------
    -- submit_order
    --
    -- p_service_id: the service the customer selected. Only meaningful, and
    -- only honored, on the matched path (see below) -- ignored (stored as
    -- NULL) when the server's own compatibility check finds no match,
    -- regardless of what the caller passes.
    --
    -- p_answers / p_photos: see the two collection types above. Either may
    -- be empty (an associative array with COUNT = 0) -- see the body's
    -- header comment for which case that's expected in.
    --
    -- p_idempotency_key: generated client-side when the review/submit page
    -- loads (TASK-022). A second call with a key already on an ORDERS row
    -- returns that existing order's ORDER_ID/TRACKING_TOKEN unchanged and
    -- does no further work -- no duplicate order, photos, answers or
    -- history row.
    --
    -- Server-side flow, decided entirely inside this procedure (PRD 4.2 --
    -- never trust the client's match/no-match flag):
    --   1. pkg_compat.find_match(p_vehicle_id, p_category_id, p_part_number)
    --      decides the path.
    --   2. Matched (a compatibility entry with confirmed services exists):
    --      p_service_id is required and must be one of that entry's
    --      confirmed services (pkg_compat.get_services) -- raises -20080/
    --      -20081 otherwise. ORDERS is created with SERVICE_ID/
    --      MATCHED_ENTRY_ID set, then pkg_pricing.price_order snapshots
    --      SERVICE_PRICE/RETURN_SHIPPING_FEE/TOTAL_AMOUNT and
    --      pkg_order_status.change_status moves STATUS from Pending Review
    --      (the row's initial value) to Awaiting Payment.
    --   3. Not matched: ORDERS is created with SERVICE_ID/MATCHED_ENTRY_ID/
    --      every price column NULL and STATUS left at Pending Review --
    --      pkg_review.confirm_compatibility (TASK-040) is what later sets
    --      those once an admin confirms a service by hand.
    --
    -- Every INSERT (ORDERS, ORDER_PHOTO via pkg_security.store_order_photo,
    -- ORDER_ANSWER, the first ORDER_STATUS_HISTORY row) plus, on the
    -- matched path, pkg_pricing.price_order and
    -- pkg_order_status.change_status, happens behind a single internal
    -- SAVEPOINT -- an exception at any point rolls the whole call back to
    -- that savepoint and re-raises, so a partial order is never left behind
    -- even if the caller's own error handling does nothing special (see
    -- pkg_order.pkb's header comment).
    -- ------------------------------------------------------------------------
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
    );

END pkg_order;
/
