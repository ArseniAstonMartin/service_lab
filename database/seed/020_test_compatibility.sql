-- ============================================================================
-- 020_test_compatibility.sql
-- TASK-008: Seed data (part 2 of 2 -- see also seed/010_reference_data.sql).
--
-- Populates: VEHICLE_REF (test vehicles), COMPATIBILITY_ENTRY and
-- COMPATIBILITY_SERVICE (test compatibility entries).
--
-- Requirement (TASK-008 acceptance criteria): at least 3 test compatibility
-- entries across different makes and categories, with different supported
-- services, plus 1 entry with zero linked services (exercises the "match
-- found but zero services -> counts as no match" rule pkg_compat.find_match,
-- TASK-013, must implement).
--
-- Depends on seed/010_reference_data.sql (MODULE_CATEGORY, SERVICE rows must
-- already exist). MERGE-based throughout; safe to re-run.
--
-- Run via SQL Workshop -> SQL Scripts (or SQLcl) against a schema that
-- already has 010-050_*.sql and seed/010_reference_data.sql applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VEHICLE_REF: 4 test vehicles (3 makes, so entries below span different
-- makes as required). MERGE key: UNIQUE (make, model, year).
-- ----------------------------------------------------------------------------
MERGE INTO vehicle_ref tgt
USING (
    SELECT 'Toyota' AS make, 'Camry'   AS model, 2015 AS year FROM dual UNION ALL
    SELECT 'Honda',          'Accord',            2018        FROM dual UNION ALL
    SELECT 'Ford',           'F-150',             2016        FROM dual UNION ALL
    SELECT 'Toyota',         'Tacoma',            2012        FROM dual
) src
ON (tgt.make = src.make AND tgt.model = src.model AND tgt.year = src.year)
WHEN NOT MATCHED THEN INSERT (make, model, year)
    VALUES (src.make, src.model, src.year);

-- ----------------------------------------------------------------------------
-- COMPATIBILITY_ENTRY: 4 entries -- 3 with confirmed services (spanning 3
-- different makes and 3 different categories), plus 1 with zero linked
-- services (Toyota Tacoma / BCM / 'BCM-0000') to exercise the "entry exists
-- but zero services = no match" rule.
--
-- MERGE key: the same (vehicle_id, category_id, part_number) triple that
-- ux_compat_entry_lookup enforces as unique -- i.e. this MERGE mirrors the
-- exact-match lookup pkg_compat.find_match (TASK-013) will use.
-- ----------------------------------------------------------------------------
MERGE INTO compatibility_entry tgt
USING (
    SELECT vr.vehicle_id, mc.category_id, v.part_number, v.source
    FROM (
        SELECT 'Toyota' AS make, 'Camry'  AS model, 2015 AS year, 'ECM/PCM'            AS category_name, 'ABC123'   AS part_number, 'ADMIN_CONFIRMED' AS source FROM dual UNION ALL
        SELECT 'Honda',          'Accord',           2018,        'Airbag/SRS',                          'SRS-9911',                'IMPORT'                     FROM dual UNION ALL
        SELECT 'Ford',           'F-150',            2016,        'Instrument Cluster',                  'IC-4477',                 'IMPORT'                     FROM dual UNION ALL
        SELECT 'Toyota',         'Tacoma',           2012,        'BCM',                                 'BCM-0000',                'IMPORT'                     FROM dual
    ) v
    JOIN vehicle_ref     vr ON vr.make = v.make AND vr.model = v.model AND vr.year = v.year
    JOIN module_category mc ON mc.name = v.category_name
) src
ON (    tgt.vehicle_id  = src.vehicle_id
    AND tgt.category_id = src.category_id
    AND tgt.part_number = src.part_number)
WHEN MATCHED THEN UPDATE SET tgt.source = src.source
WHEN NOT MATCHED THEN INSERT (vehicle_id, category_id, part_number, source)
    VALUES (src.vehicle_id, src.category_id, src.part_number, src.source);

-- ----------------------------------------------------------------------------
-- COMPATIBILITY_SERVICE: link 3 of the 4 entries above to services (the 4th,
-- Toyota Tacoma / BCM-0000, is deliberately left with zero rows here).
--
-- ABC123 (Toyota Camry / ECM-PCM) links to BOTH Cloning and VIN Write, so
-- this entry also exercises "a Part Number that supports more than one
-- service" for TASK-019's service-selection step.
--
-- MERGE key: composite PK (entry_id, service_id).
-- ----------------------------------------------------------------------------
MERGE INTO compatibility_service tgt
USING (
    SELECT ce.entry_id, sv.service_id
    FROM (
        SELECT 'ABC123'   AS part_number, 'Cloning'          AS service_name FROM dual UNION ALL
        SELECT 'ABC123',                  'VIN Write'                       FROM dual UNION ALL
        SELECT 'SRS-9911',                'Crash Data Reset'                FROM dual UNION ALL
        SELECT 'IC-4477',                 'Cluster Repair'                  FROM dual
    ) v
    JOIN compatibility_entry ce ON ce.part_number = v.part_number
    JOIN service              sv ON sv.name = v.service_name
) src
ON (tgt.entry_id = src.entry_id AND tgt.service_id = src.service_id)
WHEN NOT MATCHED THEN INSERT (entry_id, service_id)
    VALUES (src.entry_id, src.service_id);
