import { PrismaService } from '@/database/prisma/prisma.service';
import { BusinessException } from '@/common/exceptions/business.exception';
import { HttpStatus, Injectable } from '@nestjs/common';
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

  async getMyLessons(userId: string) {
    return this.prisma.booking.findMany({
      where: { studentId: userId },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

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
          throw new BusinessException(
            'AVAILABILITY_NOT_FOUND',
            'This time slot is no longer available. Please choose another.',
            HttpStatus.NOT_FOUND,
            { availabilityId: dto.availabilityId },
          );
        }

        if (availability.teacher.userId === studentId) {
          throw new BusinessException(
            'CANNOT_BOOK_OWN_LESSON',
            "You can't book a lesson with yourself.",
            HttpStatus.BAD_REQUEST,
          );
        }

        if (!availability.isOpen) {
          throw new BusinessException(
            'AVAILABILITY_NOT_OPEN',
            'This time slot is closed. Please choose another.',
            HttpStatus.BAD_REQUEST,
            { availabilityId: availability.id },
          );
        }

        if (availability.teacher.hourlyRate === null) {
          throw new BusinessException(
            'TEACHER_HOURLY_RATE_NOT_SET',
            "This teacher hasn't set a price yet. Please try another teacher.",
            HttpStatus.BAD_REQUEST,
            { teacherId: availability.teacherId },
          );
        }

        if (availability.blocks.length > 0) {
          throw new BusinessException(
            'AVAILABILITY_ALREADY_BOOKED',
            'This time slot was just booked. Please choose another.',
            HttpStatus.CONFLICT,
            { availabilityId: availability.id },
          );
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
            lessonEndAt,
            price: availability.teacher.hourlyRate,
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
        throw new BusinessException(
          'TIME_SLOT_ALREADY_RESERVED',
          'This time slot was just reserved. Please choose another.',
          HttpStatus.CONFLICT,
          { availabilityId: dto.availabilityId },
        );
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
