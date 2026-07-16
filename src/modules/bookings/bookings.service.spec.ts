import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '@/database/prisma/prisma.service';
import { LessonType } from '@prisma/client';

describe('BookingsService', () => {
  let service: BookingsService;
  const tx = {
    availability: {
      findMany: jest.fn(),
    },
    booking: {
      create: jest.fn(),
    },
    availabilityBlock: {
      createMany: jest.fn(),
    },
  };
  const prisma = {
    booking: {
      findMany: jest.fn(),
    },
    availability: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMyLessons', () => {
    it('returns the student bookings ordered by lesson start time', async () => {
      const bookings = [{ id: 'booking-id' }];
      prisma.booking.findMany.mockResolvedValue(bookings);

      await expect(service.getMyLessons('student-id')).resolves.toBe(bookings);
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId: 'student-id' },
          orderBy: { lessonStartAt: 'asc' },
        }),
      );
    });
  });

  describe('createBooking', () => {
    it('snapshots the teacher hourly rate as the booking price', async () => {
      const startAt = new Date('2026-07-16T01:00:00.000Z');
      prisma.availability.findUnique.mockResolvedValue({
        id: 'availability-id',
        teacherId: 'teacher-id',
        teacher: { userId: 'teacher-user-id', hourlyRate: 40 },
        startAt,
        endAt: new Date('2026-07-16T01:30:00.000Z'),
        isOpen: true,
        blocks: [],
      });
      tx.availability.findMany.mockResolvedValue([]);
      tx.booking.create.mockResolvedValue({ id: 'booking-id', price: 40 });
      tx.availabilityBlock.createMany.mockResolvedValue({ count: 0 });

      await service.createBooking('student-id', {
        availabilityId: 'availability-id',
        lessonType: LessonType.STANDARD,
      });

      expect(tx.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ price: 40 }),
        }),
      );
    });

    it('rejects a booking when the teacher hourly rate is not set', async () => {
      prisma.availability.findUnique.mockResolvedValue({
        id: 'availability-id',
        teacherId: 'teacher-id',
        teacher: { userId: 'teacher-user-id', hourlyRate: null },
        startAt: new Date('2026-07-16T01:00:00.000Z'),
        endAt: new Date('2026-07-16T01:30:00.000Z'),
        isOpen: true,
        blocks: [],
      });

      await expect(
        service.createBooking('student-id', {
          availabilityId: 'availability-id',
          lessonType: LessonType.STANDARD,
        }),
      ).rejects.toThrow('Teacher hourly rate is not set');
      expect(tx.booking.create).not.toHaveBeenCalled();
    });
  });
});
