-- CreateIndex
CREATE INDEX "Booking_status_lessonStartAt_idx" ON "Booking"("status", "lessonStartAt");

-- CreateIndex
CREATE INDEX "Booking_status_lessonEndAt_idx" ON "Booking"("status", "lessonEndAt");
