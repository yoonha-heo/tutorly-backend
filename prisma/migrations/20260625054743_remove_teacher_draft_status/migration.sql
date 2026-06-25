/*
  Warnings:

  - The values [DRAFT] on the enum `TeacherStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TeacherStatus_new" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "public"."TeacherProfile" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TeacherProfile" ALTER COLUMN "status" TYPE "TeacherStatus_new" USING ("status"::text::"TeacherStatus_new");
ALTER TYPE "TeacherStatus" RENAME TO "TeacherStatus_old";
ALTER TYPE "TeacherStatus_new" RENAME TO "TeacherStatus";
DROP TYPE "public"."TeacherStatus_old";
ALTER TABLE "TeacherProfile" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "TeacherProfile" ALTER COLUMN "status" SET DEFAULT 'PENDING';
