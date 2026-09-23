-- ============================================================================
-- pkg_import.pks
-- TASK-044: staging, validation and MERGE for bulk compatibility imports
-- (PRD's admin-side "load a spreadsheet of known-good Part Numbers"
-- workflow -- the bulk counterpart to pkg_review.confirm_compatibility,
-- TASK-040, which confirms one Part Number at a time from an order).
--
-- CSV format (documented in full in README.md's "Bulk compatibility
-- import" section -- summarized here since it drives every column/
-- validation rule below):
--   MAKE, MODEL, YEAR, CATEGORY, PART_NUMBER, SERVICE_NAMES
-- One row per (vehicle, category, part number) combination.
--   MAKE / MODEL       free text, matched/created in VEHICLE_REF.
--   YEAR               a single 4-digit model year (1980-2100, matching
--                       VEHICLE_REF.YEAR's own CK_VEHICLE_REF_YEAR) -- not
--                       a range; a Make/Model spanning several years needs
--                       one CSV row per year, same as VEHICLE_REF itself
--                       (see its own DDL comment).
--   CATEGORY           one of the 5 fixed MODULE_CATEGORY names (e.g.
--                       "ECM/PCM") -- matched case-insensitively.
--   PART_NUMBER         the Part Number this row confirms compatibility
--                       for.
--   SERVICE_NAMES        one or more SERVICE.NAME values confirmed
--                       supported for this Part Number, PIPE-separated
--                       ("Cloning|VIN Write") -- matched case-insensitively
--                       against services in the row's own CATEGORY only.
--
-- Three-step workflow, matching the staging table's STATUS lifecycle
-- (COMPAT_IMPORT_STG.STATUS: PENDING -> VALID/INVALID -> APPLIED):
--   1. start_batch   stages every row as-is (no validation yet).
--   2. validate_batch marks each PENDING row VALID or INVALID, with a
--      human-readable ERROR_TEXT for the latter -- never raises for a bad
--      row itself, only for a batch-level problem (unknown batch).
--   3. apply_batch    MERGEs every VALID row into VEHICLE_REF/
--      COMPATIBILITY_ENTRY/COMPATIBILITY_SERVICE (SOURCE = 'IMPORT'),
--      marking each APPLIED as it goes; never touches an INVALID row.
-- Splitting these into three calls (rather than one do-everything
-- procedure) is what lets TASK-045's f94517 Page 31 show a preview
-- (get_batch_rows below) between staging and committing the import to the
-- live compatibility catalog.
-- ============================================================================
CREATE OR REPLACE PACKAGE pkg_import AUTHID DEFINER AS

    -- ------------------------------------------------------------------------
    -- One CSV data row as read by the caller (an APEX page process parsing
    -- an uploaded file, or a test script) -- raw text in every field,
    -- exactly as the CSV had it; start_batch stores it as-is, unvalidated.
    -- Associative array, dense from index 1, same convention as pkg_order's
    -- t_answer_input_tab/t_photo_input_tab and pkg_review's
    -- t_service_id_tab -- the only caller is PL/SQL, never a SQL query.
    -- ------------------------------------------------------------------------
    TYPE t_row_input IS RECORD (
        make_raw           VARCHAR2(200),
        model_raw          VARCHAR2(200),
        year_raw           VARCHAR2(200),
        category_raw       VARCHAR2(200),
        part_number_raw    VARCHAR2(200),
        service_names_raw  VARCHAR2(4000)
    );
    TYPE t_row_input_tab IS TABLE OF t_row_input INDEX BY PLS_INTEGER;

    -- Row/collection type for get_batch_rows, declared here (not in the
    -- body) so SQL can consume the pipelined function via
    -- TABLE(pkg_import.get_batch_rows(:P_BATCH_ID)) -- same pattern as
    -- pkg_compat.get_services/pkg_order_status.get_next_statuses -- the
    -- source TASK-045's f94517 Page 31 preview Interactive Report will use.
    TYPE t_stg_row IS RECORD (
        stg_id             compat_import_stg.stg_id%TYPE,
        row_num            compat_import_stg.row_num%TYPE,
        make_raw           compat_import_stg.make_raw%TYPE,
        model_raw          compat_import_stg.model_raw%TYPE,
        year_raw           compat_import_stg.year_raw%TYPE,
        category_raw       compat_import_stg.category_raw%TYPE,
        part_number_raw    compat_import_stg.part_number_raw%TYPE,
        service_names_raw  compat_import_stg.service_names_raw%TYPE,
        status             compat_import_stg.status%TYPE,
        error_text         compat_import_stg.error_text%TYPE
    );
    TYPE t_stg_row_tab IS TABLE OF t_stg_row;

    -- ------------------------------------------------------------------------
    -- start_batch
    -- Generates a new BATCH_ID (format IMPB-<YYYYMMDDHH24MISS>-<6 random
    -- uppercase chars> -- readable and, for all practical purposes,
    -- collision-free even for two batches started in the same second) and
    -- stages every row of p_rows into COMPAT_IMPORT_STG with STATUS =
    -- 'PENDING', ROW_NUM = 1, 2, 3, ... in p_rows order. Does not validate
    -- anything -- call validate_batch next. Raises -20140 if p_rows is
    -- empty.
    -- ------------------------------------------------------------------------
    FUNCTION start_batch(p_rows IN t_row_input_tab) RETURN VARCHAR2;

    -- ------------------------------------------------------------------------
    -- validate_batch
    -- Validates every PENDING row of p_batch_id (a row already VALID/
    -- INVALID/APPLIED from an earlier call is left untouched -- safe to
    -- call more than once on the same batch, e.g. after fixing referenced
    -- data). For each row, checks (collecting ALL problems found into one
    -- semicolon-separated ERROR_TEXT, not just the first):
    --   - MAKE_RAW / MODEL_RAW: present, and each <= 50 characters
    --     (VEHICLE_REF.MAKE/MODEL's width).
    --   - YEAR_RAW: a plain 4-digit number, 1980-2100 (VEHICLE_REF's own
    --     CK_VEHICLE_REF_YEAR range).
    --   - CATEGORY_RAW: matches an existing MODULE_CATEGORY.NAME
    --     (case-insensitive).
    --   - PART_NUMBER_RAW: present, and <= 100 characters
    --     (COMPATIBILITY_ENTRY.PART_NUMBER's width).
    --   - SERVICE_NAMES_RAW: present, splits (on '|') into at least one
    --     non-empty name, and every name matches an existing SERVICE.NAME
    --     *within the row's own CATEGORY_RAW* (case-insensitive) -- a
    --     service that exists but belongs to a different category is
    --     still an error, naming which service and which category it
    --     actually belongs to.
    -- A row with zero problems is marked VALID; otherwise INVALID with
    -- ERROR_TEXT set. Never raises for a bad row -- only for a batch-level
    -- problem: -20141 if p_batch_id does not exist (zero rows in
    -- COMPAT_IMPORT_STG for it).
    -- ------------------------------------------------------------------------
    PROCEDURE validate_batch(p_batch_id IN VARCHAR2);

    -- ------------------------------------------------------------------------
    -- apply_batch
    -- MERGEs every VALID row of p_batch_id into the live compatibility
    -- catalog, marking each APPLIED as it succeeds:
    --   - VEHICLE_REF: adds (MAKE_RAW, MODEL_RAW, YEAR_RAW) if missing
    --     (MERGE on its own UQ_VEHICLE_REF natural key).
    --   - COMPATIBILITY_ENTRY: adds (vehicle, category, PART_NUMBER_RAW)
    --     with SOURCE = 'IMPORT' if missing. If an entry already exists,
    --     its SOURCE is left exactly as-is -- an import NEVER downgrades
    --     an ADMIN_CONFIRMED entry (pkg_review, TASK-040) back to IMPORT;
    --     that asymmetry (pkg_review DOES upgrade IMPORT -> ADMIN_CONFIRMED)
    --     is intentional: an admin's explicit per-order confirmation is a
    --     stronger signal than a bulk file, in either direction.
    --   - COMPATIBILITY_SERVICE: adds a link for each of this row's
    --     confirmed services if missing -- ADDITIVE only, never removes an
    --     existing link (unlike pkg_review.confirm_compatibility's full
    --     replace-the-set semantics for one order's admin review; an
    --     import is understood as "here is more confirmed data", not "here
    --     is the complete, authoritative list", since it is normal to run
    --     several incremental import batches over time).
    -- Never duplicates: every write above is a MERGE keyed on the same
    -- natural/unique keys those tables already enforce, so re-running
    -- apply_batch (on the same batch, or a later batch with overlapping
    -- rows) is always a no-op for data already present.
    --
    -- Each row is applied under its own SAVEPOINT: if one row fails
    -- unexpectedly (e.g. a referenced SERVICE was deleted between
    -- validate_batch and this call -- validate_batch's own checks make
    -- every other failure mode here effectively unreachable for a row it
    -- already marked VALID), that row's writes are rolled back, the row is
    -- reset to INVALID with the runtime error as ERROR_TEXT, and the loop
    -- continues -- one bad row never aborts the rest of the batch.
    --
    -- p_applied_count / p_skipped_count: how many rows were newly marked
    -- APPLIED vs. left alone (already non-VALID -- INVALID, PENDING never
    -- validated, or already APPLIED from an earlier call). Raises -20141
    -- (same as validate_batch) if p_batch_id does not exist.
    -- ------------------------------------------------------------------------
    PROCEDURE apply_batch(
        p_batch_id       IN  VARCHAR2,
        p_applied_count  OUT PLS_INTEGER,
        p_skipped_count  OUT PLS_INTEGER
    );

    -- ------------------------------------------------------------------------
    -- get_batch_rows
    -- Pipelined: every COMPAT_IMPORT_STG row for p_batch_id, ordered by
    -- ROW_NUM -- the preview source TASK-045's f94517 Page 31 Interactive
    -- Report will use (TABLE(pkg_import.get_batch_rows(:P_BATCH_ID))), so
    -- an admin can see each row's status/error before committing to
    -- apply_batch. Zero rows for an unknown p_batch_id -- never raises,
    -- same "a report source should not itself blow up on empty data"
    -- reasoning pkg_compat.get_services documents for itself.
    -- ------------------------------------------------------------------------
    FUNCTION get_batch_rows(p_batch_id IN VARCHAR2) RETURN t_stg_row_tab PIPELINED;

END pkg_import;
/
