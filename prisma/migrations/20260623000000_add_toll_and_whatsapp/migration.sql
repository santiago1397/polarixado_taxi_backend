-- AlterTable: add toll + whatsapp columns to Config
ALTER TABLE "Config"
  ADD COLUMN "tollRoads" JSONB DEFAULT 'null',
  ADD COLUMN "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whatsappRecipientPhone" TEXT,
  ADD COLUMN "whatsappRecipientName" TEXT;

-- AlterTable: add toll amount to Trip
ALTER TABLE "Trip"
  ADD COLUMN "fareTollAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
