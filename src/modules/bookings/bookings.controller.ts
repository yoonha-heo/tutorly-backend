import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMyLessons(@CurrentUser() user: JwtPayload) {
    return this.bookingsService.getMyLessons(user.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  createBookings(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(user.userId, dto);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancelBooking(
    @CurrentUser() user: JwtPayload,
    @Param('id') bookingId: string,
  ) {
    return this.bookingsService.cancelBooking(bookingId, user.userId);
  }
}
