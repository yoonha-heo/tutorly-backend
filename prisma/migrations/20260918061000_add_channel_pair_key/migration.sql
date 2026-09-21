-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "pairKey" TEXT;

UPDATE "Channel" c
SET "pairKey" = sub.pair_key
FROM (
  SELECT
    cm1."channelId",
    LEAST(cm1."userId", cm2."userId") || ':' || GREATEST(cm1."userId", cm2."userId") AS pair_key
  FROM "ChannelMember" cm1
  INNER JOIN "ChannelMember" cm2
    ON cm1."channelId" = cm2."channelId"
   AND cm1."userId" < cm2."userId"
) sub
WHERE c.id = sub."channelId";

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "pairKey" ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Channel"
  WHERE "pairKey" IS NOT NULL
)
UPDATE "Channel" c
SET "pairKey" = NULL
FROM ranked
WHERE c.id = ranked.id
  AND ranked.rn > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Channel_pairKey_key" ON "Channel"("pairKey");
