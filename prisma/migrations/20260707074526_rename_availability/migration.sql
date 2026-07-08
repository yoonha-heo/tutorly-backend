/*
  Warnings:

  - You are about to drop the column `availabilitySlotId` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the `AvailabilitySlot` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `availabilityId` to the `Booking` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AvailabilitySlot" DROP CONSTRAINT "AvailabilitySlot_teacherId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_availabilitySlotId_fkey";

-- DropIndex
DROP INDEX "Booking_availabilitySlotId_idx";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "availabilitySlotId",
ADD COLUMN     "availabilityId" TEXT NOT NULL;

-- DropTable
DROP TABLE "AvailabilitySlot";

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Availability_teacherId_isOpen_startAt_idx" ON "Availability"("teacherId", "isOpen", "startAt");

-- CreateIndex
CREATE INDEX "Availability_startAt_idx" ON "Availability"("startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_teacherId_startAt_key" ON "Availability"("teacherId", "startAt");

-- CreateIndex
CREATE INDEX "Booking_availabilityId_idx" ON "Booking"("availabilityId");

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "Availability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
