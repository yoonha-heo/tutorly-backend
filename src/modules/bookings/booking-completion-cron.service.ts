import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/database/prisma/prisma.service';
import { TeachersService } from '@/modules/teachers/teachers.service';

@Injectable()
export class BookingCompletionCronService {
  private readonly logger = new Logger(BookingCompletionCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly teachersService: TeachersService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async completeConfirmedBookings(): Promise<void> {
    try {
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

      if (endedBookings.length === 0) {
        return;
      }

      const endedIds = endedBookings.map((booking) => booking.id);

      const completed = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.$queryRaw<
          Array<{ id: string; teacherId: string }>
        >(
          Prisma.sql`
          UPDATE "Booking"
          SET status = 'COMPLETED'::"BookingStatus",
              "updatedAt" = NOW()
          WHERE id IN (${Prisma.join(endedIds)})
            AND status = 'CONFIRMED'::"BookingStatus"
            AND "lessonEndAt" <= ${now}
          RETURNING id, "teacherId"
        `,
        );

        if (updated.length > 0) {
          await tx.availabilityBlock.deleteMany({
            where: {
              bookingId: {
                in: updated.map((booking) => booking.id),
              },
            },
          });
        }

        return updated;
      });

      for (const booking of completed) {
        await this.teachersService.incrementLessonCount(booking.teacherId);
      }

      if (completed.length > 0) {
        this.logger.log(`Completed ${completed.length} finished lessons.`);
      }
    } catch (error) {
      this.logger.error(
        'Failed to complete confirmed bookings',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
