import { Test, TestingModule } from '@nestjs/testing';
import { TeacherStatus } from '@prisma/client';
import { PrismaService } from '@/database/prisma/prisma.service';
import { REDIS } from '@/modules/redis/redis.module';
import { TeachersService } from './teachers.service';

describe('TeachersService', () => {
  let service: TeachersService;
  const tx = {
    teacherProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    language: { findMany: jest.fn() },
    specialty: { findMany: jest.fn() },
    teacherLanguage: { deleteMany: jest.fn(), createMany: jest.fn() },
    teacherSpecialty: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const redis = { incr: jest.fn() };
  const profileDto = {
    headline: 'Algebra tutor',
    bio: 'Ten years of teaching',
    profileImageUrl: 'https://img.test/profile',
    hourlyRate: 40,
    languages: ['en'],
    specialties: ['algebra'],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    redis.incr.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS, useValue: redis },
      ],
    }).compile();

    service = module.get(TeachersService);
  });

  describe('createTeacherProfile', () => {
    it('creates the profile as pending review and links languages and specialties', async () => {
      tx.teacherProfile.findUnique.mockResolvedValue(null);
      tx.language.findMany.mockResolvedValue([{ id: 'lang-id', code: 'en' }]);
      tx.specialty.findMany.mockResolvedValue([
        { id: 'specialty-id', code: 'algebra' },
      ]);
      tx.teacherProfile.create.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.PENDING,
      });

      await expect(
        service.createTeacherProfile('user-id', profileDto),
      ).resolves.toMatchObject({ status: TeacherStatus.PENDING });

      expect(tx.teacherProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-id',
            status: TeacherStatus.PENDING,
            hourlyRate: 40,
          }) as object,
        }),
      );
      expect(tx.teacherLanguage.createMany).toHaveBeenCalledWith({
        data: [{ teacherId: 'teacher-id', languageId: 'lang-id' }],
      });
      expect(tx.teacherSpecialty.createMany).toHaveBeenCalledWith({
        data: [{ teacherId: 'teacher-id', specialtyId: 'specialty-id' }],
      });
    });

    it('rejects with TEACHER_PROFILE_ALREADY_EXISTS when a profile already exists', async () => {
      tx.teacherProfile.findUnique.mockResolvedValue({ id: 'teacher-id' });

      await expect(
        service.createTeacherProfile('user-id', profileDto),
      ).rejects.toMatchObject({ code: 'TEACHER_PROFILE_ALREADY_EXISTS' });
      expect(tx.teacherProfile.create).not.toHaveBeenCalled();
    });

    it('rejects with INVALID_LANGUAGES when the language codes do not match', async () => {
      tx.teacherProfile.findUnique.mockResolvedValue(null);
      tx.language.findMany.mockResolvedValue([]);
      tx.specialty.findMany.mockResolvedValue([
        { id: 'specialty-id', code: 'algebra' },
      ]);

      await expect(
        service.createTeacherProfile('user-id', profileDto),
      ).rejects.toMatchObject({ code: 'INVALID_LANGUAGES' });
      expect(tx.teacherProfile.create).not.toHaveBeenCalled();
    });
  });

  describe('updateTeacherProfile', () => {
    it('updates the profile, deletes only the removed languages, and clears the search cache', async () => {
      tx.teacherProfile.findUnique.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.APPROVED,
        teacherLanguages: [
          { languageId: 'old-lang' },
          { languageId: 'lang-id' },
        ],
        teacherSpecialties: [{ specialtyId: 'specialty-id' }],
      });
      tx.language.findMany.mockResolvedValue([{ id: 'lang-id', name: 'en' }]);
      tx.specialty.findMany.mockResolvedValue([
        { id: 'specialty-id', name: 'algebra' },
      ]);
      tx.teacherProfile.update.mockResolvedValue({ id: 'teacher-id' });

      await service.updateTeacherProfile('user-id', profileDto);

      expect(tx.teacherLanguage.deleteMany).toHaveBeenCalledWith({
        where: { teacherId: 'teacher-id', languageId: { in: ['old-lang'] } },
      });
      expect(tx.teacherLanguage.createMany).not.toHaveBeenCalled();
      expect(redis.incr).toHaveBeenCalled();
    });

    it('returns a rejected profile to pending review when it is updated', async () => {
      tx.teacherProfile.findUnique.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.REJECTED,
        teacherLanguages: [{ languageId: 'lang-id' }],
        teacherSpecialties: [{ specialtyId: 'specialty-id' }],
      });
      tx.language.findMany.mockResolvedValue([{ id: 'lang-id', name: 'en' }]);
      tx.specialty.findMany.mockResolvedValue([
        { id: 'specialty-id', name: 'algebra' },
      ]);
      tx.teacherProfile.update.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.PENDING,
      });

      await service.updateTeacherProfile('user-id', profileDto);

      expect(tx.teacherProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TeacherStatus.PENDING,
          }) as object,
        }),
      );
    });

    it('rejects with TEACHER_PROFILE_NOT_FOUND when the profile does not exist', async () => {
      tx.teacherProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTeacherProfile('user-id', profileDto),
      ).rejects.toMatchObject({ code: 'TEACHER_PROFILE_NOT_FOUND' });
      expect(redis.incr).not.toHaveBeenCalled();
    });
  });
});
