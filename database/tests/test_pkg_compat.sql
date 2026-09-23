-- ============================================================================
-- test_pkg_compat.sql
-- TASK-013: Unit tests for pkg_compat.
--
-- Run via SQL Workshop -> SQL Commands (or SQLcl) AFTER pkg_compat has been
-- installed (which needs 010-060_*.sql). Self-contained: creates its own
-- TEST_-prefixed fixture rows (not the TASK-008 seed data, so this script
-- works whether or not seed/010_reference_data.sql + 020_test_compatibility
-- .sql have been run) and ROLLBACKs everything at the end.
--
-- Covers the three cases TASK-013's acceptance criteria calls out --
-- "match, no match, and match with zero services" -- plus the normalization
-- rule (UPPER(TRIM()) only) and the "never a LIKE/fuzzy match" rule.
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count       PLS_INTEGER := 0;
    v_fail_count       PLS_INTEGER := 0;

    v_category_id      module_category.category_id%TYPE;
    v_vehicle_id       vehicle_ref.vehicle_id%TYPE;
    v_service_a_id     service.service_id%TYPE;
    v_service_b_id     service.service_id%TYPE;
    v_entry_match_id   compatibility_entry.entry_id%TYPE;
    v_entry_zero_id    compatibility_entry.entry_id%TYPE;

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

    PROCEDURE expect_match(
        p_test_name    IN VARCHAR2,
        p_vehicle_id   IN NUMBER,
        p_category_id  IN NUMBER,
        p_part_number  IN VARCHAR2,
        p_expected_id  IN NUMBER
    ) IS
        v_result NUMBER;
    BEGIN
        v_result := pkg_compat.find_match(p_vehicle_id, p_category_id, p_part_number);
        report(p_test_name, v_result = p_expected_id,
               'expected=' || p_expected_id || ' actual=' || NVL(TO_CHAR(v_result), 'NULL'));
    EXCEPTION
        WHEN OTHERS THEN
            report(p_test_name, FALSE, SQLERRM);
    END expect_match;

    PROCEDURE expect_no_match(
        p_test_name    IN VARCHAR2,
        p_vehicle_id   IN NUMBER,
        p_category_id  IN NUMBER,
        p_part_number  IN VARCHAR2
    ) IS
        v_result NUMBER;
    BEGIN
        v_result := pkg_compat.find_match(p_vehicle_id, p_category_id, p_part_number);
        report(p_test_name, v_result IS NULL, 'actual=' || NVL(TO_CHAR(v_result), 'NULL'));
    EXCEPTION
        WHEN OTHERS THEN
            report(p_test_name, FALSE, SQLERRM);
    END expect_no_match;

