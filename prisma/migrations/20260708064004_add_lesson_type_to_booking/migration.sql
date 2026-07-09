-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('TRIAL', 'STANDARD');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "lessonType" "LessonType" NOT NULL DEFAULT 'STANDARD';
