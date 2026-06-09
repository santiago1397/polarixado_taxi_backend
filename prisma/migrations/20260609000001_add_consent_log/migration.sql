-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('BROWSEWRAP_CLICK', 'EXPLICIT_CHECKBOX', 'ADMIN_OVERRIDE');

-- CreateTable
CREATE TABLE "ConsentLog" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "channels" TEXT[],
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "ConsentMethod" NOT NULL,
    "textVersion" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentLog_tripId_idx" ON "ConsentLog"("tripId");

-- AddForeignKey
ALTER TABLE "ConsentLog" ADD CONSTRAINT "ConsentLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
