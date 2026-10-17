-- CreateTable
CREATE TABLE "mobile_service_bookings" (
    "id" BIGSERIAL NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "make" VARCHAR(50) NOT NULL,
    "model" VARCHAR(50) NOT NULL,
    "year" SMALLINT NOT NULL,
    "services" TEXT[],
    "note" TEXT,
    "webhook_delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_service_bookings_pkey" PRIMARY KEY ("id")
);

-- Same RLS lockdown as every other table (see the enable_rls migration):
-- the app talks to Postgres only through Prisma's privileged role, which
-- always bypasses RLS, so this just blocks the separate Supabase Data API.
ALTER TABLE "public"."mobile_service_bookings" ENABLE ROW LEVEL SECURITY;
