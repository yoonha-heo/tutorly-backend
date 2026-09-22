import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '@/database/prisma/prisma.service';
import { LessonType } from '@prisma/client';
import { PaymentService } from '@/modules/payment/payment.service';

describe('BookingsService', () => {
  let service: BookingsService;
  const tx = {
    availability: {
      findUnique: jest.fn(),
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
    teacherProfile: {
      findUnique: jest.fn(),
    },
    booking: {
      findMany: jest.fn(),
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
        { provide: PaymentService, useValue: { stripe: {} } },
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

  describe('getMyTeachingLessons', () => {
    it('returns confirmed and completed bookings for the teacher', async () => {
      const bookings = [{ id: 'booking-id' }];
      prisma.teacherProfile.findUnique.mockResolvedValue({ id: 'teacher-id' });
      prisma.booking.findMany.mockResolvedValue(bookings);

      await expect(service.getMyTeachingLessons('teacher-user-id')).resolves.toBe(
        bookings,
      );
      expect(prisma.teacherProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'teacher-user-id' },
        select: { id: true },
      });
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teacherId: 'teacher-id',
            status: { in: ['CONFIRMED', 'COMPLETED'] },
          },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('rejects when the teacher profile does not exist', async () => {
      prisma.teacherProfile.findUnique.mockResolvedValue(null);

      await expect(service.getMyTeachingLessons('teacher-user-id')).rejects.toThrow(
        'Please create a teacher profile first.',
      );
      expect(prisma.booking.findMany).not.toHaveBeenCalled();
    });
  });

  describe('createBooking', () => {
    it('snapshots the teacher hourly rate as the booking price', async () => {
      const startAt = new Date('2026-07-16T01:00:00.000Z');
      tx.availability.findUnique.mockResolvedValue({
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
      tx.availability.findUnique.mockResolvedValue({
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
      ).rejects.toThrow("This teacher hasn't set a price yet. Please try another teacher.");
      expect(tx.booking.create).not.toHaveBeenCalled();
    });
  });
});
