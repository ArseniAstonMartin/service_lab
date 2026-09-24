-- ============================================================================
-- 040_constraints.sql
-- TASK-006: Data integrity rules (part 1 of 2 -- see also 050_triggers.sql).
--
-- Adds every CHECK/FK-domain constraint deferred by 010/020/030_*.sql, plus
-- the ORDER_STATUS_REF lookup table that is the single source of truth for
-- valid ORDERS.STATUS / ORDER_STATUS_HISTORY.STATUS values.
--
-- Run via SQL Workshop -> SQL Scripts (or SQLcl) against a schema that
-- already has 010/020/030_*.sql applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ORDER_STATUS_REF
--
-- DESIGN DECISION for the "ORDERS.STATUS list is kept in one place so
-- Cancelled can be added later" acceptance criterion: rather than a literal
-- CHECK (status IN (...)) list -- which would have to be duplicated
-- identically on both ORDERS.STATUS and ORDER_STATUS_HISTORY.STATUS, and
-- edited (ALTER TABLE ... DROP/ADD CONSTRAINT) in two places whenever a
-- status is added -- this uses a tiny lookup table as the single source of
-- truth, referenced by FK from both columns. Adding Cancelled for TASK-048
-- becomes a single INSERT here, not a DDL change on ORDERS or
-- ORDER_STATUS_HISTORY at all.
--
-- The 7 statuses from PRD section 6 are seeded below via MERGE (re-runnable,
-- consistent with the seed-script convention used elsewhere in this repo).
-- ----------------------------------------------------------------------------
CREATE TABLE order_status_ref (
    status_code   VARCHAR2(30)   NOT NULL,
    display_seq   NUMBER(4)      NOT NULL,
    is_terminal   VARCHAR2(1)    DEFAULT 'N' NOT NULL,
    CONSTRAINT pk_order_status_ref PRIMARY KEY (status_code),
    CONSTRAINT ck_order_status_ref_terminal CHECK (is_terminal IN ('Y', 'N'))
);

COMMENT ON TABLE order_status_ref IS 'Single source of truth for every valid ORDERS.STATUS / ORDER_STATUS_HISTORY.STATUS value. To add a status (e.g. TASK-048''s Cancelled), INSERT a row here -- no ALTER TABLE on ORDERS or ORDER_STATUS_HISTORY needed.';
COMMENT ON COLUMN order_status_ref.is_terminal IS 'Y for a status pkg_order_status (TASK-012) should treat as final (no further transitions expected), used by get_next_statuses.';

MERGE INTO order_status_ref tgt
USING (
    SELECT 'Pending Review'        AS status_code, 10 AS display_seq, 'N' AS is_terminal FROM dual UNION ALL
    SELECT 'Awaiting Payment',      20,             'N'                                 FROM dual UNION ALL
    SELECT 'Payment Received',      30,             'N'                                 FROM dual UNION ALL
    SELECT 'Block Received',        40,             'N'                                 FROM dual UNION ALL
    SELECT 'In Progress',           50,             'N'                                 FROM dual UNION ALL
    SELECT 'Ready / Shipped Back',  60,             'N'                                 FROM dual UNION ALL
    SELECT 'Completed',             70,             'Y'                                 FROM dual
) src
ON (tgt.status_code = src.status_code)
WHEN MATCHED THEN UPDATE SET tgt.display_seq = src.display_seq, tgt.is_terminal = src.is_terminal
WHEN NOT MATCHED THEN INSERT (status_code, display_seq, is_terminal)
    VALUES (src.status_code, src.display_seq, src.is_terminal);

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_status FOREIGN KEY (status)
        REFERENCES order_status_ref (status_code);

ALTER TABLE order_status_history
    ADD CONSTRAINT fk_order_status_history_status FOREIGN KEY (status)
        REFERENCES order_status_ref (status_code);

-- ----------------------------------------------------------------------------
-- Domain-value CHECK constraints deferred from 010/020/030_*.sql
-- ----------------------------------------------------------------------------
ALTER TABLE order_photo
    ADD CONSTRAINT ck_order_photo_type
        CHECK (photo_type IN ('STICKER', 'DONOR', 'ORIGINAL'));

ALTER TABLE compatibility_entry
    ADD CONSTRAINT ck_compat_entry_source
        CHECK (source IN ('IMPORT', 'ADMIN_CONFIRMED'));

ALTER TABLE question_def
    ADD CONSTRAINT ck_question_def_answer_type
        CHECK (answer_type IN ('TEXT', 'YES_NO', 'TEXTAREA', 'PHOTO'));

ALTER TABLE email_log
    ADD CONSTRAINT ck_email_log_type
        CHECK (email_type IN (
            'ORDER_SUBMITTED',   -- email #1 (TASK-028)
            'PAYMENT_LINK',      -- email #2 (TASK-031)
            'MODULE_RECEIVED',   -- email #3 (TASK-029)
            'SHIPPED_BACK',      -- email #4 (TASK-029)
            'ADMIN_NEW_ORDER'    -- email #5 (TASK-028)
        ));

-- ----------------------------------------------------------------------------
-- Amount CHECK constraints on ORDERS (acceptance criteria: "amounts >= 0;
-- TOTAL_AMOUNT = SERVICE_PRICE + RETURN_SHIPPING_FEE when all three are set")
-- ----------------------------------------------------------------------------
ALTER TABLE orders
    ADD CONSTRAINT ck_orders_service_price_nonneg
        CHECK (service_price IS NULL OR service_price >= 0);

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_return_fee_nonneg
        CHECK (return_shipping_fee IS NULL OR return_shipping_fee >= 0);

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_total_nonneg
        CHECK (total_amount IS NULL OR total_amount >= 0);

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_total_matches_sum
        CHECK (
            service_price IS NULL
            OR return_shipping_fee IS NULL
            OR total_amount IS NULL
            OR total_amount = service_price + return_shipping_fee
        );

-- NOTE (Oracle has no COMMENT ON CONSTRAINT): ck_orders_total_matches_sum ON orders IS 'Only enforced once all three of SERVICE_PRICE/RETURN_SHIPPING_FEE/TOTAL_AMOUNT are set (matched path or a confirmed Pending Review order, both via pkg_pricing/TASK-014) -- a Pending-Review order legitimately has all three NULL before compatibility is confirmed.';

-- ----------------------------------------------------------------------------
-- Format CHECK constraints on ORDERS (acceptance criteria: email + US ZIP)
-- ----------------------------------------------------------------------------
ALTER TABLE orders
    ADD CONSTRAINT ck_orders_email_format
        CHECK (REGEXP_LIKE(customer_email, '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_zip_format
        CHECK (REGEXP_LIKE(return_address_zip, '^[0-9]{5}(-[0-9]{4})?$'));

-- NOTE (Oracle has no COMMENT ON CONSTRAINT): ck_orders_email_format ON orders IS 'Basic non-strict email shape check (local@domain.tld); mirrored by an APEX page-level validation on f92606 Page 14 (TASK-021) for a friendlier inline message before this constraint would ever fire.';
-- NOTE (Oracle has no COMMENT ON CONSTRAINT): ck_orders_zip_format ON orders IS 'US ZIP or ZIP+4 (5 digits, optional -4 digits); mirrored by an APEX page-level validation on f92606 Page 14 (TASK-021).';
