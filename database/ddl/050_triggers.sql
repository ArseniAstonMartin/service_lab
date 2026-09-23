-- ============================================================================
-- 050_triggers.sql
-- TASK-006: Data integrity rules (part 2 of 2 -- see also 040_constraints.sql).
--
-- Adds:
--   - PKG_ORDER_STATUS_CTX     a minimal session-state package that lets
--                              pkg_order_status (TASK-012) mark "this UPDATE
--                              of ORDERS.STATUS is authorized", so the guard
--                              trigger below can tell a package-driven change
--                              apart from a direct/manual UPDATE.
--   - TRG_ORDERS_STATUS_GUARD  rejects any UPDATE of ORDERS.STATUS that
--                              wasn't authorized through PKG_ORDER_STATUS_CTX.
--   - TRG_ORDERS_BIU           sets CREATED_AT/UPDATED_AT and normalizes
--                              PART_NUMBER_ENTERED to UPPER(TRIM()).
--   - TRG_COMPAT_ENTRY_BIU     sets CREATED_AT/UPDATED_AT and normalizes
--                              PART_NUMBER to UPPER(TRIM()).
--
-- Run via SQL Workshop -> SQL Scripts (or SQLcl) against a schema that
-- already has 040_constraints.sql applied (needs ORDERS, COMPATIBILITY_ENTRY).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PKG_ORDER_STATUS_CTX
--
-- Deliberately minimal and created here (not under database/packages/, which
-- TASK-012 owns) because the guard trigger below has a hard dependency on it
-- existing first, and this package holds no business logic of its own --
-- just a session-scoped authorization flag. pkg_order_status (TASK-012) will
-- call ctx.allow_change / ctx.done_changing around its own UPDATE of
-- ORDERS.STATUS; every other caller (ad hoc SQL, a stray page process) will
-- trip the guard trigger and get a readable error instead of silently
-- corrupting the state machine.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PACKAGE pkg_order_status_ctx AS
    -- Call immediately before the UPDATE that changes ORDERS.STATUS, and
    -- call done_changing immediately after (in the same session/call stack),
    -- ideally in a caller that itself runs inside a single transaction so a
    -- rollback also resets this flag's *logical* intent even though the
    -- package variable itself is not transactional.
    PROCEDURE allow_change;
    PROCEDURE done_changing;
    FUNCTION is_change_allowed RETURN BOOLEAN;
END pkg_order_status_ctx;
/

CREATE OR REPLACE PACKAGE BODY pkg_order_status_ctx AS
    g_allowed BOOLEAN := FALSE;

    PROCEDURE allow_change IS
    BEGIN
        g_allowed := TRUE;
    END allow_change;

    PROCEDURE done_changing IS
    BEGIN
        g_allowed := FALSE;
    END done_changing;

    FUNCTION is_change_allowed RETURN BOOLEAN IS
    BEGIN
        RETURN g_allowed;
    END is_change_allowed;
END pkg_order_status_ctx;
/

COMMENT ON TABLE order_status_ref IS 'See also PKG_ORDER_STATUS_CTX (050_triggers.sql) and TRG_ORDERS_STATUS_GUARD, which together enforce that ORDERS.STATUS only changes via pkg_order_status (TASK-012).';

-- ----------------------------------------------------------------------------
-- TRG_ORDERS_STATUS_GUARD
-- Rejects any UPDATE of ORDERS.STATUS that pkg_order_status.change_status
-- (TASK-012) did not explicitly authorize via PKG_ORDER_STATUS_CTX. Does not
-- fire on INSERT -- pkg_order.submit_order (TASK-015) sets the initial
-- STATUS directly as part of order creation, which is not a "change".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_orders_status_guard
    BEFORE UPDATE OF status ON orders
    FOR EACH ROW
    WHEN (NEW.status != OLD.status)
BEGIN
    IF NOT pkg_order_status_ctx.is_change_allowed THEN
        RAISE_APPLICATION_ERROR(
            -20001,
            'ORDERS.STATUS may only be changed via PKG_ORDER_STATUS.CHANGE_STATUS.'
        );
    END IF;
END trg_orders_status_guard;
/

-- ----------------------------------------------------------------------------
-- TRG_ORDERS_BIU
-- CREATED_AT/UPDATED_AT bookkeeping + PART_NUMBER_ENTERED normalization.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_orders_biu
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW
BEGIN
    IF INSERTING THEN
        :NEW.created_at := NVL(:NEW.created_at, SYSTIMESTAMP);
    END IF;
    :NEW.updated_at := SYSTIMESTAMP;

    IF :NEW.part_number_entered IS NOT NULL THEN
        :NEW.part_number_entered := UPPER(TRIM(:NEW.part_number_entered));
    END IF;
END trg_orders_biu;
/

-- ----------------------------------------------------------------------------
-- TRG_COMPAT_ENTRY_BIU
-- CREATED_AT/UPDATED_AT bookkeeping + PART_NUMBER normalization.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_compat_entry_biu
    BEFORE INSERT OR UPDATE ON compatibility_entry
    FOR EACH ROW
BEGIN
    IF INSERTING THEN
        :NEW.created_at := NVL(:NEW.created_at, SYSTIMESTAMP);
    END IF;
    :NEW.updated_at := SYSTIMESTAMP;

    IF :NEW.part_number IS NOT NULL THEN
        :NEW.part_number := UPPER(TRIM(:NEW.part_number));
    END IF;
END trg_compat_entry_biu;
/
