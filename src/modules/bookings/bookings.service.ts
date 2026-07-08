import { PrismaService } from '@/database/prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus, Prisma } from '@prisma/client';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async createBooking(studentId: string, dto: CreateBookingDto) {
    const availability = await this.prisma.availability.findUnique({
      where: {
        id: dto.availabilityId,
      },
      include: { teacher: true },
    });

    if (!availability) {
      throw new NotFoundException('Availability not found');
    }

    if (availability.teacher.userId === studentId) {
      throw new BadRequestException('You cannot book your own lesson');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        return tx.booking.create({
          data: {
            availabilityId: availability.id,
            teacherId: availability.teacherId,
            studentId,
            lessonStartAt: availability.startAt,
            lessonEndAt: availability.endAt,
            status: BookingStatus.PENDING_PAYMENT,
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
      });
    } catch (error) {
      if (this.isActiveBookingConflictError(error)) {
        throw new ConflictException('This time slot is already reserved');
      }

      throw error;
    }
  }

  private isActiveBookingConflictError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    return (
      error.code === 'P2002' &&
      error.meta?.target === 'unique_active_booking_per_slot'
    );
  }
}
