-- CreateEnum
CREATE TYPE "question_answer_type" AS ENUM ('text', 'yes_no', 'textarea', 'photo');

-- CreateTable
CREATE TABLE "app_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "question_definitions" (
    "id" BIGSERIAL NOT NULL,
    "question_set_code" VARCHAR(30) NOT NULL,
    "question_code" VARCHAR(50) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "answer_type" "question_answer_type" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "question_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" BIGSERIAL NOT NULL,
    "order_id" BIGINT NOT NULL,
    "email_type" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "error" TEXT,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_definitions_question_set_code_question_code_key" ON "question_definitions"("question_set_code", "question_code");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_order_id_email_type_key" ON "email_logs"("order_id", "email_type");

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
