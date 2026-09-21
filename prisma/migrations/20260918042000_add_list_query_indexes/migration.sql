-- CreateIndex
CREATE INDEX "TeacherProfile_status_createdAt_id_idx" ON "TeacherProfile"("status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Booking_studentId_createdAt_idx" ON "Booking"("studentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Booking_teacherId_status_idx" ON "Booking"("teacherId", "status");
