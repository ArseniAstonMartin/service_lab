-- ============================================================================
-- pkg_import.pkb
-- TASK-044: see pkg_import.pks for the public contract, the CSV format and
-- design rationale.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY pkg_import AS

    ----------------------------------------------------------------------------
    -- t_text_tab (private)
    -- Plain trimmed-string collection, used only to hold the pipe-split
    -- pieces of SERVICE_NAMES_RAW -- not exposed in the spec since neither
    -- validate_batch nor apply_batch's caller ever needs the split result
    -- itself, only its effect (VALID/INVALID, or the COMPATIBILITY_SERVICE
    -- rows it produces).
    ----------------------------------------------------------------------------
    TYPE t_text_tab IS TABLE OF VARCHAR2(200) INDEX BY PLS_INTEGER;

    ----------------------------------------------------------------------------
    -- split_pipe (private)
    -- Splits p_text on '|' into trimmed, non-empty pieces (an empty piece --
    -- e.g. from "Cloning||VIN Write" or a trailing "|" -- is silently
    -- dropped rather than becoming a spurious "" entry that would then fail
    -- the service-name lookup with a confusing empty-string error). NULL or
    -- empty p_text returns an empty (COUNT = 0) collection, not an error --
    -- callers decide what an empty result means for their own context
    -- (validate_batch: "SERVICE_NAMES must contain at least one service
    -- name"; apply_batch never sees this case, since a row reaching it was
    -- already validated to have at least one).
    ----------------------------------------------------------------------------
    FUNCTION split_pipe(p_text IN VARCHAR2) RETURN t_text_tab IS
        l_result    t_text_tab;
        l_remaining VARCHAR2(4000) := p_text;
        l_pos       PLS_INTEGER;
        l_piece     VARCHAR2(200);
    BEGIN
        IF p_text IS NULL THEN
            RETURN l_result;
        END IF;

        LOOP
            l_pos := INSTR(l_remaining, '|');
            IF l_pos = 0 THEN
                l_piece := TRIM(l_remaining);
                IF l_piece IS NOT NULL THEN
                    l_result(l_result.COUNT + 1) := l_piece;
                END IF;
                EXIT;
            ELSE
                l_piece := TRIM(SUBSTR(l_remaining, 1, l_pos - 1));
                IF l_piece IS NOT NULL THEN
                    l_result(l_result.COUNT + 1) := l_piece;
                END IF;
                l_remaining := SUBSTR(l_remaining, l_pos + 1);
            END IF;
        END LOOP;

        RETURN l_result;
    END split_pipe;

    ----------------------------------------------------------------------------
    -- append_error (private)
    -- Accumulates validate_batch's per-row problems into one
    -- semicolon-separated ERROR_TEXT, rather than stopping at the first
    -- problem -- an admin fixing a bad CSV row wants every issue with that
    -- row in one pass, not one validate_batch re-run per problem.
    ----------------------------------------------------------------------------
    FUNCTION append_error(p_existing IN VARCHAR2, p_new IN VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        IF p_existing IS NULL THEN
            RETURN p_new;
        ELSE
            RETURN p_existing || '; ' || p_new;
        END IF;
    END append_error;

    ----------------------------------------------------------------------------
    -- start_batch
    ----------------------------------------------------------------------------
    FUNCTION start_batch(p_rows IN t_row_input_tab) RETURN VARCHAR2 IS
        l_batch_id VARCHAR2(50);
    BEGIN
        IF p_rows.COUNT = 0 THEN
            RAISE_APPLICATION_ERROR(-20140,
                'pkg_import.start_batch: p_rows is empty -- nothing to import.');
        END IF;

        l_batch_id := 'IMPB-' || TO_CHAR(SYSTIMESTAMP, 'YYYYMMDDHH24MISS') || '-' || DBMS_RANDOM.STRING('U', 6);

        FOR i IN 1 .. p_rows.COUNT LOOP
            INSERT INTO compat_import_stg (
                batch_id, row_num, make_raw, model_raw, year_raw,
                category_raw, part_number_raw, service_names_raw
            ) VALUES (
                l_batch_id, i, p_rows(i).make_raw, p_rows(i).model_raw, p_rows(i).year_raw,
                p_rows(i).category_raw, p_rows(i).part_number_raw, p_rows(i).service_names_raw
            );
        END LOOP;

        RETURN l_batch_id;
    END start_batch;

    ----------------------------------------------------------------------------
    -- validate_batch
    ----------------------------------------------------------------------------
    PROCEDURE validate_batch(p_batch_id IN VARCHAR2) IS
        l_batch_count   PLS_INTEGER;
        l_category_id   module_category.category_id%TYPE;
        l_errors        VARCHAR2(4000);
        l_names         t_text_tab;
        l_service_count PLS_INTEGER;
        l_year_num      PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO l_batch_count FROM compat_import_stg WHERE batch_id = p_batch_id;
        IF l_batch_count = 0 THEN
            RAISE_APPLICATION_ERROR(-20141,
                'pkg_import.validate_batch: no batch found for BATCH_ID "' || p_batch_id || '".');
        END IF;

        FOR rec IN (
            SELECT stg_id, make_raw, model_raw, year_raw, category_raw, part_number_raw, service_names_raw
              FROM compat_import_stg
             WHERE batch_id = p_batch_id
               AND status = 'PENDING'
             ORDER BY row_num
        ) LOOP
            l_errors      := NULL;
            l_category_id := NULL;

            IF TRIM(rec.make_raw) IS NULL THEN
                l_errors := append_error(l_errors, 'MAKE is required.');
            ELSIF LENGTH(TRIM(rec.make_raw)) > 50 THEN
                l_errors := append_error(l_errors, 'MAKE exceeds 50 characters.');
            END IF;

            IF TRIM(rec.model_raw) IS NULL THEN
                l_errors := append_error(l_errors, 'MODEL is required.');
            ELSIF LENGTH(TRIM(rec.model_raw)) > 50 THEN
                l_errors := append_error(l_errors, 'MODEL exceeds 50 characters.');
            END IF;

            IF rec.year_raw IS NULL OR NOT REGEXP_LIKE(TRIM(rec.year_raw), '^[0-9]{4}$') THEN
                l_errors := append_error(l_errors, 'YEAR must be a 4-digit number.');
            ELSE
                l_year_num := TO_NUMBER(TRIM(rec.year_raw));
                IF l_year_num NOT BETWEEN 1980 AND 2100 THEN
                    l_errors := append_error(l_errors, 'YEAR must be between 1980 and 2100.');
                END IF;
            END IF;

            BEGIN
                SELECT category_id INTO l_category_id
                  FROM module_category
                 WHERE UPPER(name) = UPPER(TRIM(rec.category_raw));
            EXCEPTION
                WHEN NO_DATA_FOUND THEN
                    l_errors := append_error(l_errors,
                        'CATEGORY "' || rec.category_raw || '" does not match any module category.');
            END;

            IF TRIM(rec.part_number_raw) IS NULL THEN
                l_errors := append_error(l_errors, 'PART_NUMBER is required.');
            ELSIF LENGTH(TRIM(rec.part_number_raw)) > 100 THEN
                l_errors := append_error(l_errors, 'PART_NUMBER exceeds 100 characters.');
            END IF;

            l_names := split_pipe(rec.service_names_raw);
            IF l_names.COUNT = 0 THEN
                l_errors := append_error(l_errors, 'SERVICE_NAMES must contain at least one service name.');
            ELSIF l_category_id IS NOT NULL THEN
                -- Only checkable once CATEGORY itself resolved -- an
                -- invalid category already produces its own error above,
                -- and "does SERVICE_NAMES match a category we couldn't
                -- resolve" has no useful answer to give.
                FOR i IN 1 .. l_names.COUNT LOOP
                    SELECT COUNT(*) INTO l_service_count
                      FROM service
                     WHERE category_id = l_category_id
                       AND UPPER(name) = UPPER(l_names(i));

                    IF l_service_count = 0 THEN
                        l_errors := append_error(l_errors,
                            'SERVICE_NAMES entry "' || l_names(i) || '" is not a confirmed service for category "'
                            || rec.category_raw || '".');
                    END IF;
                END LOOP;
            END IF;

            UPDATE compat_import_stg
               SET status     = CASE WHEN l_errors IS NULL THEN 'VALID' ELSE 'INVALID' END,
                   error_text = l_errors
             WHERE stg_id = rec.stg_id;
        END LOOP;
    END validate_batch;

    ----------------------------------------------------------------------------
    -- apply_batch
    ----------------------------------------------------------------------------
    PROCEDURE apply_batch(
        p_batch_id       IN  VARCHAR2,
        p_applied_count  OUT PLS_INTEGER,
        p_skipped_count  OUT PLS_INTEGER
    ) IS
        l_batch_count       PLS_INTEGER;
        l_category_id       module_category.category_id%TYPE;
        l_vehicle_id        vehicle_ref.vehicle_id%TYPE;
        l_entry_id          compatibility_entry.entry_id%TYPE;
        l_service_id        service.service_id%TYPE;
        l_make              vehicle_ref.make%TYPE;
        l_model             vehicle_ref.model%TYPE;
        l_year              vehicle_ref.year%TYPE;
        l_part_number_norm  compatibility_entry.part_number%TYPE;
        l_names             t_text_tab;
    BEGIN
        SELECT COUNT(*) INTO l_batch_count FROM compat_import_stg WHERE batch_id = p_batch_id;
        IF l_batch_count = 0 THEN
            RAISE_APPLICATION_ERROR(-20141,
                'pkg_import.apply_batch: no batch found for BATCH_ID "' || p_batch_id || '".');
        END IF;

        p_applied_count := 0;
        p_skipped_count := 0;

        FOR rec IN (
            SELECT stg_id, status, make_raw, model_raw, year_raw, category_raw, part_number_raw, service_names_raw
              FROM compat_import_stg
             WHERE batch_id = p_batch_id
             ORDER BY row_num
        ) LOOP
            IF rec.status != 'VALID' THEN
                -- Not (or no longer) applicable: never validated (still
                -- PENDING), failed validation (INVALID), or already applied
                -- by an earlier call to this procedure on this batch.
                p_skipped_count := p_skipped_count + 1;
                CONTINUE;
            END IF;

            SAVEPOINT sp_import_row;

            BEGIN
                l_make             := TRIM(rec.make_raw);
                l_model            := TRIM(rec.model_raw);
                l_year             := TO_NUMBER(TRIM(rec.year_raw));
                l_part_number_norm := UPPER(TRIM(rec.part_number_raw));

                SELECT category_id INTO l_category_id
                  FROM module_category
                 WHERE UPPER(name) = UPPER(TRIM(rec.category_raw));

                ----------------------------------------------------------
                -- VEHICLE_REF: add if missing (MERGE on its own natural
                -- key, UQ_VEHICLE_REF).
                ----------------------------------------------------------
                MERGE INTO vehicle_ref tgt
                USING (SELECT l_make AS make, l_model AS model, l_year AS year FROM dual) src
                ON (tgt.make = src.make AND tgt.model = src.model AND tgt.year = src.year)
                WHEN NOT MATCHED THEN INSERT (make, model, year)
                    VALUES (src.make, src.model, src.year);

                SELECT vehicle_id INTO l_vehicle_id
                  FROM vehicle_ref
                 WHERE make = l_make AND model = l_model AND year = l_year;

                ----------------------------------------------------------
                -- COMPATIBILITY_ENTRY: add if missing, SOURCE = 'IMPORT'.
                -- No WHEN MATCHED clause at all -- an existing entry's
                -- SOURCE is left completely untouched either way (never
                -- downgraded from ADMIN_CONFIRMED back to IMPORT; see
                -- pks header for why this is asymmetric with pkg_review).
                ----------------------------------------------------------
                MERGE INTO compatibility_entry tgt
                USING (
                    SELECT l_vehicle_id AS vehicle_id, l_category_id AS category_id, l_part_number_norm AS part_number
                      FROM dual
                ) src
                ON (tgt.vehicle_id = src.vehicle_id AND tgt.category_id = src.category_id AND tgt.part_number = src.part_number)
                WHEN NOT MATCHED THEN INSERT (vehicle_id, category_id, part_number, source)
                    VALUES (src.vehicle_id, src.category_id, src.part_number, 'IMPORT');

                SELECT entry_id INTO l_entry_id
                  FROM compatibility_entry
                 WHERE vehicle_id = l_vehicle_id AND category_id = l_category_id AND part_number = l_part_number_norm;

                ----------------------------------------------------------
                -- COMPATIBILITY_SERVICE: add each confirmed service link
                -- if missing -- additive only, never removes an existing
                -- link (see pks header).
                ----------------------------------------------------------
                l_names := split_pipe(rec.service_names_raw);
                FOR i IN 1 .. l_names.COUNT LOOP
                    SELECT service_id INTO l_service_id
                      FROM service
                     WHERE category_id = l_category_id AND UPPER(name) = UPPER(l_names(i));

                    MERGE INTO compatibility_service tgt
                    USING (SELECT l_entry_id AS entry_id, l_service_id AS service_id FROM dual) src
                    ON (tgt.entry_id = src.entry_id AND tgt.service_id = src.service_id)
                    WHEN NOT MATCHED THEN INSERT (entry_id, service_id)
                        VALUES (src.entry_id, src.service_id);
                END LOOP;

                UPDATE compat_import_stg SET status = 'APPLIED', error_text = NULL WHERE stg_id = rec.stg_id;
                p_applied_count := p_applied_count + 1;
            EXCEPTION
                WHEN OTHERS THEN
                    -- A row validate_batch marked VALID failed anyway --
                    -- something referenced (category/service) changed
                    -- between validation and this call. Roll back just
                    -- this row's writes, record why, and move on to the
                    -- next row rather than aborting the whole batch.
                    -- SQLERRM cannot be referenced directly inside a SQL
                    -- statement (live-confirmed 2026-09-24: ORA-00904,
                    -- invalid identifier "SQLERRM") -- it is a PL/SQL-only
                    -- function, so it must be captured into a local
                    -- variable first, same as every other error-logging
                    -- site in this schema (e.g. pkg_stripe.log_error).
                    DECLARE
                        l_err_text VARCHAR2(4000) := SUBSTR(SQLERRM, 1, 4000);
                    BEGIN
                        ROLLBACK TO SAVEPOINT sp_import_row;
                        UPDATE compat_import_stg
                           SET status = 'INVALID', error_text = l_err_text
                         WHERE stg_id = rec.stg_id;
                    END;
                    p_skipped_count := p_skipped_count + 1;
            END;
        END LOOP;
    END apply_batch;

    ----------------------------------------------------------------------------
    -- get_batch_rows
    ----------------------------------------------------------------------------
    FUNCTION get_batch_rows(p_batch_id IN VARCHAR2) RETURN t_stg_row_tab PIPELINED IS
    BEGIN
        FOR rec IN (
            SELECT stg_id, row_num, make_raw, model_raw, year_raw, category_raw,
                   part_number_raw, service_names_raw, status, error_text
              FROM compat_import_stg
             WHERE batch_id = p_batch_id
             ORDER BY row_num
        ) LOOP
            PIPE ROW (t_stg_row(
                rec.stg_id, rec.row_num, rec.make_raw, rec.model_raw, rec.year_raw,
                rec.category_raw, rec.part_number_raw, rec.service_names_raw, rec.status, rec.error_text
            ));
        END LOOP;

        RETURN;
    END get_batch_rows;

END pkg_import;
/
