import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingExpirationService } from './booking-expiration.service';
import { BookingCompletionService } from './booking-completion.service';
import { ChatsModule } from '@/modules/chats/chats.module';
import { PaymentModule } from '@/modules/payment/payment.module';
import { TeachersModule } from '@/modules/teachers/teachers.module';

@Module({
  imports: [PaymentModule, TeachersModule, ChatsModule],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingExpirationService,
    BookingCompletionService,
  ],
  exports: [BookingExpirationService, BookingCompletionService],
})
export class BookingsModule {}
