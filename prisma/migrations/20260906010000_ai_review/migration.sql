-- CreateTable
CREATE TABLE "RestaurantAiRun" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "instructions" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "output" JSONB,
    "model" TEXT,
    "providerRef" TEXT,
    "usage" JSONB,
    "costUsd" DECIMAL(12,6),
    "error" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantAiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantKnowledge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestaurantAiRun_createdAt_status_idx" ON "RestaurantAiRun"("createdAt", "status");
