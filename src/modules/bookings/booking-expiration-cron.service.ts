import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/database/prisma/prisma.service';

@Injectable()
export class BookingExpirationCronService {
  private readonly logger = new Logger(BookingExpirationCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expirePendingBookings(): Promise<void> {
    const now = new Date();

    const expiredBookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.PENDING_PAYMENT,
        paymentExpiresAt: {
          lte: now,
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        paymentExpiresAt: 'asc',
      },
      take: 100,
    });

    for (const booking of expiredBookings) {
      await this.expirePendingBooking(booking.id, now);
    }

    if (expiredBookings.length > 0) {
      this.logger.log(`Processed ${expiredBookings.length} expired bookings.`);
    }
  }

  private async expirePendingBooking(
    bookingId: string,
    now: Date,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: BookingStatus.PENDING_PAYMENT,
          paymentExpiresAt: {
            lte: now,
          },
        },
        data: {
          status: BookingStatus.EXPIRED,
        },
      });

      if (updateResult.count === 0) {
        return;
      }

      await tx.availabilityBlock.deleteMany({
        where: {
          bookingId,
        },
      });
    });
  }
}
