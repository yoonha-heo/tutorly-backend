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
    try {
      const now = new Date();

      const expiredBookings = await this.prisma.booking.findMany({
        where: {
          status: BookingStatus.PENDING_PAYMENT,
          OR: [
            {
              paymentExpiresAt: {
                lte: now,
              },
            },
            {
              lessonStartAt: {
                lte: now,
              },
            },
          ],
        },
        select: {
          id: true,
        },
        orderBy: {
          lessonStartAt: 'asc',
        },
        take: 100,
      });

      if (expiredBookings.length === 0) {
        return;
      }

      const expiredIds = expiredBookings.map((booking) => booking.id);

      const expiredCount = await this.prisma.$transaction(async (tx) => {
        const updateResult = await tx.booking.updateMany({
          where: {
            id: {
              in: expiredIds,
            },
            status: BookingStatus.PENDING_PAYMENT,
            OR: [
              {
                paymentExpiresAt: {
                  lte: now,
                },
              },
              {
                lessonStartAt: {
                  lte: now,
                },
              },
            ],
          },
          data: {
            status: BookingStatus.EXPIRED,
          },
        });

        if (updateResult.count > 0) {
          await tx.availabilityBlock.deleteMany({
            where: {
              bookingId: {
                in: expiredIds,
              },
              booking: {
                status: BookingStatus.EXPIRED,
              },
            },
          });
        }

        return updateResult.count;
      });

      if (expiredCount > 0) {
        this.logger.log(`Processed ${expiredCount} expired bookings.`);
      }
    } catch (error) {
      this.logger.error(
        'Failed to expire pending bookings',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
