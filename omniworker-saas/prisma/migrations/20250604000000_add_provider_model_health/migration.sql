-- CreateTable
CREATE TABLE "ProviderModelHealth" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "latencyMs" INTEGER,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "consecutiveSuccess" INTEGER NOT NULL DEFAULT 0,
    "totalChecks" INTEGER NOT NULL DEFAULT 0,
    "totalFails" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProviderModelHealth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderModelHealth_providerId_modelId_key" ON "ProviderModelHealth"("providerId", "modelId");

-- CreateIndex
CREATE INDEX "ProviderModelHealth_providerId_status_idx" ON "ProviderModelHealth"("providerId", "status");
