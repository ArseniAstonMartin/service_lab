-- ============================================================================
-- 010_reference_data.sql
-- TASK-008: Seed data (part 1 of 2 -- see also seed/020_test_compatibility.sql).
--
-- Populates: MODULE_CATEGORY, PRICE_TIER, SERVICE, QUESTION_DEF, APP_SETTING.
-- All MERGE-based on each table's natural key, so this script is safe to
-- re-run any number of times without creating duplicates (per TASK-008
-- acceptance criteria).
--
-- Depends on 010_reference_tables.sql, 020_order_tables.sql,
-- 030_config_and_logs.sql and 040_constraints.sql (domain CHECKs on
-- ANSWER_TYPE/etc. must already exist so bad seed rows fail loudly here
-- rather than downstream).
--
-- Run via SQL Workshop -> SQL Scripts (or SQLcl) against a schema that
-- already has all of 010-050_*.sql applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- MODULE_CATEGORY (PRD 4.1 / section 6): the 5 fixed categories.
-- MERGE key: NAME (has a UNIQUE constraint, uq_module_category_name).
-- ----------------------------------------------------------------------------
MERGE INTO module_category tgt
USING (
    SELECT 'Airbag/SRS'          AS name, 10 AS display_seq FROM dual UNION ALL
    SELECT 'ECM/PCM',            20                          FROM dual UNION ALL
    SELECT 'TCM/TCU',            30                          FROM dual UNION ALL
    SELECT 'BCM',                40                          FROM dual UNION ALL
    SELECT 'Instrument Cluster', 50                          FROM dual
) src
ON (tgt.name = src.name)
WHEN MATCHED THEN UPDATE SET tgt.display_seq = src.display_seq
WHEN NOT MATCHED THEN INSERT (name, display_seq)
    VALUES (src.name, src.display_seq);

-- ----------------------------------------------------------------------------
-- PRICE_TIER (PRD 4.3/6/8): fixed $100/$200/$300/$400 grid. TIER_CODE is
-- already the natural key (PK), so it is also the MERGE key.
-- ----------------------------------------------------------------------------
MERGE INTO price_tier tgt
USING (
    SELECT '100' AS tier_code, 100.00 AS amount FROM dual UNION ALL
    SELECT '200',              200.00            FROM dual UNION ALL
    SELECT '300',              300.00            FROM dual UNION ALL
    SELECT '400',              400.00            FROM dual
) src
ON (tgt.tier_code = src.tier_code)
WHEN MATCHED THEN UPDATE SET tgt.amount = src.amount
WHEN NOT MATCHED THEN INSERT (tier_code, amount)
    VALUES (src.tier_code, src.amount);

-- ----------------------------------------------------------------------------
-- SERVICE: at least one service per module category, each mapped to a price
-- tier and a QUESTION_SET_CODE (SRS / CLONING / VIN_WRITE / RESTORATION).
-- NEEDS_FOLLOW_UP = 'Y' on the services PRD 4.4 calls out as typically
-- requiring post-install work (cloning, VIN write, crash-data reset).
--
-- MERGE key: (category_id via MODULE_CATEGORY.name, name) -- SERVICE.NAME has
-- no DB-level UNIQUE constraint, but is treated as the natural key here for
-- idempotent seeding (consistent with this script always being the sole
-- writer of these rows in v1).
-- ----------------------------------------------------------------------------
MERGE INTO service tgt
USING (
    SELECT mc.category_id,
           v.name, v.price_tier, v.question_set_code, v.needs_follow_up
    FROM (
        SELECT 'Airbag/SRS'          AS category_name, 'Crash Data Reset'   AS name, '100' AS price_tier, 'SRS'         AS question_set_code, 'Y' AS needs_follow_up FROM dual UNION ALL
        SELECT 'ECM/PCM',                               'Cloning',                    '300',              'CLONING',                          'Y'                  FROM dual UNION ALL
        SELECT 'ECM/PCM',                               'VIN Write',                  '200',              'VIN_WRITE',                        'Y'                  FROM dual UNION ALL
        SELECT 'TCM/TCU',                                'Module Restoration',        '200',              'RESTORATION',                      'N'                  FROM dual UNION ALL
        SELECT 'BCM',                                    'BCM Reset / Repair',        '200',              'RESTORATION',                      'N'                  FROM dual UNION ALL
        SELECT 'Instrument Cluster',                     'Cluster Repair',            '100',              'RESTORATION',                      'N'                  FROM dual
    ) v
    JOIN module_category mc ON mc.name = v.category_name
) src
ON (tgt.category_id = src.category_id AND tgt.name = src.name)
WHEN MATCHED THEN UPDATE SET
    tgt.price_tier        = src.price_tier,
    tgt.question_set_code = src.question_set_code,
    tgt.needs_follow_up   = src.needs_follow_up
