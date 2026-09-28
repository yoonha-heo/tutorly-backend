import { Test, TestingModule } from '@nestjs/testing';
import { TeacherStatus } from '@prisma/client';
import { PrismaService } from '@/database/prisma/prisma.service';
import { TeachersService } from '@/modules/teachers/teachers.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  const prisma = {
    teacherProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const teachersService = {
    bustTeacherSearchCache: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: TeachersService, useValue: teachersService },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  describe('approveTeacher', () => {
    it('approves a pending profile, clears the rejection reason, and clears the search cache', async () => {
      prisma.teacherProfile.findUnique.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.PENDING,
      });
      prisma.teacherProfile.update.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.APPROVED,
      });

      await expect(service.approveTeacher('teacher-id')).resolves.toMatchObject(
        {
          status: TeacherStatus.APPROVED,
        },
      );
      expect(prisma.teacherProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'teacher-id' },
          data: { status: TeacherStatus.APPROVED, rejectionReason: null },
        }),
      );
      expect(teachersService.bustTeacherSearchCache).toHaveBeenCalled();
    });

    it('rejects with TEACHER_PROFILE_NOT_FOUND when the profile does not exist', async () => {
      prisma.teacherProfile.findUnique.mockResolvedValue(null);

      await expect(service.approveTeacher('teacher-id')).rejects.toMatchObject({
        code: 'TEACHER_PROFILE_NOT_FOUND',
      });
      expect(prisma.teacherProfile.update).not.toHaveBeenCalled();
    });

    it('rejects with TEACHER_PROFILE_NOT_PENDING when the profile is not pending', async () => {
      prisma.teacherProfile.findUnique.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.APPROVED,
      });

      await expect(service.approveTeacher('teacher-id')).rejects.toMatchObject({
        code: 'TEACHER_PROFILE_NOT_PENDING',
      });
      expect(prisma.teacherProfile.update).not.toHaveBeenCalled();
      expect(teachersService.bustTeacherSearchCache).not.toHaveBeenCalled();
    });
  });

  describe('rejectTeacher', () => {
    it('rejects a pending profile and stores the reason', async () => {
      prisma.teacherProfile.findUnique.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.PENDING,
      });
      prisma.teacherProfile.update.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.REJECTED,
        rejectionReason: 'Incomplete bio',
      });

      await service.rejectTeacher('teacher-id', {
        rejectionReason: 'Incomplete bio',
      });

      expect(prisma.teacherProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: TeacherStatus.REJECTED,
            rejectionReason: 'Incomplete bio',
          },
        }),
      );
      expect(teachersService.bustTeacherSearchCache).not.toHaveBeenCalled();
    });
  });
});
