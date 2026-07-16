-- Add the price snapshot for existing bookings before making it required.
ALTER TABLE "Booking" ADD COLUMN "price" INTEGER;

UPDATE "Booking" AS booking
SET "price" = COALESCE(teacher."hourlyRate", 0)
FROM "TeacherProfile" AS teacher
WHERE booking."teacherId" = teacher."id";

ALTER TABLE "Booking" ALTER COLUMN "price" SET NOT NULL;
