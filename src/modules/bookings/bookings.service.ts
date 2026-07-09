import { PrismaService } from '@/database/prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus, Prisma } from '@prisma/client';
import {
  LESSON_DURATION_BY_TYPE,
  PAYMENT_EXPIRES_IN_MINUTES,
  SLOT_INTERVAL_MINUTES,
} from '@/common/constants/booking.constants';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async createBooking(studentId: string, dto: CreateBookingDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const availability = await this.prisma.availability.findUnique({
          where: {
            id: dto.availabilityId,
          },
          include: {
            teacher: true,
            blocks: {
              where: {
                booking: {
                  status: {
                    in: [
                      BookingStatus.PENDING_PAYMENT,
                      BookingStatus.CONFIRMED,
                    ],
                  },
                },
              },
            },
          },
        });

        if (!availability) {
          throw new NotFoundException('Availability not found');
        }

        if (availability.teacher.userId === studentId) {
          throw new BadRequestException('You cannot book your own lesson');
        }

        if (!availability.isOpen) {
          throw new BadRequestException('Availability is not open');
        }

        if (availability.blocks.length > 0) {
          throw new ConflictException('This time slot already has a booking');
        }

        const durationMinutes = LESSON_DURATION_BY_TYPE[dto.lessonType];

        const lessonStartAt = availability.startAt;
        const lessonEndAt = new Date(
          lessonStartAt.getTime() + durationMinutes * 60 * 1000,
        );

        const blockSearchStartAt = new Date(
          lessonStartAt.getTime() - durationMinutes * 60 * 1000,
        );

        const blockEndAt = this.ceilToSlotBoundary(lessonEndAt);

        const blockedAvailabilities = await tx.availability.findMany({
          where: {
            teacherId: availability.teacherId,
            startAt: {
              gt: blockSearchStartAt,
              lt: blockEndAt,
            },
          },
          select: {
            id: true,
          },
        });

        const booking = await tx.booking.create({
          data: {
            availabilityId: availability.id,
            teacherId: availability.teacherId,
            studentId,
            lessonType: dto.lessonType,
            lessonStartAt: availability.startAt,
            lessonEndAt: availability.endAt,
            status: BookingStatus.PENDING_PAYMENT,
            paymentExpiresAt: new Date(
              Date.now() + PAYMENT_EXPIRES_IN_MINUTES * 60 * 1000,
            ),
          },
          include: {
            availability: true,
            teacher: {
              include: {
                user: true,
              },
            },
          },
        });

        await tx.availabilityBlock.createMany({
          data: blockedAvailabilities.map((blockedAvailability) => ({
            bookingId: booking.id,
            availabilityId: blockedAvailability.id,
          })),
        });

        return booking;
      });
    } catch (error) {
      if (this.isActiveBookingConflictError(error)) {
        throw new ConflictException('This time slot is already reserved');
      }

      throw error;
    }
  }

  // Handles race condition conflicts when creating bookings.
  private isActiveBookingConflictError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    return (
      error.code === 'P2002' &&
      error.meta?.target === 'unique_active_booking_per_slot'
    );
  }

  private ceilToSlotBoundary(date: Date): Date {
    const result = new Date(date);

    const minutes = result.getMinutes();
    const remainder = minutes % SLOT_INTERVAL_MINUTES;

    if (remainder > 0) {
      result.setMinutes(minutes + (SLOT_INTERVAL_MINUTES - remainder));
    }

    result.setSeconds(0);
    result.setMilliseconds(0);

    return result;
  }
}
