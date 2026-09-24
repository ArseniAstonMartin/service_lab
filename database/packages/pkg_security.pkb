-- ============================================================================
-- pkg_security.pkb
-- TASK-011: tracking-token generation and upload validation/storage.
-- See pkg_security.pks for the public contract and design rationale.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY pkg_security AS

    c_max_file_size_bytes  CONSTANT NUMBER      := 10 * 1024 * 1024; -- 10 MB (TASK-011 acceptance criteria)
    c_token_bytes           CONSTANT PLS_INTEGER := 32;               -- SHA-256 digest width (TASK-011 acceptance criteria)
    c_max_token_attempts     CONSTANT PLS_INTEGER := 10;               -- retries on a UNIQUE collision, then gives up loudly

    -- --------------------------------------------------------------------------
    -- generate_tracking_token
    --
    -- DEVIATION from the original design (live-verified 2026-09-24): this
    -- workspace's schema has no EXECUTE privilege on DBMS_CRYPTO (a shared
    -- apex.oracle.com Free Evaluation Workspace restriction -- confirmed by
    -- a live PLS-00201 "identifier 'DBMS_CRYPTO' must be declared" compile
    -- error, not something this schema can GRANT itself). DBMS_CRYPTO.
    -- RANDOMBYTES is therefore replaced with STANDARD_HASH('...', 'SHA256')
    -- -- a native SQL function needing no package privilege at all -- fed
    -- with SYS_GUID() (server-generated, effectively unguessable) plus
    -- DBMS_RANDOM (confirmed available: already used elsewhere in this
    -- schema, e.g. pkg_import.start_batch's batch id) and a high-precision
    -- timestamp for additional entropy. The SHA-256 digest is 32 bytes,
    -- matching c_token_bytes exactly, so the rest of this function (unique-
    -- ness retry loop, base64 encoding) is unchanged.
    -- --------------------------------------------------------------------------
    -- --------------------------------------------------------------------------
    -- sha256_raw (private)
    -- STANDARD_HASH cannot be called directly as a plain PL/SQL function --
    -- live-confirmed 2026-09-24: PLS-00201 "identifier 'STANDARD_HASH' must
    -- be declared". Like a handful of other SQL-only built-ins, it is only
    -- recognized inside an embedded SQL statement, so it must be invoked via
    -- SELECT ... INTO ... FROM DUAL. This wraps that so every other
    -- STANDARD_HASH use in this body stays a plain function call.
    -- --------------------------------------------------------------------------
    FUNCTION sha256_raw(p_input IN RAW) RETURN RAW IS
        l_out RAW(32);
    BEGIN
        SELECT STANDARD_HASH(p_input, 'SHA256') INTO l_out FROM dual;
        RETURN l_out;
    END sha256_raw;

    FUNCTION generate_tracking_token RETURN VARCHAR2 IS
        l_raw      RAW(32);
        l_token    VARCHAR2(64);
        l_exists   PLS_INTEGER;
    BEGIN
        FOR i IN 1 .. c_max_token_attempts LOOP
            l_raw := sha256_raw(
                UTL_RAW.CONCAT(
                    SYS_GUID(),
                    SYS_GUID(),
                    UTL_RAW.CAST_TO_RAW(
                        DBMS_RANDOM.STRING('X', 64)
                        || TO_CHAR(SYSTIMESTAMP, 'YYYYMMDDHH24MISSFF9')
                        || TO_CHAR(i)
                    )
                )
            );

            -- Standard base64 -> URL-safe base64, no padding:
            --   UTL_ENCODE.BASE64_ENCODE inserts a CRLF every 64 output
            --   chars (a 32-byte input encodes to 44 chars, so none in
            --   practice, but stripped defensively for any future token
            --   length change);
            --   '+' -> '-' and '/' -> '_' (RFC 4648 section 5);
            --   trailing '=' padding is dropped -- not needed to decode a
            --   fixed-length token and avoids a character that isn't
            --   URL-path-safe without encoding.
            l_token := UTL_RAW.CAST_TO_VARCHAR2(UTL_ENCODE.BASE64_ENCODE(l_raw));
            l_token := REPLACE(REPLACE(l_token, CHR(13), ''), CHR(10), '');
            l_token := TRANSLATE(l_token, '+/', '-_');
            l_token := RTRIM(l_token, '=');

            SELECT COUNT(*) INTO l_exists FROM orders WHERE tracking_token = l_token;

            IF l_exists = 0 THEN
                RETURN l_token;
            END IF;
            -- Collision (practically never, at 32 random bytes): loop and
            -- draw a fresh one rather than erroring immediately.
        END LOOP;

        RAISE_APPLICATION_ERROR(-20050,
            'pkg_security.generate_tracking_token: could not generate a unique tracking token after '
            || c_max_token_attempts || ' attempts.');
    END generate_tracking_token;

    -- --------------------------------------------------------------------------
    -- validate_upload_meta
    -- --------------------------------------------------------------------------
    PROCEDURE validate_upload_meta(
        p_filename   IN VARCHAR2,
        p_mime_type  IN VARCHAR2,
        p_file_size  IN NUMBER,
        p_purpose    IN VARCHAR2 DEFAULT 'PHOTO'
    ) IS
        l_mime VARCHAR2(200) := LOWER(TRIM(p_mime_type));
    BEGIN
        IF p_purpose NOT IN ('PHOTO', 'LABEL') THEN
            RAISE_APPLICATION_ERROR(-20051,
                'pkg_security.validate_upload_meta: unknown purpose "' || p_purpose || '" (expected PHOTO or LABEL).');
        END IF;

        IF p_file_size IS NULL OR p_file_size <= 0 THEN
            RAISE_APPLICATION_ERROR(-20052,
                'The uploaded file "' || p_filename || '" is empty.');
        END IF;

        IF p_file_size > c_max_file_size_bytes THEN
            RAISE_APPLICATION_ERROR(-20053,
                'The uploaded file "' || p_filename || '" is too large ('
                || TO_CHAR(ROUND(p_file_size / 1024 / 1024, 1)) || ' MB). Maximum allowed size is 10 MB.');
        END IF;

        IF p_purpose = 'PHOTO'
           AND l_mime NOT IN ('image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif')
        THEN
            RAISE_APPLICATION_ERROR(-20054,
                'The uploaded file "' || p_filename || '" has an unsupported type (' || p_mime_type
                || '). Photos must be JPEG, PNG or HEIC.');
        END IF;

        IF p_purpose = 'LABEL'
           AND l_mime NOT IN ('application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif')
        THEN
            RAISE_APPLICATION_ERROR(-20054,
                'The uploaded file "' || p_filename || '" has an unsupported type (' || p_mime_type
                || '). Labels must be a PDF or an image (JPEG/PNG/HEIC).');
        END IF;
        -- Valid: fall through and return normally.
    END validate_upload_meta;

    -- --------------------------------------------------------------------------
    -- validate_upload
    -- --------------------------------------------------------------------------
    PROCEDURE validate_upload(
        p_temp_file_name IN VARCHAR2,
        p_purpose        IN VARCHAR2 DEFAULT 'PHOTO'
    ) IS
        l_filename   VARCHAR2(400);
        l_mime_type  VARCHAR2(200);
        l_file_size  NUMBER;
    BEGIN
        SELECT filename, mime_type, DBMS_LOB.GETLENGTH(blob_content)
          INTO l_filename, l_mime_type, l_file_size
          FROM apex_application_temp_files
         WHERE name = p_temp_file_name;

        validate_upload_meta(
            p_filename  => l_filename,
            p_mime_type => l_mime_type,
            p_file_size => l_file_size,
            p_purpose   => p_purpose
        );
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20055,
                'pkg_security.validate_upload: no uploaded file found for temp name "' || p_temp_file_name || '".');
    END validate_upload;

    -- --------------------------------------------------------------------------
    -- store_order_photo
    -- --------------------------------------------------------------------------
    PROCEDURE store_order_photo(
        p_order_id        IN  NUMBER,
        p_photo_type      IN  VARCHAR2,
        p_temp_file_name  IN  VARCHAR2,
        p_photo_id        OUT NUMBER
    ) IS
        l_blob BLOB;
    BEGIN
        -- ORDER_PHOTO rows (STICKER/DONOR/ORIGINAL, ck_order_photo_type) are
        -- always photographs of a module/label, never a PDF -- the one
        -- LABEL-purpose upload in this app (an admin-attached return
        -- shipping label, TASK-038) is validated the same way but goes
        -- straight into ORDERS.SHIPPING_LABEL, not into this table. So the
        -- purpose here is always 'PHOTO', not derived from p_photo_type.
        validate_upload(p_temp_file_name => p_temp_file_name, p_purpose => 'PHOTO');

        SELECT blob_content
          INTO l_blob
          FROM apex_application_temp_files
         WHERE name = p_temp_file_name;

        INSERT INTO order_photo (order_id, photo_type, photo_blob)
        VALUES (p_order_id, p_photo_type, l_blob)
        RETURNING photo_id INTO p_photo_id;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20055,
                'pkg_security.store_order_photo: no uploaded file found for temp name "' || p_temp_file_name || '".');
    END store_order_photo;

END pkg_security;
/
