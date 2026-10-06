import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingExpirationService } from './booking-expiration.service';
import { BookingCompletionService } from './booking-completion.service';
import { PaymentModule } from '@/modules/payment/payment.module';
import { TeachersModule } from '@/modules/teachers/teachers.module';

@Module({
  imports: [PaymentModule, TeachersModule],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingExpirationService,
    BookingCompletionService,
  ],
  exports: [BookingExpirationService, BookingCompletionService],
})
export class BookingsModule {}