BEGIN
    ----------------------------------------------------------------------
    -- Fixtures
    ----------------------------------------------------------------------
    INSERT INTO module_category (name, display_seq)
        VALUES ('TEST_CATEGORY_013', 999)
        RETURNING category_id INTO v_category_id;

    INSERT INTO vehicle_ref (make, model, year)
        VALUES ('TEST_MAKE_013', 'TEST_MODEL_013', 2021)
        RETURNING vehicle_id INTO v_vehicle_id;

    MERGE INTO price_tier tgt
    USING (SELECT 'T013' AS tier_code, 150 AS amount FROM dual) src
    ON (tgt.tier_code = src.tier_code)
    WHEN NOT MATCHED THEN INSERT (tier_code, amount) VALUES (src.tier_code, src.amount);

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_013_A', 'T013', 'TEST_SET_013', 'N')
        RETURNING service_id INTO v_service_a_id;

    INSERT INTO service (category_id, name, price_tier, question_set_code, needs_follow_up)
        VALUES (v_category_id, 'TEST_SERVICE_013_B', 'T013', 'TEST_SET_013', 'N')
        RETURNING service_id INTO v_service_b_id;

    -- Entry with two confirmed services -- the "match" case, and exercises
    -- get_services returning more than one row.
    INSERT INTO compatibility_entry (vehicle_id, category_id, part_number, source)
        VALUES (v_vehicle_id, v_category_id, 'TEST-PN-013-MATCH', 'ADMIN_CONFIRMED')
        RETURNING entry_id INTO v_entry_match_id;

    INSERT INTO compatibility_service (entry_id, service_id) VALUES (v_entry_match_id, v_service_a_id);
    INSERT INTO compatibility_service (entry_id, service_id) VALUES (v_entry_match_id, v_service_b_id);

    -- Entry with zero confirmed services -- the "match with zero services"
    -- case (must count as no match).
    INSERT INTO compatibility_entry (vehicle_id, category_id, part_number, source)
        VALUES (v_vehicle_id, v_category_id, 'TEST-PN-013-ZERO', 'IMPORT')
        RETURNING entry_id INTO v_entry_zero_id;

    DBMS_OUTPUT.PUT_LINE('Fixtures created: category=' || v_category_id || ' vehicle=' || v_vehicle_id
        || ' entry_match=' || v_entry_match_id || ' entry_zero=' || v_entry_zero_id);
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');

    ----------------------------------------------------------------------
    -- find_match: the match case (TASK-013 acceptance criteria)
    ----------------------------------------------------------------------
    expect_match('find_match returns the entry for an exact vehicle+category+part_number match',
        v_vehicle_id, v_category_id, 'TEST-PN-013-MATCH', v_entry_match_id);

    ----------------------------------------------------------------------
    -- find_match: normalization is UPPER(TRIM()) only
    ----------------------------------------------------------------------
    expect_match('find_match normalizes a lower-case part number (UPPER)',
        v_vehicle_id, v_category_id, 'test-pn-013-match', v_entry_match_id);

    expect_match('find_match normalizes a whitespace-padded part number (TRIM)',
        v_vehicle_id, v_category_id, '   TEST-PN-013-MATCH   ', v_entry_match_id);

    expect_match('find_match normalizes mixed case + padding together',
        v_vehicle_id, v_category_id, '  Test-Pn-013-Match  ', v_entry_match_id);

    ----------------------------------------------------------------------
    -- find_match: the no-match case -- no entry exists at all
    ----------------------------------------------------------------------
    expect_no_match('find_match returns NULL when no entry exists for the part number',
        v_vehicle_id, v_category_id, 'TEST-PN-013-NOMATCH');

    ----------------------------------------------------------------------
    -- find_match: never a LIKE/fuzzy match -- a substring/prefix of a real
    -- part number must NOT match.
    ----------------------------------------------------------------------
    expect_no_match('find_match does not fuzzy-match a prefix of a real part number',
        v_vehicle_id, v_category_id, 'TEST-PN-013-MAT');

    expect_no_match('find_match does not fuzzy-match a superstring of a real part number',
        v_vehicle_id, v_category_id, 'TEST-PN-013-MATCH-EXTRA');

    ----------------------------------------------------------------------
    -- find_match: exact match requires vehicle_id AND category_id too, not
    -- just the part number
    ----------------------------------------------------------------------
    expect_no_match('find_match returns NULL for the right part number but the wrong vehicle_id',
        -999999, v_category_id, 'TEST-PN-013-MATCH');

    expect_no_match('find_match returns NULL for the right part number but the wrong category_id',
        v_vehicle_id, -999999, 'TEST-PN-013-MATCH');

    ----------------------------------------------------------------------
    -- find_match: the "match with zero services" case (TASK-013 acceptance
    -- criteria: counts as no match)
    ----------------------------------------------------------------------
    expect_no_match('find_match returns NULL for an entry that exists but has zero linked services',
        v_vehicle_id, v_category_id, 'TEST-PN-013-ZERO');

    ----------------------------------------------------------------------
    -- get_services
    ----------------------------------------------------------------------
    DECLARE
        v_count       PLS_INTEGER;
        v_names       VARCHAR2(400);
    BEGIN
        SELECT COUNT(*), LISTAGG(name, ',') WITHIN GROUP (ORDER BY name)
          INTO v_count, v_names
          FROM TABLE(pkg_compat.get_services(v_entry_match_id));

        report('get_services returns both confirmed services for the matched entry',
               v_count = 2 AND v_names = 'TEST_SERVICE_013_A,TEST_SERVICE_013_B',
               'count=' || v_count || ' names=' || v_names);
    EXCEPTION
        WHEN OTHERS THEN
            report('get_services returns both confirmed services for the matched entry', FALSE, SQLERRM);
    END;

    DECLARE
        v_amount  price_tier.amount%TYPE;
    BEGIN
        SELECT tier_amount INTO v_amount
          FROM TABLE(pkg_compat.get_services(v_entry_match_id))
         WHERE service_id = v_service_a_id;

        report('get_services joins in the correct current tier price',
               v_amount = 150, 'tier_amount=' || v_amount);
    EXCEPTION
        WHEN OTHERS THEN
            report('get_services joins in the correct current tier price', FALSE, SQLERRM);
    END;

    DECLARE
        v_count PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM TABLE(pkg_compat.get_services(v_entry_zero_id));
        report('get_services returns zero rows for an entry with no linked services', v_count = 0);
    EXCEPTION
        WHEN OTHERS THEN
            report('get_services returns zero rows for an entry with no linked services', FALSE, SQLERRM);
    END;

    DECLARE
        v_count PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM TABLE(pkg_compat.get_services(-999999));
        report('get_services returns zero rows rather than raising for an unknown entry_id', v_count = 0);
    EXCEPTION
        WHEN OTHERS THEN
            report('get_services returns zero rows rather than raising for an unknown entry_id', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- Summary + cleanup
    ----------------------------------------------------------------------
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');
    DBMS_OUTPUT.PUT_LINE('TASK-013 pkg_compat tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');

    ROLLBACK; -- discard every fixture row created above; nothing is committed.

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-013 pkg_compat tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
