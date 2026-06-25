/*
  Warnings:

  - You are about to drop the `AvailabilityRule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AvailabilitySlot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Booking` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TeacherStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "AvailabilityRule" DROP CONSTRAINT "AvailabilityRule_teacherId_fkey";

-- DropForeignKey
ALTER TABLE "AvailabilitySlot" DROP CONSTRAINT "AvailabilitySlot_ruleId_fkey";

-- DropForeignKey
ALTER TABLE "AvailabilitySlot" DROP CONSTRAINT "AvailabilitySlot_teacherId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_slotId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_teacherId_fkey";

-- AlterTable
ALTER TABLE "TeacherProfile" ADD COLUMN     "status" "TeacherStatus" NOT NULL DEFAULT 'DRAFT';

-- DropTable
DROP TABLE "AvailabilityRule";

-- DropTable
DROP TABLE "AvailabilitySlot";

-- DropTable
DROP TABLE "Booking";

-- DropEnum
DROP TYPE "AvailabilitySlotStatus";

-- DropEnum
DROP TYPE "BookingStatus";

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherLanguage" (
    "teacherId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,

    CONSTRAINT "TeacherLanguage_pkey" PRIMARY KEY ("teacherId","languageId")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherSpecialty" (
    "teacherId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,

    CONSTRAINT "TeacherSpecialty_pkey" PRIMARY KEY ("teacherId","specialtyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Language_code_key" ON "Language"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Language_name_key" ON "Language"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_name_key" ON "Specialty"("name");

-- AddForeignKey
ALTER TABLE "TeacherLanguage" ADD CONSTRAINT "TeacherLanguage_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherLanguage" ADD CONSTRAINT "TeacherLanguage_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSpecialty" ADD CONSTRAINT "TeacherSpecialty_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSpecialty" ADD CONSTRAINT "TeacherSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
