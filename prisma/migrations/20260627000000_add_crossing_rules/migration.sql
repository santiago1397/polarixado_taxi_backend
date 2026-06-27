-- AlterTable: add crossingRules to Config
ALTER TABLE "Config"
  ADD COLUMN "crossingRules" JSONB DEFAULT 'null';

-- AlterTable: add crossing surcharge to Trip
ALTER TABLE "Trip"
  ADD COLUMN "fareCrossingSurcharge" DOUBLE PRECISION NOT NULL DEFAULT 0;
