-- ============================================================================
-- pkg_security.pks
-- TASK-011: tracking-token generation and upload validation/storage.
--
-- Owns two concerns kept together because both are "trust boundary" logic
-- that every later package/page must go through rather than reimplement:
--   1. ORDERS.TRACKING_TOKEN generation (PRD 10: "cryptographically random,
--      non-sequential ... can't be enumerated or guessed").
--   2. File-upload validation/storage (PRD 10: "size-limited and MIME-type-
--      restricted at the APEX item level" -- this package is the
--      server-side backstop behind that, not a replacement for it).
-- ============================================================================
CREATE OR REPLACE PACKAGE pkg_security AUTHID DEFINER AS

    -- ------------------------------------------------------------------------
    -- generate_tracking_token
    -- Returns a cryptographically random, URL-safe, non-sequential token
    -- (DBMS_CRYPTO.RANDOMBYTES(32) -> base64 -> URL-safe alphabet, no
    -- padding) guaranteed unique against ORDERS.TRACKING_TOKEN at the moment
    -- it is generated (retries on a collision, which -- at 32 random bytes
    -- -- is astronomically unlikely but checked anyway per the acceptance
    -- criteria). Does NOT insert anything; the caller (pkg_order.submit_order,
    -- TASK-015) uses the returned value when inserting the new ORDERS row.
    -- ------------------------------------------------------------------------
    FUNCTION generate_tracking_token RETURN VARCHAR2;

    -- ------------------------------------------------------------------------
    -- validate_upload_meta
    -- Core validation logic, parameterized directly by filename/MIME
    -- type/size so it can be exercised by unit tests (database/tests) without
    -- a live APEX session or an actual APEX_APPLICATION_TEMP_FILES row.
    -- Raises a readable exception (RAISE_APPLICATION_ERROR) if the file is
    -- empty, too large (> 10 MB), or not an allowed MIME type for p_purpose;
    -- does nothing (silently returns) if the file is valid.
    --
    -- p_purpose: 'PHOTO' (jpeg/png/heic -- module label photos, cloning
    -- donor/original photos) or 'LABEL' (pdf/image -- an admin-attached
    -- return shipping label, TASK-038).
    -- ------------------------------------------------------------------------
    PROCEDURE validate_upload_meta(
        p_filename   IN VARCHAR2,
        p_mime_type  IN VARCHAR2,
        p_file_size  IN NUMBER,
        p_purpose    IN VARCHAR2 DEFAULT 'PHOTO'
    );

    -- ------------------------------------------------------------------------
    -- validate_upload
    -- The entry point APEX pages actually call (TASK-017's server-side
    -- validation on the sticker-photo File Upload item, and TASK-038's label
    -- upload): looks up p_temp_file_name in APEX_APPLICATION_TEMP_FILES and
    -- delegates to validate_upload_meta. Raises a readable exception if no
    -- such temp file exists, or if validate_upload_meta rejects it.
    -- ------------------------------------------------------------------------
    PROCEDURE validate_upload(
        p_temp_file_name IN VARCHAR2,
        p_purpose        IN VARCHAR2 DEFAULT 'PHOTO'
    );

    -- ------------------------------------------------------------------------
    -- store_order_photo
    -- Validates (purpose is always 'PHOTO' -- ORDER_PHOTO never holds a
    -- LABEL-purpose upload, see body comment) and moves a file from
    -- APEX_APPLICATION_TEMP_FILES into a permanent ORDER_PHOTO row.
    -- p_photo_type is one of STICKER/DONOR/ORIGINAL (enforced by
    -- ck_order_photo_type, 040_constraints.sql -- not re-validated here to
    -- avoid duplicating that domain list in two places).
    -- ------------------------------------------------------------------------
    PROCEDURE store_order_photo(
        p_order_id        IN  NUMBER,
        p_photo_type      IN  VARCHAR2,
        p_temp_file_name  IN  VARCHAR2,
        p_photo_id        OUT NUMBER
    );

END pkg_security;
/
