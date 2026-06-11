-- AlterEnum
ALTER TYPE "VehicleType" ADD VALUE 'BLACK_CAR';

-- AlterTable
ALTER TABLE "Config" ADD COLUMN     "namedPlaces" JSONB DEFAULT 'null',
ADD COLUMN     "timeOfDaySurcharge" JSONB DEFAULT 'null',
ADD COLUMN     "zones" JSONB DEFAULT 'null';

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "fareEwrSurcharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "fareTimeOfDaySurcharge" DOUBLE PRECISION NOT NULL DEFAULT 0;