WHEN NOT MATCHED THEN INSERT (category_id, name, price_tier, question_set_code, needs_follow_up)
    VALUES (src.category_id, src.name, src.price_tier, src.question_set_code, src.needs_follow_up);

-- ----------------------------------------------------------------------------
-- QUESTION_DEF (PRD 4.4): the SRS, CLONING, VIN_WRITE, RESTORATION and
-- FOLLOW_UP question sets. FOLLOW_UP is rendered in addition to a service's
-- own QUESTION_SET_CODE whenever SERVICE.NEEDS_FOLLOW_UP = 'Y' (TASK-020),
-- not selected as any service's primary set.
-- MERGE key: composite PK (QUESTION_SET_CODE, QUESTION_CODE).
-- ----------------------------------------------------------------------------
MERGE INTO question_def tgt
USING (
    -- SRS/Airbag (PRD 4.4: "was the vehicle in an accident; what error codes
    -- are present")
    SELECT 'SRS' AS question_set_code, 'ACCIDENT_YN'   AS question_code, 'Was the vehicle in an accident?'                    AS label, 'YES_NO'   AS answer_type, 'Y' AS is_required, 10 AS display_seq FROM dual UNION ALL
    SELECT 'SRS',                       'ERROR_CODES',                  'What error codes are present (if known)?',                    'TEXT',                'N',                20                  FROM dual UNION ALL

    -- Cloning (PRD 4.4: original/donor availability, part numbers, photos)
    SELECT 'CLONING',                   'ORIGINAL_AVAILABLE',           'Is the original (source) module available?',                 'YES_NO',               'Y',                10                  FROM dual UNION ALL
    SELECT 'CLONING',                   'DONOR_AVAILABLE',              'Is a donor module available?',                                'YES_NO',               'Y',                20                  FROM dual UNION ALL
    SELECT 'CLONING',                   'ORIGINAL_PART_NUMBER',         'Original module Part Number (if known)',                      'TEXT',                 'N',                30                  FROM dual UNION ALL
    SELECT 'CLONING',                   'DONOR_PART_NUMBER',            'Donor module Part Number (if known)',                         'TEXT',                 'N',                40                  FROM dual UNION ALL
    SELECT 'CLONING',                   'ORIGINAL_PHOTO',                'Photo of the original module label',                          'PHOTO',                'N',                50                  FROM dual UNION ALL
    SELECT 'CLONING',                   'DONOR_PHOTO',                   'Photo of the donor module label',                             'PHOTO',                'N',                60                  FROM dual UNION ALL

    -- VIN write (PRD 4.4: current VIN, required VIN, vehicle info)
    SELECT 'VIN_WRITE',                 'CURRENT_VIN',                   'Current VIN written to the module',                           'TEXT',                 'Y',                10                  FROM dual UNION ALL
    SELECT 'VIN_WRITE',                 'REQUIRED_VIN',                  'VIN the module needs to be written to',                       'TEXT',                 'Y',                20                  FROM dual UNION ALL
    SELECT 'VIN_WRITE',                 'VEHICLE_INFO',                  'Additional vehicle info (trim, options, etc.)',               'TEXTAREA',              'N',                30                  FROM dual UNION ALL

    -- Restoration/recovery (PRD 4.4: does it power on/communicate; what
    -- happened right before it failed)
    SELECT 'RESTORATION',               'POWERS_ON_YN',                  'Does the module currently power on?',                         'YES_NO',                'Y',                10                  FROM dual UNION ALL
    SELECT 'RESTORATION',               'COMMUNICATES_YN',               'Does the module currently communicate with the vehicle?',    'YES_NO',                'Y',                20                  FROM dual UNION ALL
    SELECT 'RESTORATION',               'FAILURE_CONTEXT',               'What happened right before the module failed?',              'TEXTAREA',              'Y',                30                  FROM dual UNION ALL

    -- Follow-up (PRD 4.4: "for any service that requires follow-up work
    -- after reinstalling the module ... asks whether the customer expects to
    -- need that follow-up work done and by whom"). Rendered in addition to
    -- the service's own set when SERVICE.NEEDS_FOLLOW_UP = 'Y' (TASK-020),
    -- not tied to any single service as its primary QUESTION_SET_CODE.
    SELECT 'FOLLOW_UP',                 'FOLLOWUP_NEEDED_YN',            'Do you expect to need follow-up work after reinstalling?',   'YES_NO',                'Y',                10                  FROM dual UNION ALL
    SELECT 'FOLLOW_UP',                 'FOLLOWUP_BY_WHOM',              'Who will perform that follow-up work (you, a shop, us)?',    'TEXT',                  'N',                20                  FROM dual
) src
ON (tgt.question_set_code = src.question_set_code AND tgt.question_code = src.question_code)
WHEN MATCHED THEN UPDATE SET
    tgt.label       = src.label,
    tgt.answer_type = src.answer_type,
    tgt.is_required = src.is_required,
    tgt.display_seq = src.display_seq
WHEN NOT MATCHED THEN INSERT (question_set_code, question_code, label, answer_type, is_required, display_seq)
    VALUES (src.question_set_code, src.question_code, src.label, src.answer_type, src.is_required, src.display_seq);

-- ----------------------------------------------------------------------------
-- APP_SETTING: the 4 keys the app actually reads (per the table comment in
-- 030_config_and_logs.sql). RETURN_SHIPPING_FEE is within the PRD 4.5/5.4
-- $20-30 range. ADMIN_EMAIL/MAIL_FROM/APP_BASE_URL are placeholder values
-- the business must replace with real addresses/domain before go-live --
-- flagged in each row's DESCRIPTION so an admin editing APP_SETTING later
-- sees the placeholder note, not just a bare value.
-- ----------------------------------------------------------------------------
MERGE INTO app_setting tgt
USING (
    SELECT 'RETURN_SHIPPING_FEE' AS setting_key, '25.00'                              AS setting_value, 'Flat return-shipping fee added to every order total (PRD 4.5/5.4: $20-30 range, admin-editable).' AS description FROM dual UNION ALL
    SELECT 'ADMIN_EMAIL',                         'admin@ecuservicelaboahu.example',                     'Recipient of email #5 (new order alert, PRD section 9). PLACEHOLDER -- replace with the real admin inbox before go-live.' FROM dual UNION ALL
    SELECT 'MAIL_FROM',                            'no-reply@ecuservicelaboahu.example',                  'APEX_MAIL sender address (PRD section 7). PLACEHOLDER -- replace with the approved/verified sender once SMTP relay is configured (TASK-027).' FROM dual UNION ALL
    SELECT 'APP_BASE_URL',                          'https://apex.oracle.com/pls/apex/wksp_hawaiiautomotive/', 'Base URL used to build the public tracking link in customer emails (TASK-028). PLACEHOLDER -- confirm the exact f100 app alias/path once TASK-009 creates the app.' FROM dual
) src
ON (tgt.setting_key = src.setting_key)
WHEN MATCHED THEN UPDATE SET
    tgt.description = src.description
    -- Intentionally does NOT overwrite setting_value on MATCHED: once an
    -- admin has edited a live setting (e.g. RETURN_SHIPPING_FEE), re-running
    -- this seed script must not silently revert their change. Only a brand
    -- new key gets its seed value; description stays in sync either way.
WHEN NOT MATCHED THEN INSERT (setting_key, setting_value, description)
    VALUES (src.setting_key, src.setting_value, src.description);
