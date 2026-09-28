import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/database/prisma/prisma.service';
import { TeachersService } from '@/modules/teachers/teachers.service';
import { ReviewService } from './review.service';

describe('ReviewService', () => {
  let service: ReviewService;
  const prisma = {
    teacherProfile: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    review: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    booking: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const teachersService = {
    bustTeacherSearchCache: jest.fn(),
  };
  const tx = {
    $queryRaw: jest.fn(),
    review: { create: jest.fn() },
    teacherProfile: { update: jest.fn() },
    user: { update: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        { provide: PrismaService, useValue: prisma },
        { provide: TeachersService, useValue: teachersService },
      ],
    }).compile();

    service = module.get<ReviewService>(ReviewService);
  });

  describe('getTeacherReviews', () => {
    it('returns the newest reviews first using the denormalized review count', async () => {
      const items = [
        {
          id: 'review-id',
          rating: 5,
          comment: 'Great',
          createdAt: new Date('2026-09-22'),
          booking: {
            id: 'booking-id',
            lessonStartAt: new Date('2026-09-20'),
            lessonEndAt: new Date('2026-09-20'),
            student: {
              id: 'student-id',
              name: 'Jane',
              profileImage: null,
            },
          },
        },
      ];
      prisma.review.findMany.mockResolvedValue(items);
      prisma.teacherProfile.findUnique.mockResolvedValue({ reviewCount: 41 });

      await expect(
        service.getTeacherReviews('teacher-id', { page: 2, limit: 20 }),
      ).resolves.toEqual({
        items,
        page: 2,
        limit: 20,
        totalCount: 41,
        hasNextPage: true,
        nextPage: 3,
      });

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { booking: { teacherId: 'teacher-id' } },
          skip: 20,
          take: 20,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(prisma.review.count).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getMyTeachingReviews', () => {
    it('returns received reviews for the current teacher', async () => {
      const items = [
        {
          id: 'review-id',
          rating: 5,
          comment: 'Great',
          createdAt: new Date('2026-09-22'),
          booking: {
            id: 'booking-id',
            lessonStartAt: new Date('2026-09-20'),
            lessonEndAt: new Date('2026-09-20'),
            student: {
              id: 'student-id',
              name: 'Jane',
              profileImage: null,
            },
          },
        },
      ];
      prisma.teacherProfile.findUnique.mockResolvedValue({
        id: 'teacher-id',
        reviewCount: 1,
      });
      prisma.review.findMany.mockResolvedValue(items);

      await expect(
        service.getMyTeachingReviews('teacher-user-id', { page: 1, limit: 20 }),
      ).resolves.toEqual({
        items,
        page: 1,
        limit: 20,
        totalCount: 1,
        hasNextPage: false,
        nextPage: null,
      });

      expect(prisma.teacherProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'teacher-user-id' },
        select: { id: true, reviewCount: true },
      });
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { booking: { teacherId: 'teacher-id' } },
        }),
      );
      expect(prisma.review.count).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when the teacher profile does not exist', async () => {
      prisma.teacherProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.getMyTeachingReviews('teacher-user-id', { page: 1, limit: 20 }),
      ).rejects.toThrow('Please create a teacher profile first.');
      expect(prisma.review.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getMyReviews', () => {
    it('returns the reviews written by the current student', async () => {
      const items = [
        {
          id: 'review-id',
          rating: 5,
          comment: 'Great',
          createdAt: new Date('2026-09-22'),
          booking: {
            id: 'booking-id',
            lessonStartAt: new Date('2026-09-20'),
            lessonEndAt: new Date('2026-09-20'),
            teacher: {
              id: 'teacher-id',
              headline: 'Math tutor',
              profileImageUrl: null,
              user: {
                id: 'teacher-user-id',
                name: 'Alex',
              },
            },
          },
        },
      ];
      prisma.review.findMany.mockResolvedValue(items);
      prisma.user.findUnique.mockResolvedValue({ reviewCount: 1 });

      await expect(
        service.getMyReviews('student-id', { page: 1, limit: 20 }),
      ).resolves.toEqual({
        items,
        page: 1,
        limit: 20,
        totalCount: 1,
        hasNextPage: false,
        nextPage: null,
      });

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { booking: { studentId: 'student-id' } },
          skip: 0,
          take: 20,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'student-id' },
        select: { reviewCount: true },
      });
      expect(prisma.review.count).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('createReview', () => {
    const endedAt = new Date(Date.now() - 60 * 60 * 1000);

    function completedBooking() {
      return {
        id: 'booking-id',
        studentId: 'student-id',
        teacherId: 'teacher-id',
        status: BookingStatus.COMPLETED,
        lessonEndAt: endedAt,
        review: null,
      };
    }

    it('updates the teacher rating and review count and clears the search cache when a review is left on a finished lesson', async () => {
      prisma.booking.findUnique.mockResolvedValue(completedBooking());
      prisma.$transaction.mockImplementation(
        (callback: (transaction: typeof tx) => unknown) => callback(tx),
      );
      tx.$queryRaw.mockResolvedValue([{ averageRating: 4, reviewCount: 2 }]);
      tx.review.create.mockResolvedValue({ id: 'review-id', rating: 5 });

      await expect(
        service.createReview('student-id', {
          bookingId: 'booking-id',
          rating: 5,
          comment: 'Clear explanations',
        }),
      ).resolves.toEqual({ id: 'review-id', rating: 5 });

      expect(tx.teacherProfile.update).toHaveBeenCalledWith({
        where: { id: 'teacher-id' },
        data: { averageRating: 13 / 3, reviewCount: 3 },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'student-id' },
        data: { reviewCount: { increment: 1 } },
      });
      expect(teachersService.bustTeacherSearchCache).toHaveBeenCalled();
    });

    it('rejects with REVIEW_ACCESS_DENIED when the student is not the booking owner', async () => {
      prisma.booking.findUnique.mockResolvedValue(completedBooking());

      await expect(
        service.createReview('other-user', {
          bookingId: 'booking-id',
          rating: 5,
          comment: 'Clear explanations',
        }),
      ).rejects.toMatchObject({ code: 'REVIEW_ACCESS_DENIED' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects with REVIEW_NOT_ALLOWED before the lesson has ended', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...completedBooking(),
        status: BookingStatus.CONFIRMED,
      });

      await expect(
        service.createReview('student-id', {
          bookingId: 'booking-id',
          rating: 5,
          comment: 'Clear explanations',
        }),
      ).rejects.toMatchObject({ code: 'REVIEW_NOT_ALLOWED' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects with REVIEW_ALREADY_EXISTS when the same lesson review is submitted concurrently', async () => {
      prisma.booking.findUnique.mockResolvedValue(completedBooking());
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        service.createReview('student-id', {
          bookingId: 'booking-id',
          rating: 5,
          comment: 'Clear explanations',
        }),
      ).rejects.toMatchObject({ code: 'REVIEW_ALREADY_EXISTS' });
      expect(teachersService.bustTeacherSearchCache).not.toHaveBeenCalled();
    });
  });
});
