-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending_review', 'awaiting_payment', 'payment_received', 'block_received', 'in_progress', 'ready_shipped_back', 'completed');

-- CreateEnum
CREATE TYPE "photo_type" AS ENUM ('sticker', 'donor', 'original');

-- CreateTable
CREATE TABLE "orders" (
    "id" BIGSERIAL NOT NULL,
    "tracking_token" VARCHAR(64) NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'pending_review',
    "vehicle_id" BIGINT NOT NULL,
    "category_id" BIGINT NOT NULL,
    "part_number_entered" VARCHAR(100) NOT NULL,
    "matched_entry_id" BIGINT,
    "service_id" BIGINT,
    "description" TEXT NOT NULL,
    "customer_name" VARCHAR(150) NOT NULL,
    "customer_email" VARCHAR(255) NOT NULL,
    "customer_phone" VARCHAR(50) NOT NULL,
    "return_address_street" VARCHAR(255) NOT NULL,
    "return_address_city" VARCHAR(100) NOT NULL,
    "return_address_state" VARCHAR(2) NOT NULL,
    "return_address_zip" VARCHAR(10) NOT NULL,
    "service_price_cents" INTEGER,
    "return_shipping_fee_cents" INTEGER,
    "total_amount_cents" INTEGER,
    "stripe_payment_link_id" VARCHAR(100),
    "payment_link_url" VARCHAR(500),
    "stripe_payment_status" VARCHAR(30),
    "shipping_label_url" VARCHAR(500),
    "return_tracking_no" VARCHAR(100),
    "idempotency_key" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_photos" (
    "id" BIGSERIAL NOT NULL,
    "order_id" BIGINT NOT NULL,
    "photo_type" "photo_type" NOT NULL,
    "blob_url" VARCHAR(500) NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_answers" (
    "id" BIGSERIAL NOT NULL,
    "order_id" BIGINT NOT NULL,
    "question_code" VARCHAR(50) NOT NULL,
    "answer_value" TEXT NOT NULL,

    CONSTRAINT "order_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" BIGSERIAL NOT NULL,
    "order_id" BIGINT NOT NULL,
    "status" "order_status" NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(50) NOT NULL,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_tracking_token_key" ON "orders"("tracking_token");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_customer_email_idx" ON "orders"("customer_email");

-- CreateIndex
CREATE INDEX "orders_part_number_entered_idx" ON "orders"("part_number_entered");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "module_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_matched_entry_id_fkey" FOREIGN KEY ("matched_entry_id") REFERENCES "compatibility_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_photos" ADD CONSTRAINT "order_photos_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_answers" ADD CONSTRAINT "order_answers_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
