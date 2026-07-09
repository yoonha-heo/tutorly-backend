import { PrismaService } from '@/database/prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { BookingStatus } from '@prisma/client';

@Injectable()
export class AvailabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyAvailabilities(userId: string) {
    const teacherProfile = await this.prisma.teacherProfile.findUnique({
      where: {
        userId,
      },
    });

    if (!teacherProfile) {
      throw new ForbiddenException('Teacher profile is required');
    }

    return this.prisma.availability.findMany({
      where: {
        teacherId: teacherProfile.id,
        startAt: {
          gte: new Date(),
        },
      },
      include: {
        blocks: {
          where: {
            booking: {
              status: {
                in: [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED],
              },
            },
          },
        },
      },
      orderBy: {
        startAt: 'asc',
      },
    });
  }

  async updateAvailabilityStatus(
    userId: string,
    availabilityId: string,
    dto: UpdateAvailabilityDto,
  ) {
    const teacherProfile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
    });

    if (!teacherProfile) {
      throw new ForbiddenException('Teacher profile is required');
    }

    const availability = await this.prisma.availability.findUnique({
      where: {
        id: availabilityId,
        teacherId: teacherProfile.id,
        blocks: {
          none: {
            booking: {
              status: {
                in: [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED],
              },
            },
          },
        },
      },
    });

    if (!availability) {
      throw new BadRequestException(
        'Availability not found, not yours, or already has booking',
      );
    }

    return this.prisma.availability.update({
      where: {
        id: availabilityId,
      },
      data: {
        isOpen: dto.isOpen,
      },
    });
  }
}
