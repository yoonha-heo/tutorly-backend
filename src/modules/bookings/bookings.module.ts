import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingExpirationCronService } from './booking-expiration-cron.service';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, BookingExpirationCronService],
})
export class BookingsModule {}
