-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Channel" c
SET "lastMessageAt" = COALESCE(
  (SELECT MAX(m."createdAt") FROM "Message" m WHERE m."channelId" = c.id),
  c."createdAt"
);

-- CreateIndex
CREATE INDEX "Channel_lastMessageAt_idx" ON "Channel"("lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "ChannelMember_userId_idx" ON "ChannelMember"("userId");

-- DropIndex
DROP INDEX "Message_channelId_createdAt_idx";

-- CreateIndex
CREATE INDEX "Message_channelId_createdAt_id_idx" ON "Message"("channelId", "createdAt" DESC, "id" DESC);
