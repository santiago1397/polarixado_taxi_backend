-- CreateEnum
CREATE TYPE "TripMode" AS ENUM ('ASAP', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('UBER_X', 'UBER_XL');

-- CreateEnum
CREATE TYPE "TripState" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'EN_ROUTE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE', 'ZELLE', 'CASH', 'ZELLE_LATER', 'CASHAPP');

-- CreateEnum
CREATE TYPE "PaymentTiming" AS ENUM ('NOW', 'LATER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PENDING_VERIFICATION', 'PAID');

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'UBER_X',
    "mode" "TripMode" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "originAddress" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destAddress" TEXT NOT NULL,
    "destLat" DOUBLE PRECISION NOT NULL,
    "destLng" DOUBLE PRECISION NOT NULL,
    "routeGeoJSON" JSONB,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "etaMin" INTEGER NOT NULL,
    "fareBase" DOUBLE PRECISION NOT NULL,
    "farePerKm" DOUBLE PRECISION NOT NULL,
    "fareTotal" DOUBLE PRECISION NOT NULL,
    "fareCurrency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentTiming" "PaymentTiming" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" TEXT,
    "receiptBase64" TEXT,
    "state" "TripState" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "stateHistory" JSONB NOT NULL,
    "reminderSentAt" TIMESTAMP(3),

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);
