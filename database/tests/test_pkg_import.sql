-- ============================================================================
-- test_pkg_import.sql
-- TASK-044: Unit tests for pkg_import (staging, validate_batch, apply_batch).
--
-- Run via SQL Workshop -> SQL Commands (or SQLcl) AFTER pkg_import has been
-- installed (needs 010-070_*.sql, pkg_compat for the auto-match check).
-- Self-contained: creates its own TEST_-prefixed fixture rows and ROLLBACKs
-- everything at the end -- including every VEHICLE_REF/COMPATIBILITY_ENTRY/
-- COMPATIBILITY_SERVICE row apply_batch itself creates.
--
-- Purely PL/SQL -- pkg_import never calls APEX_WEB_SERVICE or any other
-- external dependency, so every assertion below needs no live network
-- access.
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count   PLS_INTEGER := 0;
    v_fail_count   PLS_INTEGER := 0;

    v_category_id     module_category.category_id%TYPE;
    v_service_1_id      service.service_id%TYPE;
    v_service_2_id      service.service_id%TYPE;

    v_make   VARCHAR2(50) := 'TEST_MAKE_044_' || DBMS_RANDOM.STRING('U', 6);
    v_model  VARCHAR2(50) := 'TEST_MODEL_044';
    v_pn_happy   VARCHAR2(100) := 'TEST-PN-044-HAPPY-' || DBMS_RANDOM.STRING('U', 8);
    v_pn_admin   VARCHAR2(100) := 'TEST-PN-044-ADMIN-' || DBMS_RANDOM.STRING('U', 8);

    PROCEDURE report(p_test_name IN VARCHAR2, p_passed IN BOOLEAN, p_detail IN VARCHAR2 DEFAULT NULL) IS
    BEGIN
        IF p_passed THEN
            v_pass_count := v_pass_count + 1;
            DBMS_OUTPUT.PUT_LINE('PASS - ' || p_test_name);
        ELSE
            v_fail_count := v_fail_count + 1;
            DBMS_OUTPUT.PUT_LINE('FAIL - ' || p_test_name || CASE WHEN p_detail IS NOT NULL THEN ' (' || p_detail || ')' END);
        END IF;
    END report;

    FUNCTION mentions_code(p_message IN VARCHAR2, p_code IN NUMBER) RETURN BOOLEAN IS
    BEGIN
        RETURN p_message IS NOT NULL AND INSTR(p_message, TO_CHAR(p_code)) > 0;
    END mentions_code;

