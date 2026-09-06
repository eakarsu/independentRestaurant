-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "NotificationStatus" ADD VALUE 'UNKNOWN';
ALTER TYPE "NotificationStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "TimeClock" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "breakMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hourlyRateSnapshot" DECIMAL(12,2),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "allowEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowSms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "consentRecorded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "deliveryKey" TEXT,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "processingAt" TIMESTAMP(3),
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerRef" TEXT;

-- CreateTable
CREATE TABLE "OperationReceipt" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationAudit_entity_entityId_createdAt_idx" ON "OperationAudit"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_deliveryKey_key" ON "Notification"("deliveryKey");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_providerRef_key" ON "Notification"("providerRef");
