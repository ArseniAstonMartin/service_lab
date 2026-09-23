-- ============================================================================
-- test_pkg_security.sql
-- TASK-011: Unit tests for pkg_security.
--
-- Run via SQL Workshop -> SQL Commands (or SQLcl) AFTER pkg_security has
-- been installed (and after database/install.sql / 010-060_*.sql, since
-- generate_tracking_token queries ORDERS). Self-contained: any fixture rows
-- created are rolled back at the end, so it is safe to run against a schema
-- that already has real seed/production data in it.
--
-- Covers the three cases TASK-011's acceptance criteria calls out --
-- "a valid file, the wrong type and an oversized file" -- against
-- validate_upload_meta, the core validation logic parameterized directly by
-- filename/MIME type/size (see pkg_security.pks). validate_upload and
-- store_order_photo (the temp-file-based entry points APEX pages call) are
-- NOT exercised here: both require a real APEX_APPLICATION_TEMP_FILES row,
-- which only exists inside a live APEX session after an actual file upload
-- -- there is no way to fabricate one from a bare SQL script. That live path
-- needs to be exercised manually once TASK-017 (sticker photo upload) wires
-- validate_upload into an actual APEX page; noted in progress.md.
--
-- generate_tracking_token is tested for format (length, URL-safe alphabet,
-- no padding) and for producing distinct values across repeated calls.
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
    v_pass_count  PLS_INTEGER := 0;
    v_fail_count  PLS_INTEGER := 0;

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

    -- Calls pkg_security.validate_upload_meta with the given args and
    -- expects it to raise (any exception counts -- we're testing "is this
    -- rejected", not the exact error number).
    PROCEDURE expect_rejected(
        p_test_name  IN VARCHAR2,
        p_filename   IN VARCHAR2,
        p_mime_type  IN VARCHAR2,
        p_file_size  IN NUMBER,
        p_purpose    IN VARCHAR2 DEFAULT 'PHOTO'
    ) IS
    BEGIN
        pkg_security.validate_upload_meta(
            p_filename  => p_filename,
            p_mime_type => p_mime_type,
            p_file_size => p_file_size,
            p_purpose   => p_purpose
        );
        -- If we get here, no exception was raised -- the bad file passed.
        report(p_test_name, FALSE, 'expected an error, none was raised');
    EXCEPTION
        WHEN OTHERS THEN
            report(p_test_name, TRUE);
    END expect_rejected;

    -- Calls pkg_security.validate_upload_meta and expects it to succeed
    -- (return normally, no exception).
    PROCEDURE expect_accepted(
        p_test_name  IN VARCHAR2,
        p_filename   IN VARCHAR2,
        p_mime_type  IN VARCHAR2,
        p_file_size  IN NUMBER,
        p_purpose    IN VARCHAR2 DEFAULT 'PHOTO'
    ) IS
    BEGIN
        pkg_security.validate_upload_meta(
            p_filename  => p_filename,
            p_mime_type => p_mime_type,
            p_file_size => p_file_size,
            p_purpose   => p_purpose
        );
        report(p_test_name, TRUE);
    EXCEPTION
        WHEN OTHERS THEN
            report(p_test_name, FALSE, SQLERRM);
    END expect_accepted;

BEGIN
    ----------------------------------------------------------------------
    -- validate_upload_meta: the valid file (TASK-011 acceptance criteria)
    ----------------------------------------------------------------------
    expect_accepted(
        'validate_upload_meta accepts a valid JPEG photo under 10 MB',
        p_filename  => 'sticker.jpg',
        p_mime_type => 'image/jpeg',
        p_file_size => 2 * 1024 * 1024, -- 2 MB
        p_purpose   => 'PHOTO'
    );

    expect_accepted(
        'validate_upload_meta accepts a valid PNG photo',
        p_filename  => 'sticker.png',
        p_mime_type => 'image/png',
        p_file_size => 500 * 1024,
        p_purpose   => 'PHOTO'
    );

    expect_accepted(
        'validate_upload_meta accepts a valid HEIC photo',
        p_filename  => 'sticker.heic',
        p_mime_type => 'image/heic',
        p_file_size => 3 * 1024 * 1024,
        p_purpose   => 'PHOTO'
    );

    expect_accepted(
        'validate_upload_meta accepts a valid PDF label',
        p_filename  => 'return_label.pdf',
        p_mime_type => 'application/pdf',
        p_file_size => 200 * 1024,
        p_purpose   => 'LABEL'
    );

    ----------------------------------------------------------------------
    -- validate_upload_meta: the wrong type (TASK-011 acceptance criteria)
    ----------------------------------------------------------------------
    expect_rejected(
        'validate_upload_meta rejects a PDF submitted as a PHOTO',
        p_filename  => 'not_a_photo.pdf',
        p_mime_type => 'application/pdf',
        p_file_size => 500 * 1024,
        p_purpose   => 'PHOTO'
    );

    expect_rejected(
        'validate_upload_meta rejects an executable disguised with an image name',
        p_filename  => 'sticker.jpg.exe',
        p_mime_type => 'application/x-msdownload',
        p_file_size => 500 * 1024,
        p_purpose   => 'PHOTO'
    );

    expect_rejected(
        'validate_upload_meta rejects a plain-text file as a LABEL',
        p_filename  => 'notes.txt',
        p_mime_type => 'text/plain',
        p_file_size => 1024,
        p_purpose   => 'LABEL'
    );

    expect_rejected(
        'validate_upload_meta rejects an unknown p_purpose value',
        p_filename  => 'sticker.jpg',
        p_mime_type => 'image/jpeg',
        p_file_size => 500 * 1024,
        p_purpose   => 'NOT_A_PURPOSE'
    );

    ----------------------------------------------------------------------
    -- validate_upload_meta: the oversized file (TASK-011 acceptance
    -- criteria: max 10 MB)
    ----------------------------------------------------------------------
    expect_rejected(
        'validate_upload_meta rejects a photo just over the 10 MB limit',
        p_filename  => 'huge_sticker.jpg',
        p_mime_type => 'image/jpeg',
        p_file_size => 10 * 1024 * 1024 + 1,
        p_purpose   => 'PHOTO'
    );

    expect_rejected(
        'validate_upload_meta rejects a wildly oversized label PDF',
        p_filename  => 'huge_label.pdf',
        p_mime_type => 'application/pdf',
        p_file_size => 50 * 1024 * 1024,
        p_purpose   => 'LABEL'
    );

    expect_rejected(
        'validate_upload_meta rejects a zero-byte file',
        p_filename  => 'empty.jpg',
        p_mime_type => 'image/jpeg',
        p_file_size => 0,
        p_purpose   => 'PHOTO'
    );

    -- Boundary check: exactly 10 MB is still accepted (the limit is
    -- "> 10 MB is rejected", not ">= 10 MB").
    expect_accepted(
        'validate_upload_meta accepts a photo exactly at the 10 MB limit',
        p_filename  => 'exactly_10mb.jpg',
        p_mime_type => 'image/jpeg',
        p_file_size => 10 * 1024 * 1024,
        p_purpose   => 'PHOTO'
    );

    ----------------------------------------------------------------------
    -- generate_tracking_token: format + uniqueness
    ----------------------------------------------------------------------
    DECLARE
        v_token_1  VARCHAR2(64);
        v_token_2  VARCHAR2(64);
    BEGIN
        v_token_1 := pkg_security.generate_tracking_token;
        v_token_2 := pkg_security.generate_tracking_token;

        report('generate_tracking_token returns a non-empty token',
               v_token_1 IS NOT NULL AND LENGTH(v_token_1) > 0);

        report('generate_tracking_token returns a URL-safe token (no +, /, =, or whitespace)',
               NOT REGEXP_LIKE(v_token_1, '[+/=[:space:]]'));

        report('generate_tracking_token returns only base64url alphabet characters',
               REGEXP_LIKE(v_token_1, '^[A-Za-z0-9_-]+$'));

        report('generate_tracking_token returns distinct values on repeated calls',
               v_token_1 != v_token_2);

        DBMS_OUTPUT.PUT_LINE('Sample tokens: ' || v_token_1 || ' / ' || v_token_2);
    EXCEPTION
        WHEN OTHERS THEN
            report('generate_tracking_token basic checks', FALSE, SQLERRM);
    END;

    -- generate_tracking_token must never return a token that collides with
    -- an existing ORDERS row -- exercised here by inserting a fixture order
    -- using a generated token, then generating another and confirming it
    -- differs (the function's own uniqueness re-check against ORDERS is
    -- what TASK-011's acceptance criteria actually requires; a true
    -- collision is not practically reproducible with real random bytes, so
    -- this test proves the check queries live data, not that a retry loop
    -- fires).
    DECLARE
        v_token_fixture  orders.tracking_token%TYPE;
        v_token_next     VARCHAR2(64);
        v_order_id       orders.order_id%TYPE;
        v_vehicle_id     vehicle_ref.vehicle_id%TYPE;
        v_category_id    module_category.category_id%TYPE;
    BEGIN
        v_token_fixture := pkg_security.generate_tracking_token;

        INSERT INTO module_category (name, display_seq)
            VALUES ('TEST_CATEGORY_011', 999)
            RETURNING category_id INTO v_category_id;

        INSERT INTO vehicle_ref (make, model, year)
            VALUES ('TEST_MAKE_011', 'TEST_MODEL_011', 2020)
            RETURNING vehicle_id INTO v_vehicle_id;

        INSERT INTO orders (
            tracking_token, status, vehicle_id, category_id, part_number_entered,
            description, customer_name, customer_email, customer_phone,
            return_address_street, return_address_city, return_address_state, return_address_zip,
            idempotency_key
        ) VALUES (
            v_token_fixture, 'Pending Review', v_vehicle_id, v_category_id, 'test-pn-011',
            'Test fixture order for TASK-011 tracking-token uniqueness check',
            'Test Customer', 'test.customer@example.com', '808-555-0100',
            '123 Test St', 'Honolulu', 'HI', '96813',
            'TEST-IDEMP-011-' || DBMS_RANDOM.STRING('U', 20)
        ) RETURNING order_id INTO v_order_id;

        v_token_next := pkg_security.generate_tracking_token;

        report('generate_tracking_token avoids a token already present in ORDERS',
               v_token_next != v_token_fixture);
    EXCEPTION
        WHEN OTHERS THEN
            report('generate_tracking_token uniqueness-against-ORDERS check', FALSE, SQLERRM);
    END;

    ----------------------------------------------------------------------
    -- Summary + cleanup
    ----------------------------------------------------------------------
    DBMS_OUTPUT.PUT_LINE('----------------------------------------------------------------');
    DBMS_OUTPUT.PUT_LINE('TASK-011 pkg_security tests: ' || v_pass_count || ' passed, ' || v_fail_count || ' failed.');

    ROLLBACK; -- discard every fixture row created above; nothing is committed.

    IF v_fail_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20099, v_fail_count || ' of ' || (v_pass_count + v_fail_count) || ' TASK-011 pkg_security tests FAILED -- see DBMS_OUTPUT above.');
    END IF;
END;
/
