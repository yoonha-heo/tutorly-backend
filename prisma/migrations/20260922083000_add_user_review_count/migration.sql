-- AlterTable
ALTER TABLE "User" ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill denormalized written-review counts
UPDATE "User" AS u
SET "reviewCount" = sub.cnt
FROM (
  SELECT b."studentId", COUNT(*)::int AS cnt
  FROM "Review" AS r
  INNER JOIN "Booking" AS b ON b.id = r."bookingId"
  GROUP BY b."studentId"
) AS sub
WHERE u.id = sub."studentId";
