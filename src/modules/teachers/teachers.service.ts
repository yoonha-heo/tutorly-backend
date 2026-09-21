import { createHash } from 'crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  BookingStatus,
  Language,
  Specialty,
  TeacherStatus,
} from '@prisma/client';
import Redis from 'ioredis';
import { BusinessException } from '@/common/exceptions/business.exception';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { REDIS } from '@/modules/redis/redis.module';
import { TeacherProfileDto } from './dto/teacher-profile.dto';
import { SearchTeachersQueryDto } from './dto/search-teachers-query.dto';

const CATALOG_LANGUAGES_KEY = 'catalog:languages';
const CATALOG_SPECIALTIES_KEY = 'catalog:specialties';
const LESSON_COUNT_KEY = 'teacher:lessonCount';
const SEARCH_VERSION_KEY = 'teachers:search:version';
const CATALOG_TTL_SECONDS = 60 * 60 * 6;
const SEARCH_TTL_SECONDS = 60;

const TEACHER_CARD_INCLUDE = {
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

type CachedTeacherSearchPage = {
  items: Array<{ id: string }>;
  page: number;
  limit: number;
  totalCount: number;
  hasNextPage: boolean;
  nextPage: number | null;
};

@Injectable()
export class TeachersService {
  private readonly logger = new Logger(TeachersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async updateTeacherProfile(userId: string, dto: TeacherProfileDto) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.teacherProfile.findUnique({
        where: { userId },
        include: {
          teacherLanguages: true,
          teacherSpecialties: true,
        },
      });

      if (!profile) {
        throw new BusinessException(
          'TEACHER_PROFILE_NOT_FOUND',
          'Teacher profile not found. Please create one first.',
          HttpStatus.NOT_FOUND,
          { userId },
        );
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
        const foundNames = new Set(languages.map((language) => language.name));
        const invalidLanguages = dto.languages.filter(
          (language) => !foundNames.has(language),
        );

        throw new BusinessException(
          'INVALID_LANGUAGES',
          'Some selected languages are invalid. Please check and try again.',
          HttpStatus.BAD_REQUEST,
          { invalidLanguages },
        );
      }

      if (specialties.length !== dto.specialties.length) {
        const foundNames = new Set(
          specialties.map((specialty) => specialty.name),
        );
        const invalidSpecialties = dto.specialties.filter(
          (specialty) => !foundNames.has(specialty),
        );

        throw new BusinessException(
          'INVALID_SPECIALTIES',
          'Some selected specialties are invalid. Please check and try again.',
          HttpStatus.BAD_REQUEST,
          { invalidSpecialties },
        );
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

    await this.bustTeacherSearchCache();

    return updated;
  }

  async createTeacherProfile(userId: string, dto: TeacherProfileDto) {
    return this.prisma.$transaction(async (tx) => {
      const existingProfile = await tx.teacherProfile.findUnique({
        where: { userId },
      });

      if (existingProfile) {
        throw new BusinessException(
          'TEACHER_PROFILE_ALREADY_EXISTS',
          'You already have a teacher profile.',
          HttpStatus.CONFLICT,
          { userId, teacherProfileId: existingProfile.id },
        );
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
        const foundCodes = new Set(languages.map((language) => language.code));
        const invalidLanguages = dto.languages.filter(
          (language) => !foundCodes.has(language),
        );

        throw new BusinessException(
          'INVALID_LANGUAGES',
          'Some selected languages are invalid. Please check and try again.',
          HttpStatus.BAD_REQUEST,
          { invalidLanguages },
        );
      }

      if (specialties.length !== dto.specialties.length) {
        const foundCodes = new Set(
          specialties.map((specialty) => specialty.code),
        );
        const invalidSpecialties = dto.specialties.filter(
          (specialty) => !foundCodes.has(specialty),
        );

        throw new BusinessException(
          'INVALID_SPECIALTIES',
          'Some selected specialties are invalid. Please check and try again.',
          HttpStatus.BAD_REQUEST,
          { invalidSpecialties },
        );
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
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 6);
    const skip = (page - 1) * limit;
    const cacheKey = await this.buildSearchCacheKey(query, page, limit);
    const cached = await this.readCache(cacheKey);

    if (cached) {
      try {
        const result = JSON.parse(cached) as CachedTeacherSearchPage;
        const lessonCounts = await this.getLessonCounts(
          result.items.map((item) => item.id),
        );

        return {
          ...result,
          items: result.items.map((item) => ({
            ...item,
            lessonCount: lessonCounts.get(item.id) ?? 0,
          })),
        };
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          throw error;
        }

        this.logger.warn(`Corrupt teacher search cache for ${cacheKey}`);
      }
    }

    const where = this.buildSearchWhere(query);

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.teacherProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: TEACHER_CARD_INCLUDE,
      }),
      this.prisma.teacherProfile.count({ where }),
    ]);

    const lessonCounts = await this.getLessonCounts(
      items.map((item) => item.id),
    );
    const hasNextPage = page * limit < totalCount;
    const result = {
      items: items.map((item) =>
        withLessonCount(item, lessonCounts.get(item.id) ?? 0),
      ),
      page,
      limit,
      totalCount,
      hasNextPage,
      nextPage: hasNextPage ? page + 1 : null,
    };

    await this.writeCache(cacheKey, JSON.stringify(result), SEARCH_TTL_SECONDS);

    return result;
  }

  async getAvailableLanguages() {
    const cached = await this.readCache(CATALOG_LANGUAGES_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as Language[];
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          throw error;
        }

        this.logger.warn('Corrupt language catalog cache');
      }
    }

    const languages = await this.prisma.language.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    await this.writeCache(
      CATALOG_LANGUAGES_KEY,
      JSON.stringify(languages),
      CATALOG_TTL_SECONDS,
    );

    return languages;
  }

  async getAvailableSpecialties() {
    const cached = await this.readCache(CATALOG_SPECIALTIES_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as Specialty[];
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          throw error;
        }

        this.logger.warn('Corrupt specialty catalog cache');
      }
    }

    const specialties = await this.prisma.specialty.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    await this.writeCache(
      CATALOG_SPECIALTIES_KEY,
      JSON.stringify(specialties),
      CATALOG_TTL_SECONDS,
    );

    return specialties;
  }

  async findTeacherById(id: string) {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: {
        id,
        status: TeacherStatus.APPROVED,
      },
      include: TEACHER_CARD_INCLUDE,
    });

    if (!teacher) {
      throw new BusinessException(
        'TEACHER_NOT_FOUND',
        'This teacher could not be found.',
        HttpStatus.NOT_FOUND,
        { teacherId: id },
      );
    }

    const lessonCounts = await this.getLessonCounts([teacher.id]);

    return withLessonCount(teacher, lessonCounts.get(teacher.id) ?? 0);
  }

  async getTeacherAvailabilities(teacherId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: {
        id: teacherId,
        status: 'APPROVED',
      },
    });

    if (!teacher) {
      throw new BusinessException(
        'TEACHER_NOT_FOUND',
        'This teacher could not be found.',
        HttpStatus.NOT_FOUND,
        { teacherId },
      );
    }

    return this.prisma.availability.findMany({
      where: {
        teacherId,
        isOpen: true,
        startAt: {
          gte: new Date(),
        },
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
      select: {
        id: true,
        startAt: true,
        endAt: true,
      },
      orderBy: {
        startAt: 'asc',
      },
    });
  }

  async bustTeacherSearchCache() {
    try {
      await this.redis.incr(SEARCH_VERSION_KEY);
    } catch (error) {
      this.logger.warn(
        `Failed to bust teacher search cache: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async incrementLessonCount(teacherId: string) {
    try {
      const exists = await this.redis.hexists(LESSON_COUNT_KEY, teacherId);
      if (!exists) {
        return;
      }

      await this.redis.hincrby(LESSON_COUNT_KEY, teacherId, 1);
    } catch (error) {
      this.logger.warn(
        `Failed to increment lesson count for ${teacherId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private buildSearchWhere(query: SearchTeachersQueryDto) {
    return {
      status: TeacherStatus.APPROVED,

      ...(query.keyword && {
        OR: [
          {
            headline: { contains: query.keyword, mode: 'insensitive' as const },
          },
          {
            user: {
              name: { contains: query.keyword, mode: 'insensitive' as const },
            },
          },
        ],
      }),

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
              code: query.specialty,
            },
          },
        },
      }),
    };
  }

  private async buildSearchCacheKey(
    query: SearchTeachersQueryDto,
    page: number,
    limit: number,
  ) {
    const version = (await this.readCache(SEARCH_VERSION_KEY)) ?? '0';
    const filterHash = createHash('sha1')
      .update(
        JSON.stringify({
          keyword: query.keyword ?? '',
          language: query.language ?? '',
          specialty: query.specialty ?? '',
        }),
      )
      .digest('hex');

    return `teachers:search:v${version}:${filterHash}:p${page}:l${limit}`;
  }

  private async getLessonCounts(teacherIds: string[]) {
    const counts = new Map<string, number>();
    if (teacherIds.length === 0) {
      return counts;
    }

    let cached: Array<string | null>;
    try {
      cached = await this.redis.hmget(LESSON_COUNT_KEY, ...teacherIds);
    } catch (error) {
      this.logger.warn(
        `Redis lesson count read failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      cached = teacherIds.map(() => null);
    }
    const missing: string[] = [];

    teacherIds.forEach((teacherId, index) => {
      const value = cached[index];
      if (value === null) {
        missing.push(teacherId);
        return;
      }

      counts.set(teacherId, Number(value));
    });

    if (missing.length === 0) {
      return counts;
    }

    const rows = await this.prisma.booking.groupBy({
      by: ['teacherId'],
      where: {
        teacherId: { in: missing },
        status: BookingStatus.COMPLETED,
      },
      _count: { _all: true },
    });
    const counted = new Map(
      rows.map((row) => [row.teacherId, row._count._all]),
    );

    try {
      const pipeline = this.redis.pipeline();
      for (const teacherId of missing) {
        const count = counted.get(teacherId) ?? 0;
        counts.set(teacherId, count);
        pipeline.hset(LESSON_COUNT_KEY, teacherId, count);
      }
      await pipeline.exec();
    } catch (error) {
      this.logger.warn(
        `Redis lesson count write failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      for (const teacherId of missing) {
        counts.set(teacherId, counted.get(teacherId) ?? 0);
      }
    }

    return counts;
  }

  private async readCache(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.warn(
        `Redis read failed for ${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  private async writeCache(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Redis write failed for ${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}

function withLessonCount<T extends { id: string }>(
  teacher: T,
  lessonCount: number,
) {
  return {
    ...teacher,
    lessonCount,
  };
}
