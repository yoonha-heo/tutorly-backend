import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { UpdateTeacherStatusDto } from './dto/update-teacher-status.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async approveTeacher(id: string, dto: UpdateTeacherStatusDto) {
    const teacherProfile = await this.prisma.teacherProfile.findUnique({
      where: { id },
    });

    if (!teacherProfile) {
      throw new NotFoundException('Teacher profile not found');
    }

    return this.prisma.teacherProfile.update({
      where: { id },
      data: {
        status: dto.status,
      },
    });
  }
}
