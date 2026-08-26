import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/database/prisma/prisma.service';

@Injectable()
export class BookingCompletionCronService {
  private readonly logger = new Logger(BookingCompletionCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async completeConfirmedBookings(): Promise<void> {
    const now = new Date();

    const endedBookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        lessonEndAt: {
          lte: now,
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        lessonEndAt: 'asc',
      },
      take: 100,
    });

    for (const booking of endedBookings) {
      await this.completeConfirmedBooking(booking.id, now);
    }

    if (endedBookings.length > 0) {
      this.logger.log(`Completed ${endedBookings.length} finished lessons.`);
    }
  }

  private async completeConfirmedBooking(
    bookingId: string,
    now: Date,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: BookingStatus.CONFIRMED,
          lessonEndAt: {
            lte: now,
          },
        },
        data: {
          status: BookingStatus.COMPLETED,
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
