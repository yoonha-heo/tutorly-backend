import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '@/database/prisma/prisma.service';
import { BookingStatus, LessonType, PaymentStatus, Prisma } from '@prisma/client';
import { PaymentService } from '@/modules/payment/payment.service';

describe('BookingsService', () => {
  let service: BookingsService;
  const tx = {
    $queryRaw: jest.fn(),
    availability: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    booking: {
      create: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      update: jest.fn(),
    },
    availabilityBlock: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const prisma = {
    teacherProfile: {
      findUnique: jest.fn(),
    },
    booking: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const stripe = {
    paymentIntents: { cancel: jest.fn() },
    refunds: { create: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymentService, useValue: { stripe } },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  describe('getMyLessons', () => {
    it('returns the student bookings ordered by lesson start time', async () => {
      const bookings = [{ id: 'booking-id' }];
      prisma.booking.findMany.mockResolvedValue(bookings);

      await expect(service.getMyLessons('student-id')).resolves.toBe(bookings);
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId: 'student-id' },
          orderBy: { createdAt: 'desc' },
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

    it('rejects with CANNOT_BOOK_OWN_LESSON when booking your own slot', async () => {
      tx.availability.findUnique.mockResolvedValue({
        id: 'availability-id',
        teacherId: 'teacher-id',
        teacher: { userId: 'student-id', hourlyRate: 40 },
        startAt: new Date('2026-07-16T01:00:00.000Z'),
        isOpen: true,
        blocks: [],
      });

      await expect(
        service.createBooking('student-id', {
          availabilityId: 'availability-id',
          lessonType: LessonType.STANDARD,
        }),
      ).rejects.toMatchObject({ code: 'CANNOT_BOOK_OWN_LESSON' });
      expect(tx.booking.create).not.toHaveBeenCalled();
    });

    it('rejects with AVAILABILITY_ALREADY_BOOKED when the slot is already taken', async () => {
      tx.availability.findUnique.mockResolvedValue({
        id: 'availability-id',
        teacherId: 'teacher-id',
        teacher: { userId: 'teacher-user-id', hourlyRate: 40 },
        startAt: new Date('2026-07-16T01:00:00.000Z'),
        isOpen: true,
        blocks: [{ bookingId: 'existing-booking' }],
      });

      await expect(
        service.createBooking('student-id', {
          availabilityId: 'availability-id',
          lessonType: LessonType.STANDARD,
        }),
      ).rejects.toMatchObject({ code: 'AVAILABILITY_ALREADY_BOOKED' });
      expect(tx.booking.create).not.toHaveBeenCalled();
    });

    it('rejects with TIME_SLOT_ALREADY_RESERVED on an active booking unique conflict', async () => {
      prisma.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: 'unique_active_booking_per_slot' },
        }),
      );

      await expect(
        service.createBooking('student-id', {
          availabilityId: 'availability-id',
          lessonType: LessonType.STANDARD,
        }),
      ).rejects.toMatchObject({ code: 'TIME_SLOT_ALREADY_RESERVED' });
    });
  });

  describe('cancelBooking', () => {
    const futureStart = new Date(Date.now() + 60 * 60 * 1000);

    it('refunds a confirmed booking with an idempotency key, then cancels it and releases the slot block', async () => {
      tx.$queryRaw.mockResolvedValue([
        { status: BookingStatus.CONFIRMED, lessonStartAt: futureStart },
      ]);
      prisma.payment.findUnique.mockResolvedValue({
        paymentIntentId: 'pi_test',
      });

      await expect(
        service.cancelBooking('booking-id', 'student-id'),
      ).resolves.toEqual({ success: true });

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: 'pi_test' },
        { idempotencyKey: 'cancel_booking-id' },
      );
      expect(tx.booking.update).toHaveBeenCalledWith({
        where: { id: 'booking-id' },
        data: { status: BookingStatus.CANCELLED },
      });
      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { bookingId: 'booking-id' },
        data: { status: PaymentStatus.REFUNDED },
      });
      expect(tx.availabilityBlock.deleteMany).toHaveBeenCalledWith({
        where: { bookingId: 'booking-id' },
      });
    });

    it('rejects with BOOKING_NOT_CANCELLABLE when the booking is already cancelled or refunding', async () => {
      tx.$queryRaw.mockResolvedValue([
        { status: BookingStatus.CANCELLED, lessonStartAt: futureStart },
      ]);

      await expect(
        service.cancelBooking('booking-id', 'student-id'),
      ).rejects.toMatchObject({ code: 'BOOKING_NOT_CANCELLABLE' });
      expect(stripe.refunds.create).not.toHaveBeenCalled();
      expect(tx.booking.update).not.toHaveBeenCalled();
    });

    it('rejects with BOOKING_CANCEL_WINDOW_CLOSED after the lesson has started', async () => {
      tx.$queryRaw.mockResolvedValue([
        {
          status: BookingStatus.CONFIRMED,
          lessonStartAt: new Date(Date.now() - 60 * 1000),
        },
      ]);

      await expect(
        service.cancelBooking('booking-id', 'student-id'),
      ).rejects.toMatchObject({ code: 'BOOKING_CANCEL_WINDOW_CLOSED' });
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('restores the original booking status and throws BOOKING_CANCEL_FAILED when the Stripe refund fails', async () => {
      tx.$queryRaw.mockResolvedValue([
        { status: BookingStatus.CONFIRMED, lessonStartAt: futureStart },
      ]);
      prisma.payment.findUnique.mockResolvedValue({
        paymentIntentId: 'pi_test',
      });
      stripe.refunds.create.mockRejectedValue(new Error('stripe down'));

      await expect(
        service.cancelBooking('booking-id', 'student-id'),
      ).rejects.toMatchObject({ code: 'BOOKING_CANCEL_FAILED' });
      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'booking-id' },
        data: { status: BookingStatus.CONFIRMED },
      });
      expect(tx.payment.update).not.toHaveBeenCalled();
    });
  });
});
