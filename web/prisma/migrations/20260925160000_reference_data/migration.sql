-- CreateEnum
CREATE TYPE "entry_source" AS ENUM ('import', 'admin_confirmed');

-- CreateTable
CREATE TABLE "vehicles" (
    "id" BIGSERIAL NOT NULL,
    "make" VARCHAR(50) NOT NULL,
    "model" VARCHAR(50) NOT NULL,
    "year" SMALLINT NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_categories" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "module_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compatibility_entries" (
    "id" BIGSERIAL NOT NULL,
    "vehicle_id" BIGINT NOT NULL,
    "category_id" BIGINT NOT NULL,
    "part_number" VARCHAR(100) NOT NULL,
    "photo_hint_url" VARCHAR(500),
    "source" "entry_source" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "compatibility_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_tiers" (
    "tier_code" VARCHAR(10) NOT NULL,
    "amount_cents" INTEGER NOT NULL,

    CONSTRAINT "price_tiers_pkey" PRIMARY KEY ("tier_code")
);

-- CreateTable
CREATE TABLE "services" (
    "id" BIGSERIAL NOT NULL,
    "category_id" BIGINT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price_tier" VARCHAR(10) NOT NULL,
    "question_set_code" VARCHAR(30) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compatibility_services" (
    "entry_id" BIGINT NOT NULL,
    "service_id" BIGINT NOT NULL,

    CONSTRAINT "compatibility_services_pkey" PRIMARY KEY ("entry_id","service_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_make_model_year_key" ON "vehicles"("make", "model", "year");

-- CreateIndex
CREATE INDEX "compatibility_entries_part_number_idx" ON "compatibility_entries"("part_number");

-- CreateIndex
CREATE UNIQUE INDEX "compatibility_entries_vehicle_id_category_id_part_number_key" ON "compatibility_entries"("vehicle_id", "category_id", "part_number");

-- AddForeignKey
ALTER TABLE "compatibility_entries" ADD CONSTRAINT "compatibility_entries_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compatibility_entries" ADD CONSTRAINT "compatibility_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "module_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "module_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_price_tier_fkey" FOREIGN KEY ("price_tier") REFERENCES "price_tiers"("tier_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compatibility_services" ADD CONSTRAINT "compatibility_services_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "compatibility_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compatibility_services" ADD CONSTRAINT "compatibility_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
