-- Add new VehicleType enum values
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'UBER_COMFORT';
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'UBER_XXL';

-- Rename Trip.distanceKm -> distanceMiles with backfill (km * 0.621371)
ALTER TABLE "Trip" ADD COLUMN "distanceMiles" DOUBLE PRECISION;
UPDATE "Trip" SET "distanceMiles" = "distanceKm" * 0.621371;
ALTER TABLE "Trip" ALTER COLUMN "distanceMiles" SET NOT NULL;
ALTER TABLE "Trip" DROP COLUMN "distanceKm";

-- Rename Trip.farePerKm -> farePerMile (value stays the same — it stored the
-- total distance-component of the fare, not a per-unit rate)
ALTER TABLE "Trip" RENAME COLUMN "farePerKm" TO "farePerMile";

-- Add Trip.fareTime for the new time-based fare component
ALTER TABLE "Trip" ADD COLUMN "fareTime" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Create Config singleton table
CREATE TABLE "Config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "vehicleTiers" JSONB NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "zelleHandle" TEXT,
    "zelleName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);
