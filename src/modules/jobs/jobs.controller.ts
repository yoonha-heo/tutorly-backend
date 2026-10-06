import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AvailabilitySlotsService } from '@/modules/availabilities/availability-slots.service';
import { BookingCompletionService } from '@/modules/bookings/booking-completion.service';
import { BookingExpirationService } from '@/modules/bookings/booking-expiration.service';
import { SchedulerGuard } from './scheduler.guard';

@Controller('jobs')
@UseGuards(SchedulerGuard)
export class JobsController {
  constructor(
    private readonly availabilitySlotsService: AvailabilitySlotsService,
    private readonly bookingExpirationService: BookingExpirationService,
    private readonly bookingCompletionService: BookingCompletionService,
  ) {}

  @Post('availability-slots')
  @HttpCode(200)
  generateAvailabilitySlots() {
    return this.availabilitySlotsService.generateDailyAvailabilitySlots();
  }

  @Post('bookings/expire')
  @HttpCode(200)
  expireBookings() {
    return this.bookingExpirationService.expirePendingBookings();
  }

  @Post('bookings/complete')
  @HttpCode(200)
  completeBookings() {
    return this.bookingCompletionService.completeConfirmedBookings();
  }
}
