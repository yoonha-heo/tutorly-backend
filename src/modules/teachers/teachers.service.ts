import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { TeacherStatus } from '@prisma/client';
import { TeacherProfileDto } from './dto/teacher-profile.dto';
import { SearchTeachersQueryDto } from './dto/search-teachers-query.dto';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateTeacherProfile(userId: string, dto: TeacherProfileDto) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.teacherProfile.findUnique({
        where: { userId },
        include: {
          teacherLanguages: true,
          teacherSpecialties: true,
        },
      });

      if (!profile) {
        throw new NotFoundException('Teacher profile not found');
      }

      const languages = await tx.language.findMany({
        where: {
          name: {
            in: dto.languages,
          },
        },
      });

      const specialties = await tx.specialty.findMany({
        where: {
          name: {
            in: dto.specialties,
          },
        },
      });

      if (languages.length !== dto.languages.length) {
        throw new BadRequestException('Invalid languages');
      }

      if (specialties.length !== dto.specialties.length) {
        throw new BadRequestException('Invalid specialties');
      }

      const currentLanguageIds = profile.teacherLanguages.map(
        (item) => item.languageId,
      );
      const nextLanguageIds = languages.map((language) => language.id);

      const languageIdsToDelete = currentLanguageIds.filter(
        (id) => !nextLanguageIds.includes(id),
      );

      const languageIdsToCreate = nextLanguageIds.filter(
        (id) => !currentLanguageIds.includes(id),
      );

      const currentSpecialtyIds = profile.teacherSpecialties.map(
        (item) => item.specialtyId,
      );
      const nextSpecialtyIds = specialties.map((specialty) => specialty.id);

      const specialtyIdsToDelete = currentSpecialtyIds.filter(
        (id) => !nextSpecialtyIds.includes(id),
      );

      const specialtyIdsToCreate = nextSpecialtyIds.filter(
        (id) => !currentSpecialtyIds.includes(id),
      );

      const updatedProfile = await tx.teacherProfile.update({
        where: { id: profile.id },
        data: {
          headline: dto.headline,
          bio: dto.bio,
          profileImageUrl: dto.profileImageUrl,
          hourlyRate: dto.hourlyRate,
        },
      });

      if (languageIdsToDelete.length > 0) {
        await tx.teacherLanguage.deleteMany({
          where: {
            teacherId: profile.id,
            languageId: { in: languageIdsToDelete },
          },
        });
      }

      if (languageIdsToCreate.length > 0) {
        await tx.teacherLanguage.createMany({
          data: languageIdsToCreate.map((languageId) => ({
            teacherId: profile.id,
            languageId,
          })),
        });
      }

      if (specialtyIdsToDelete.length > 0) {
        await tx.teacherSpecialty.deleteMany({
          where: {
            teacherId: profile.id,
            specialtyId: { in: specialtyIdsToDelete },
          },
        });
      }

      if (specialtyIdsToCreate.length > 0) {
        await tx.teacherSpecialty.createMany({
          data: specialtyIdsToCreate.map((specialtyId) => ({
            teacherId: profile.id,
            specialtyId,
          })),
        });
      }

      return updatedProfile;
    });
  }

  async createTeacherProfile(userId: string, dto: TeacherProfileDto) {
    return this.prisma.$transaction(async (tx) => {
      const existingProfile = await tx.teacherProfile.findUnique({
        where: { userId },
      });

      if (existingProfile) {
        throw new ConflictException('Teacher profile already exists');
      }

      const languages = await tx.language.findMany({
        where: {
          code: {
            in: dto.languages,
          },
        },
      });

      const specialties = await tx.specialty.findMany({
        where: {
          code: {
            in: dto.specialties,
          },
        },
      });

      if (languages.length !== dto.languages.length) {
        throw new BadRequestException('Invalid languages');
      }

      if (specialties.length !== dto.specialties.length) {
        throw new BadRequestException('Invalid specialties');
      }

      const profile = await tx.teacherProfile.create({
        data: {
          userId,
          headline: dto.headline,
          bio: dto.bio,
          hourlyRate: dto.hourlyRate,
          profileImageUrl: dto.profileImageUrl,
          status: TeacherStatus.PENDING,
        },
      });

      await tx.teacherLanguage.createMany({
        data: languages.map((language) => ({
          teacherId: profile.id,
          languageId: language.id,
        })),
      });

      await tx.teacherSpecialty.createMany({
        data: specialties.map((specialty) => ({
          teacherId: profile.id,
          specialtyId: specialty.id,
        })),
      });

      return profile;
    });
  }

  async searchTeachers(query: SearchTeachersQueryDto) {
    return this.prisma.teacherProfile.findMany({
      where: {
        status: 'APPROVED',
        ...(query.language && {
          teacherLanguages: {
            some: {
              language: {
                code: query.language,
              },
            },
          },
        }),
        ...(query.specialty && {
          teacherSpecialties: {
            some: {
              specialty: {
                name: query.specialty,
              },
            },
          },
        }),
      },
      include: {
        user: true,
        teacherLanguages: {
          include: { language: true },
        },
        teacherSpecialties: {
          include: { specialty: true },
        },
      },
    });
  }

  async getAvailableLanguages() {
    return this.prisma.language.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async getAvailableSpecialties() {
    return this.prisma.specialty.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findTeacherById(id: string) {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: {
        id,
        status: TeacherStatus.APPROVED,
      },
      include: {
        user: true,
        teacherLanguages: {
          include: {
            language: true,
          },
        },
        teacherSpecialties: {
          include: {
            specialty: true,
          },
        },
      },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    return teacher;
  }
}
