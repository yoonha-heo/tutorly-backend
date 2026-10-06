import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/database/prisma/prisma.service';
import { AvailabilitySlotsService } from './availability-slots.service';

describe('AvailabilitySlotsService', () => {
  let service: AvailabilitySlotsService;
  const prisma = {
    teacherProfile: { findMany: jest.fn() },
    availability: { createMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilitySlotsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AvailabilitySlotsService);
  });

  describe('generateDailyAvailabilitySlots', () => {
    it('creates slots in the teacher timezone and skips duplicates', async () => {
      prisma.teacherProfile.findMany.mockResolvedValue([
        { id: 'teacher-id', timezone: 'Asia/Seoul' },
      ]);
      prisma.availability.createMany.mockResolvedValue({ count: 10 });

      await service.generateDailyAvailabilitySlots();

      expect(prisma.availability.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skipDuplicates: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              teacherId: 'teacher-id',
              isOpen: true,
            }),
          ]) as object[],
        }),
      );
    });

    it('does not insert slots when there are no teachers', async () => {
      prisma.teacherProfile.findMany.mockResolvedValue([]);

      await service.generateDailyAvailabilitySlots();

      expect(prisma.availability.createMany).not.toHaveBeenCalled();
    });
  });
});
