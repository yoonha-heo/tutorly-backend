import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingExpirationCronService } from './booking-expiration-cron.service';
import { BookingCompletionCronService } from './booking-completion-cron.service';
import { PaymentModule } from '@/modules/payment/payment.module';
import { TeachersModule } from '@/modules/teachers/teachers.module';

@Module({
  imports: [PaymentModule, TeachersModule],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingExpirationCronService,
    BookingCompletionCronService,
  ],
})
export class BookingsModule {}
