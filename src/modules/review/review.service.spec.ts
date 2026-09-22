import { Test, TestingModule } from '@nestjs/testing';
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
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        { provide: PrismaService, useValue: prisma },
        { provide: TeachersService, useValue: { bustTeacherSearchCache: jest.fn() } },
      ],
    }).compile();

    service = module.get<ReviewService>(ReviewService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
      prisma.teacherProfile.findUnique.mockResolvedValue({ reviewCount: 21 });

      await expect(
        service.getTeacherReviews('teacher-id', { page: 2, limit: 20 }),
      ).resolves.toEqual({
        items,
        page: 2,
        limit: 20,
        totalCount: 21,
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
});
