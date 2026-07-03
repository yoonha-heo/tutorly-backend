/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `Specialty` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Specialty_name_key";

-- AlterTable
ALTER TABLE "Specialty" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_code_key" ON "Specialty"("code");
