-- ============================================================================
-- pkg_compat.pks
-- TASK-013: exact-match Part Number lookup and the confirmed-services list
-- for a matched compatibility entry.
--
-- This package is the ONLY place "is this Part Number supported?" is
-- decided (PRD 4.2: "the system never silently guesses"). find_match never
-- does a LIKE/fuzzy match -- an exact match on (vehicle_id, category_id,
-- normalized part_number) or nothing.
-- ============================================================================
CREATE OR REPLACE PACKAGE pkg_compat AUTHID DEFINER AS

    -- Row/collection types for get_services, declared here (not in the
    -- body) so SQL can consume the pipelined function via
    -- TABLE(pkg_compat.get_services(:AI_MATCHED_ENTRY_ID)) -- the pattern
    -- TASK-019's f100 service-selection Cards region will use as its source.
    TYPE t_service_row IS RECORD (
        service_id   service.service_id%TYPE,
        name         service.name%TYPE,
        price_tier   service.price_tier%TYPE,
        tier_amount  price_tier.amount%TYPE
    );
    TYPE t_service_tab IS TABLE OF t_service_row;

    -- ------------------------------------------------------------------------
    -- find_match
    -- Returns the matching COMPATIBILITY_ENTRY.ENTRY_ID for
    -- (p_vehicle_id, p_category_id, p_part_number), or NULL if there is no
    -- match.
    --
    -- Normalization: p_part_number is compared as UPPER(TRIM(p_part_number))
    -- -- nothing more (no punctuation stripping, no fuzzy matching) --
    -- against COMPATIBILITY_ENTRY.PART_NUMBER, which TRG_COMPAT_ENTRY_BIU
    -- (TASK-006) already stores as UPPER(TRIM()), so this is a plain exact
    -- string match on both sides, never a LIKE.
    --
    -- "No match" covers two distinct cases, both returning NULL:
    --   1. No COMPATIBILITY_ENTRY row exists for this
    --      (vehicle_id, category_id, part_number) triple at all.
    --   2. A COMPATIBILITY_ENTRY row exists, but has zero linked
    --      COMPATIBILITY_SERVICE rows (TASK-013 acceptance criteria: "An
    --      entry with zero linked services counts as no match").
    -- ------------------------------------------------------------------------
    FUNCTION find_match(
        p_vehicle_id   IN NUMBER,
        p_category_id  IN NUMBER,
        p_part_number  IN VARCHAR2
    ) RETURN NUMBER;

    -- ------------------------------------------------------------------------
    -- get_services
    -- Pipelined: the SERVICE rows confirmed supported for p_entry_id (i.e.
    -- linked via COMPATIBILITY_SERVICE), each with its current tier price
    -- already joined in. Ordered by SERVICE.NAME for a stable display order.
    -- Zero rows for an entry with no linked services, or an unknown
    -- p_entry_id -- never raises for either case, since a page/report
    -- source should not itself blow up on empty data.
    -- ------------------------------------------------------------------------
    FUNCTION get_services(p_entry_id IN NUMBER) RETURN t_service_tab PIPELINED;

END pkg_compat;
/
