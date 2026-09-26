-- Customer leads captured by the customer-facing AI assistant.
--
-- The model existed in the Prisma schema but had no migration, so any fresh
-- environment would start without this table and lead capture would silently
-- fail (the route degrades rather than erroring). This makes it reproducible
-- via `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "CustomerLead" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "partySize" INTEGER,
    "preferredAt" TIMESTAMP(3),
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'assistant',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLead_sessionId_idx" ON "CustomerLead"("sessionId");
