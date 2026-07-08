CREATE UNIQUE INDEX "unique_active_booking_per_slot"
ON "Booking" ("availabilitySlotId")
WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED');