import { HttpStatus, Injectable } from '@nestjs/common';
import { BusinessException } from '@/common/exceptions/business.exception';
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
      throw new BusinessException(
        'TEACHER_PROFILE_NOT_FOUND',
        'Teacher profile not found.',
        HttpStatus.NOT_FOUND,
        { teacherProfileId: id },
      );
    }

    return this.prisma.teacherProfile.update({
      where: { id },
      data: {
        status: dto.status,
      },
    });
  }
}
