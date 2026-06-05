-- CreateTable
CREATE TABLE "ConversationModel" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "endpoint" TEXT,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationModel_pkey" PRIMARY KEY ("conversationId")
);

-- CreateIndex
CREATE INDEX "ConversationModel_userId_idx" ON "ConversationModel"("userId");

-- CreateIndex
CREATE INDEX "ConversationModel_pinnedAt_idx" ON "ConversationModel"("pinnedAt");