BEGIN
    ----------------------------------------------------------------------
    -- Fixtures
    ----------------------------------------------------------------------
    INSERT INTO module_category (name, display_seq)
        VALUES ('TEST_CATEGORY_044', 999)
        RETURNING category_id INTO v_category_id;

    MERGE INTO price_tier tgt
    USING (SELECT 'T044' AS tier_code, 260.00 AS amount FROM dual) src
    ON (tgt.tier_code = src.tier_code)
    WHEN NOT MATCHED THEN INSERT (tier_code, amount) VALUES (src.tier_code, src.amount);

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_044_1', 'T044', 'TEST_SET_044', 'N')
        RETURNING service_id INTO v_service_1_id;

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_044_2', 'T044', 'TEST_SET_044', 'N')
        RETURNING service_id INTO v_service_2_id;

    DBMS_OUTPUT.PUT_LINE('Fixtures created: category=' || v_category_id
        || ' service_1=' || v_service_1_id || ' service_2=' || v_service_2_id);
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');

    ----------------------------------------------------------------------
    -- start_batch: empty input
    ----------------------------------------------------------------------
    DECLARE
        v_rows    pkg_import.t_row_input_tab; -- left empty
        v_batch   VARCHAR2(50);
        v_raised  BOOLEAN := FALSE;
        v_detail  VARCHAR2(4000);
    BEGIN
        BEGIN
            v_batch := pkg_import.start_batch(v_rows);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('start_batch rejects an empty row set (ORA-20140)',
               v_raised AND mentions_code(v_detail, -20140), v_detail);
    END;

    ----------------------------------------------------------------------
    -- validate_batch / apply_batch: unknown batch_id
    ----------------------------------------------------------------------
    DECLARE
        v_raised  BOOLEAN := FALSE;
        v_detail  VARCHAR2(4000);
    BEGIN
        BEGIN
            pkg_import.validate_batch('NO-SUCH-BATCH-044');
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('validate_batch rejects an unknown batch_id (ORA-20141)',
               v_raised AND mentions_code(v_detail, -20141), v_detail);
    END;

    DECLARE
        v_applied PLS_INTEGER;
        v_skipped PLS_INTEGER;
        v_raised  BOOLEAN := FALSE;
        v_detail  VARCHAR2(4000);
    BEGIN
        BEGIN
            pkg_import.apply_batch('NO-SUCH-BATCH-044', v_applied, v_skipped);
        EXCEPTION
            WHEN OTHERS THEN
                v_raised := TRUE;
                v_detail := SQLERRM;
        END;
        report('apply_batch rejects an unknown batch_id (ORA-20141)',
               v_raised AND mentions_code(v_detail, -20141), v_detail);
    END;

    ----------------------------------------------------------------------
    -- Main batch: one valid row, and one row per validation failure mode.
    ----------------------------------------------------------------------
    DECLARE
        v_rows     pkg_import.t_row_input_tab;
        v_batch_id VARCHAR2(50);
        v_n        PLS_INTEGER := 0;

        v_row_happy          PLS_INTEGER;
        v_row_bad_make       PLS_INTEGER;
        v_row_bad_year       PLS_INTEGER;
        v_row_year_range     PLS_INTEGER;
        v_row_bad_category   PLS_INTEGER;
        v_row_bad_pn         PLS_INTEGER;
        v_row_bad_services   PLS_INTEGER;
        v_row_empty_services PLS_INTEGER;
    BEGIN
        v_n := v_n + 1; v_row_happy := v_n;
        v_rows(v_n).make_raw := v_make;
        v_rows(v_n).model_raw := v_model;
        v_rows(v_n).year_raw := '2022';
        v_rows(v_n).category_raw := 'test_category_044'; -- lower-case, tests case-insensitive match
        v_rows(v_n).part_number_raw := ' ' || v_pn_happy || ' '; -- padding, tests TRIM
        v_rows(v_n).service_names_raw := 'test_service_044_1 | TEST_SERVICE_044_2'; -- mixed case + spacing

        v_n := v_n + 1; v_row_bad_make := v_n;
        v_rows(v_n).make_raw := NULL;
        v_rows(v_n).model_raw := v_model;
        v_rows(v_n).year_raw := '2022';
        v_rows(v_n).category_raw := 'TEST_CATEGORY_044';
        v_rows(v_n).part_number_raw := 'TEST-PN-044-BADMAKE';
        v_rows(v_n).service_names_raw := 'TEST_SERVICE_044_1';

        v_n := v_n + 1; v_row_bad_year := v_n;
        v_rows(v_n).make_raw := v_make;
        v_rows(v_n).model_raw := v_model;
        v_rows(v_n).year_raw := 'twenty-twenty-two';
        v_rows(v_n).category_raw := 'TEST_CATEGORY_044';
        v_rows(v_n).part_number_raw := 'TEST-PN-044-BADYEAR';
        v_rows(v_n).service_names_raw := 'TEST_SERVICE_044_1';

        v_n := v_n + 1; v_row_year_range := v_n;
        v_rows(v_n).make_raw := v_make;
        v_rows(v_n).model_raw := v_model;
        v_rows(v_n).year_raw := '1899';
        v_rows(v_n).category_raw := 'TEST_CATEGORY_044';
        v_rows(v_n).part_number_raw := 'TEST-PN-044-YEARRANGE';
        v_rows(v_n).service_names_raw := 'TEST_SERVICE_044_1';

        v_n := v_n + 1; v_row_bad_category := v_n;
        v_rows(v_n).make_raw := v_make;
        v_rows(v_n).model_raw := v_model;
        v_rows(v_n).year_raw := '2022';
        v_rows(v_n).category_raw := 'NOT_A_REAL_CATEGORY_044';
        v_rows(v_n).part_number_raw := 'TEST-PN-044-BADCAT';
        v_rows(v_n).service_names_raw := 'TEST_SERVICE_044_1';

        v_n := v_n + 1; v_row_bad_pn := v_n;
        v_rows(v_n).make_raw := v_make;
        v_rows(v_n).model_raw := v_model;
        v_rows(v_n).year_raw := '2022';
        v_rows(v_n).category_raw := 'TEST_CATEGORY_044';
        v_rows(v_n).part_number_raw := '   ';
        v_rows(v_n).service_names_raw := 'TEST_SERVICE_044_1';

        v_n := v_n + 1; v_row_bad_services := v_n;
        v_rows(v_n).make_raw := v_make;
        v_rows(v_n).model_raw := v_model;
        v_rows(v_n).year_raw := '2022';
        v_rows(v_n).category_raw := 'TEST_CATEGORY_044';
        v_rows(v_n).part_number_raw := 'TEST-PN-044-BADSERVICES';
        v_rows(v_n).service_names_raw := 'NOT_A_REAL_SERVICE_044';

        v_n := v_n + 1; v_row_empty_services := v_n;
        v_rows(v_n).make_raw := v_make;
        v_rows(v_n).model_raw := v_model;
        v_rows(v_n).year_raw := '2022';
        v_rows(v_n).category_raw := 'TEST_CATEGORY_044';
        v_rows(v_n).part_number_raw := 'TEST-PN-044-EMPTYSERVICES';
        v_rows(v_n).service_names_raw := ''; -- empty: "must contain at least one" case

        v_batch_id := pkg_import.start_batch(v_rows);
        DBMS_OUTPUT.PUT_LINE('Batch started: ' || v_batch_id || ' (' || v_n || ' rows)');

        DECLARE
            v_staged_count PLS_INTEGER;
        BEGIN
            SELECT COUNT(*) INTO v_staged_count FROM compat_import_stg WHERE batch_id = v_batch_id AND status = 'PENDING';
            report('start_batch stages every row as PENDING', v_staged_count = v_n, 'staged=' || v_staged_count);
        END;

        pkg_import.validate_batch(v_batch_id);

        DECLARE
            v_status     compat_import_stg.status%TYPE;
            v_error_text compat_import_stg.error_text%TYPE;

            FUNCTION row_status(p_row_num IN PLS_INTEGER) RETURN compat_import_stg.status%TYPE IS
                v_s compat_import_stg.status%TYPE;
            BEGIN
                SELECT status INTO v_s FROM compat_import_stg WHERE batch_id = v_batch_id AND row_num = p_row_num;
                RETURN v_s;
            END row_status;

            FUNCTION row_error(p_row_num IN PLS_INTEGER) RETURN compat_import_stg.error_text%TYPE IS
                v_e compat_import_stg.error_text%TYPE;
            BEGIN
                SELECT error_text INTO v_e FROM compat_import_stg WHERE batch_id = v_batch_id AND row_num = p_row_num;
                RETURN v_e;
            END row_error;
        BEGIN
            report('validate_batch marks the well-formed row VALID (case-insensitive category/service match, TRIMmed part number)',
                   row_status(v_row_happy) = 'VALID', 'status=' || row_status(v_row_happy));

            v_error_text := row_error(v_row_bad_make);
            report('validate_batch flags a missing MAKE', v_error_text LIKE '%MAKE is required%', v_error_text);

            v_error_text := row_error(v_row_bad_year);
            report('validate_batch flags a non-numeric YEAR', v_error_text LIKE '%4-digit number%', v_error_text);

            v_error_text := row_error(v_row_year_range);
            report('validate_batch flags a YEAR outside 1980-2100', v_error_text LIKE '%between 1980 and 2100%', v_error_text);

            v_error_text := row_error(v_row_bad_category);
            report('validate_batch flags an unknown CATEGORY', v_error_text LIKE '%does not match any module category%', v_error_text);

            v_error_text := row_error(v_row_bad_pn);
            report('validate_batch flags a blank PART_NUMBER', v_error_text LIKE '%PART_NUMBER is required%', v_error_text);

            v_error_text := row_error(v_row_bad_services);
            report('validate_batch flags an unknown SERVICE_NAMES entry', v_error_text LIKE '%is not a confirmed service%', v_error_text);

            v_error_text := row_error(v_row_empty_services);
            report('validate_batch flags empty SERVICE_NAMES', v_error_text LIKE '%must contain at least one service name%', v_error_text);
        END;

        ------------------------------------------------------------------
        -- apply_batch: only the VALID row should be applied; every
        -- INVALID row is skipped and left untouched.
        ------------------------------------------------------------------
        DECLARE
            v_applied PLS_INTEGER;
            v_skipped PLS_INTEGER;
            v_vehicle_id       vehicle_ref.vehicle_id%TYPE;
            v_entry_id         compatibility_entry.entry_id%TYPE;
            v_entry_source     compatibility_entry.source%TYPE;
            v_linked_count     PLS_INTEGER;
            v_found_entry_id   NUMBER;
            v_happy_status     compat_import_stg.status%TYPE;
            v_bad_make_status  compat_import_stg.status%TYPE;
        BEGIN
            pkg_import.apply_batch(v_batch_id, v_applied, v_skipped);

            report('apply_batch applies exactly the one VALID row', v_applied = 1, 'applied=' || v_applied);
            report('apply_batch skips every non-VALID row', v_skipped = v_n - 1, 'skipped=' || v_skipped || ' expected=' || (v_n - 1));

            SELECT vehicle_id INTO v_vehicle_id FROM vehicle_ref WHERE make = v_make AND model = v_model AND year = 2022;
            SELECT entry_id, source INTO v_entry_id, v_entry_source
              FROM compatibility_entry
             WHERE vehicle_id = v_vehicle_id AND category_id = v_category_id AND part_number = UPPER(v_pn_happy);
            SELECT COUNT(*) INTO v_linked_count FROM compatibility_service WHERE entry_id = v_entry_id;

            report('apply_batch creates the VEHICLE_REF row', v_vehicle_id IS NOT NULL, 'vehicle_id=' || v_vehicle_id);
            report('apply_batch creates a COMPATIBILITY_ENTRY with SOURCE = IMPORT', v_entry_source = 'IMPORT', 'source=' || v_entry_source);
            report('apply_batch links both confirmed services', v_linked_count = 2, 'linked_count=' || v_linked_count);

            v_found_entry_id := pkg_compat.find_match(v_vehicle_id, v_category_id, v_pn_happy);
            report('pkg_compat.find_match now matches the imported Part Number', v_found_entry_id = v_entry_id, 'found=' || v_found_entry_id);

            SELECT status INTO v_happy_status FROM compat_import_stg WHERE batch_id = v_batch_id AND row_num = v_row_happy;
            SELECT status INTO v_bad_make_status FROM compat_import_stg WHERE batch_id = v_batch_id AND row_num = v_row_bad_make;
            report('apply_batch marks the applied row APPLIED', v_happy_status = 'APPLIED', 'status=' || v_happy_status);
            report('apply_batch leaves an INVALID row untouched', v_bad_make_status = 'INVALID', 'status=' || v_bad_make_status);
        END;

        ------------------------------------------------------------------
        -- Re-running apply_batch on the same batch must be a no-op (no
        -- VALID rows remain) -- "never duplicates".
        ------------------------------------------------------------------
        DECLARE
            v_applied PLS_INTEGER;
            v_skipped PLS_INTEGER;
        BEGIN
            pkg_import.apply_batch(v_batch_id, v_applied, v_skipped);
            report('re-running apply_batch on an already-applied batch applies nothing further',
                   v_applied = 0 AND v_skipped = v_n, 'applied=' || v_applied || ' skipped=' || v_skipped);
        END;

        ------------------------------------------------------------------
        -- get_batch_rows: pipelined preview source returns every row.
        ------------------------------------------------------------------
        DECLARE
            v_row_count PLS_INTEGER;
        BEGIN
            SELECT COUNT(*) INTO v_row_count FROM TABLE(pkg_import.get_batch_rows(v_batch_id));
            report('get_batch_rows returns every row of the batch', v_row_count = v_n, 'row_count=' || v_row_count);
        END;
    END;

    ----------------------------------------------------------------------
    -- Never-downgrade + additive-only test: a pre-existing ADMIN_CONFIRMED
    -- entry (pkg_review, TASK-040) linked only to v_service_1_id must keep
    -- its SOURCE and gain v_service_2_id as an additional link when an
    -- import batch for the same Part Number is applied -- never downgraded
    -- to IMPORT, and the existing link is never removed (unlike
    -- pkg_review's full-replace sync).
    ----------------------------------------------------------------------
    DECLARE
        v_vehicle_id    vehicle_ref.vehicle_id%TYPE;
        v_pre_entry_id  compatibility_entry.entry_id%TYPE;
        v_rows          pkg_import.t_row_input_tab;
        v_batch_id      VARCHAR2(50);
        v_applied       PLS_INTEGER;
        v_skipped       PLS_INTEGER;
        v_entry_source  compatibility_entry.source%TYPE;
        v_has_service_1 PLS_INTEGER;
        v_has_service_2 PLS_INTEGER;
    BEGIN
        INSERT INTO vehicle_ref (make, model, year) VALUES (v_make, v_model, 2023) RETURNING vehicle_id INTO v_vehicle_id;
        INSERT INTO compatibility_entry (vehicle_id, category_id, part_number, source)
            VALUES (v_vehicle_id, v_category_id, v_pn_admin, 'ADMIN_CONFIRMED')
            RETURNING entry_id INTO v_pre_entry_id;
        INSERT INTO compatibility_service (entry_id, service_id) VALUES (v_pre_entry_id, v_service_1_id);

        v_rows(1).make_raw := v_make;
        v_rows(1).model_raw := v_model;
        v_rows(1).year_raw := '2023';
        v_rows(1).category_raw := 'TEST_CATEGORY_044';
        v_rows(1).part_number_raw := v_pn_admin;
        v_rows(1).service_names_raw := 'TEST_SERVICE_044_2'; -- a different service than the one already linked

        v_batch_id := pkg_import.start_batch(v_rows);
        pkg_import.validate_batch(v_batch_id);
        pkg_import.apply_batch(v_batch_id, v_applied, v_skipped);

        SELECT source INTO v_entry_source FROM compatibility_entry WHERE entry_id = v_pre_entry_id;
        SELECT COUNT(*) INTO v_has_service_1 FROM compatibility_service WHERE entry_id = v_pre_entry_id AND service_id = v_service_1_id;
        SELECT COUNT(*) INTO v_has_service_2 FROM compatibility_service WHERE entry_id = v_pre_entry_id AND service_id = v_service_2_id;

        report('apply_batch never downgrades an ADMIN_CONFIRMED entry back to IMPORT',
               v_entry_source = 'ADMIN_CONFIRMED', 'source=' || v_entry_source);
        report('apply_batch never removes a service link that was already there (additive only)',
               v_has_service_1 = 1, 'has_service_1=' || v_has_service_1);
        report('apply_batch adds the newly-imported service alongside the existing one',
               v_has_service_2 = 1, 'has_service_2=' || v_has_service_2);
    END;

    ----------------------------------------------------------------------
    -- Summary + cleanup
    ----------------------------------------------------------------------
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');
    DBMS_OUTPUT.PUT_LINE('TASK-044 pkg_import tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');

    ROLLBACK; -- discard every fixture row above, including everything apply_batch itself wrote.

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-044 pkg_import tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
