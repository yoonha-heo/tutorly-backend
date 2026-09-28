import { Test, TestingModule } from '@nestjs/testing';
import { TeacherStatus } from '@prisma/client';
import { PrismaService } from '@/database/prisma/prisma.service';
import { AvailabilitiesService } from './availabilities.service';

describe('AvailabilitiesService', () => {
  let service: AvailabilitiesService;
  const prisma = {
    teacherProfile: { findUnique: jest.fn() },
    availability: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.availability.updateMany.mockReturnValue('update');
    prisma.$transaction.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilitiesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AvailabilitiesService);
  });

  describe('updateAvailabilities', () => {
    it("updates an approved teacher's slots by splitting them into open and closed", async () => {
      prisma.teacherProfile.findUnique.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.APPROVED,
      });
      prisma.availability.findMany.mockResolvedValue([
        { id: 'slot-open' },
        { id: 'slot-closed' },
      ]);

      await expect(
        service.updateAvailabilities('user-id', {
          items: [
            { id: 'slot-open', isOpen: true },
            { id: 'slot-closed', isOpen: false },
          ],
        }),
      ).resolves.toEqual({ updatedCount: 2 });

      expect(prisma.availability.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['slot-open'] }, teacherId: 'teacher-id' },
          data: { isOpen: true },
        }),
      );
      expect(prisma.availability.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['slot-closed'] }, teacherId: 'teacher-id' },
          data: { isOpen: false },
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('rejects with TEACHER_PROFILE_NOT_APPROVED before the profile is approved', async () => {
      prisma.teacherProfile.findUnique.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.PENDING,
      });

      await expect(
        service.updateAvailabilities('user-id', {
          items: [{ id: 'slot-open', isOpen: true }],
        }),
      ).rejects.toMatchObject({ code: 'TEACHER_PROFILE_NOT_APPROVED' });
      expect(prisma.availability.findMany).not.toHaveBeenCalled();
    });

    it('rejects with DUPLICATE_AVAILABILITY_IDS when the same slot id is duplicated', async () => {
      prisma.teacherProfile.findUnique.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.APPROVED,
      });

      await expect(
        service.updateAvailabilities('user-id', {
          items: [
            { id: 'slot-open', isOpen: true },
            { id: 'slot-open', isOpen: false },
          ],
        }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_AVAILABILITY_IDS' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects with AVAILABILITY_NOT_UPDATABLE and does not update when a booked slot is included', async () => {
      prisma.teacherProfile.findUnique.mockResolvedValue({
        id: 'teacher-id',
        status: TeacherStatus.APPROVED,
      });
      prisma.availability.findMany.mockResolvedValue([{ id: 'slot-open' }]);

      await expect(
        service.updateAvailabilities('user-id', {
          items: [
            { id: 'slot-open', isOpen: true },
            { id: 'slot-booked', isOpen: false },
          ],
        }),
      ).rejects.toMatchObject({ code: 'AVAILABILITY_NOT_UPDATABLE' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
