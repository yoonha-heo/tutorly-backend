import { PrismaService } from '@/database/prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { UpdateAvailabilitiesDto } from './dto/update-availabilities.dto';

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

  async updateAvailabilities(userId: string, dto: UpdateAvailabilitiesDto) {
    const teacherProfile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
    });

    if (!teacherProfile) {
      throw new ForbiddenException('Teacher profile is required');
    }

    const ids = dto.items.map((item) => item.id);
    const uniqueIds = [...new Set(ids)];

    if (uniqueIds.length !== ids.length) {
      throw new BadRequestException('Duplicate availability ids');
    }

    const updatableAvailabilities = await this.prisma.availability.findMany({
      where: {
        id: { in: uniqueIds },
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
      select: { id: true },
    });

    if (updatableAvailabilities.length !== uniqueIds.length) {
      throw new BadRequestException(
        'Some availabilities not found, not yours, or already have booking',
      );
    }

    const openIds = dto.items
      .filter((item) => item.isOpen)
      .map((item) => item.id);
    const closedIds = dto.items
      .filter((item) => !item.isOpen)
      .map((item) => item.id);

    await this.prisma.$transaction([
      ...(openIds.length > 0
        ? [
            this.prisma.availability.updateMany({
              where: {
                id: { in: openIds },
                teacherId: teacherProfile.id,
              },
              data: { isOpen: true },
            }),
          ]
        : []),
      ...(closedIds.length > 0
        ? [
            this.prisma.availability.updateMany({
              where: {
                id: { in: closedIds },
                teacherId: teacherProfile.id,
              },
              data: { isOpen: false },
            }),
          ]
        : []),
    ]);

    return { updatedCount: uniqueIds.length };
  }
}
