import { HttpStatus, Injectable } from '@nestjs/common';
import { TeacherStatus } from '@prisma/client';
import { BusinessException } from '@/common/exceptions/business.exception';
import { PrismaService } from '@/database/prisma/prisma.service';
import { TeachersService } from '@/modules/teachers/teachers.service';
import { ListTeacherProfilesQueryDto } from './dto/list-teacher-profiles-query.dto';
import { RejectTeacherDto } from './dto/reject-teacher.dto';

const ADMIN_TEACHER_INCLUDE = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      profileImage: true,
    },
  },
  teacherLanguages: {
    include: { language: true },
  },
  teacherSpecialties: {
    include: { specialty: true },
  },
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teachersService: TeachersService,
  ) {}

  async listTeacherProfiles(query: ListTeacherProfilesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = query.status ? { status: query.status } : {};

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.teacherProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: ADMIN_TEACHER_INCLUDE,
      }),
      this.prisma.teacherProfile.count({ where }),
    ]);

    const hasNextPage = page * limit < totalCount;

    return {
      items,
      page,
      limit,
      totalCount,
      hasNextPage,
      nextPage: hasNextPage ? page + 1 : null,
    };
  }

  async getTeacherProfile(id: string) {
    const teacherProfile = await this.prisma.teacherProfile.findUnique({
      where: { id },
      include: ADMIN_TEACHER_INCLUDE,
    });

    if (!teacherProfile) {
      throw new BusinessException(
        'TEACHER_PROFILE_NOT_FOUND',
        'Teacher profile not found.',
        HttpStatus.NOT_FOUND,
        { teacherProfileId: id },
      );
    }

    return teacherProfile;
  }

  async approveTeacher(id: string) {
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

    if (teacherProfile.status !== TeacherStatus.PENDING) {
      throw new BusinessException(
        'TEACHER_PROFILE_NOT_PENDING',
        'Only pending teacher profiles can be approved.',
        HttpStatus.BAD_REQUEST,
        { teacherProfileId: id, status: teacherProfile.status },
      );
    }

    const updated = await this.prisma.teacherProfile.update({
      where: { id },
      data: {
        status: TeacherStatus.APPROVED,
        rejectionReason: null,
      },
      include: ADMIN_TEACHER_INCLUDE,
    });

    await this.teachersService.bustTeacherSearchCache();

    return updated;
  }

  async rejectTeacher(id: string, dto: RejectTeacherDto) {
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

    if (teacherProfile.status !== TeacherStatus.PENDING) {
      throw new BusinessException(
        'TEACHER_PROFILE_NOT_PENDING',
        'Only pending teacher profiles can be rejected.',
        HttpStatus.BAD_REQUEST,
        { teacherProfileId: id, status: teacherProfile.status },
      );
    }

    return this.prisma.teacherProfile.update({
      where: { id },
      data: {
        status: TeacherStatus.REJECTED,
        rejectionReason: dto.rejectionReason,
      },
      include: ADMIN_TEACHER_INCLUDE,
    });
  }
}
