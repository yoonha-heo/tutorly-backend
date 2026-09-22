import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { BusinessException } from '@/common/exceptions/business.exception';
import { PrismaService } from '@/database/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import {
  type ReceivedReviewItem,
  type ReviewListResponse,
  type WrittenReviewItem,
} from './dto/review-list.dto';
import { ReviewsQueryDto } from './dto/reviews-query.dto';
import { TeachersService } from '@/modules/teachers/teachers.service';

const RECEIVED_REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  booking: {
    select: {
      id: true,
      lessonStartAt: true,
      lessonEndAt: true,
      student: {
        select: {
          id: true,
          name: true,
          profileImage: true,
        },
      },
    },
  },
} as const;

const WRITTEN_REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  booking: {
    select: {
      id: true,
      lessonStartAt: true,
      lessonEndAt: true,
      teacher: {
        select: {
          id: true,
          headline: true,
          profileImageUrl: true,
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teachersService: TeachersService,
  ) { }

  async createReview(userId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      select: {
        id: true,
        studentId: true,
        teacherId: true,
        status: true,
        lessonEndAt: true,
        review: { select: { id: true } },
      },
    });

    if (!booking) {
      throw new BusinessException(
        'BOOKING_NOT_FOUND',
        'This booking could not be found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (booking.studentId !== userId) {
      throw new BusinessException(
        'REVIEW_ACCESS_DENIED',
        'You can only review your own lessons.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      booking.status !== BookingStatus.COMPLETED ||
      booking.lessonEndAt > new Date()
    ) {
      throw new BusinessException(
        'REVIEW_NOT_ALLOWED',
        'You can only review a completed lesson after it has ended.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (booking.review) {
      throw new BusinessException(
        'REVIEW_ALREADY_EXISTS',
        'You have already reviewed this lesson.',
        HttpStatus.CONFLICT,
      );
    }

    let review;
    try {
      review = await this.prisma.$transaction(async (tx) => {
        const [teacher] = await tx.$queryRaw<
          Array<{ averageRating: number; reviewCount: number }>
        >(Prisma.sql`
          SELECT "averageRating", "reviewCount"
          FROM "TeacherProfile"
          WHERE id = ${booking.teacherId}
          FOR UPDATE
        `);

        const createdReview = await tx.review.create({
          data: {
            bookingId: booking.id,
            rating: dto.rating,
            comment: dto.comment,
          },
        });

        const reviewCount = teacher.reviewCount + 1;
        const averageRating =
          (teacher.averageRating * teacher.reviewCount + dto.rating) /
          reviewCount;

        await tx.teacherProfile.update({
          where: { id: booking.teacherId },
          data: {
            averageRating,
            reviewCount,
          },
        });

        await tx.user.update({
          where: { id: booking.studentId },
          data: { reviewCount: { increment: 1 } },
        });

        return createdReview;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BusinessException(
          'REVIEW_ALREADY_EXISTS',
          'You have already reviewed this lesson.',
          HttpStatus.CONFLICT,
        );
      }

      throw error;
    }

    await this.teachersService.bustTeacherSearchCache();

    return review;
  }

  async getTeacherReviews(
    teacherId: string,
    query: ReviewsQueryDto,
  ): Promise<ReviewListResponse<ReceivedReviewItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [reviews, teacher] = await Promise.all([
      this.findReceivedReviews(teacherId, skip, limit),
      this.prisma.teacherProfile.findUnique({
        where: { id: teacherId },
        select: { reviewCount: true },
      }),
    ]);

    const totalCount = teacher?.reviewCount ?? 0;
    const hasNextPage = page * limit < totalCount;

    return {
      items: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        booking: {
          id: review.booking.id,
          lessonStartAt: review.booking.lessonStartAt,
          lessonEndAt: review.booking.lessonEndAt,
          student: {
            id: review.booking.student.id,
            name: review.booking.student.name,
            profileImage: review.booking.student.profileImage,
          },
        },
      })),
      page,
      limit,
      totalCount,
      hasNextPage,
      nextPage: hasNextPage ? page + 1 : null,
    };
  }

  async getMyTeachingReviews(
    userId: string,
    query: ReviewsQueryDto,
  ): Promise<ReviewListResponse<ReceivedReviewItem>> {
    const teacherProfile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true, reviewCount: true },
    });

    if (!teacherProfile) {
      throw new BusinessException(
        'TEACHER_PROFILE_REQUIRED',
        'Please create a teacher profile first.',
        HttpStatus.FORBIDDEN,
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const reviews = await this.findReceivedReviews(
      teacherProfile.id,
      skip,
      limit,
    );
    const totalCount = teacherProfile.reviewCount;
    const hasNextPage = page * limit < totalCount;

    return {
      items: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        booking: {
          id: review.booking.id,
          lessonStartAt: review.booking.lessonStartAt,
          lessonEndAt: review.booking.lessonEndAt,
          student: {
            id: review.booking.student.id,
            name: review.booking.student.name,
            profileImage: review.booking.student.profileImage,
          },
        },
      })),
      page,
      limit,
      totalCount,
      hasNextPage,
      nextPage: hasNextPage ? page + 1 : null,
    };
  }

  async getMyReviews(
    studentId: string,
    query: ReviewsQueryDto,
  ): Promise<ReviewListResponse<WrittenReviewItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [reviews, student] = await Promise.all([
      this.prisma.review.findMany({
        where: { booking: { studentId } },
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: WRITTEN_REVIEW_SELECT,
      }),
      this.prisma.user.findUnique({
        where: { id: studentId },
        select: { reviewCount: true },
      }),
    ]);

    const totalCount = student?.reviewCount ?? 0;
    const hasNextPage = page * limit < totalCount;

    return {
      items: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        booking: {
          id: review.booking.id,
          lessonStartAt: review.booking.lessonStartAt,
          lessonEndAt: review.booking.lessonEndAt,
          teacher: {
            id: review.booking.teacher.id,
            headline: review.booking.teacher.headline,
            profileImageUrl: review.booking.teacher.profileImageUrl,
            user: {
              id: review.booking.teacher.user.id,
              name: review.booking.teacher.user.name,
            },
          },
        },
      })),
      page,
      limit,
      totalCount,
      hasNextPage,
      nextPage: hasNextPage ? page + 1 : null,
    };
  }

  private findReceivedReviews(teacherId: string, skip: number, take: number) {
    return this.prisma.review.findMany({
      where: { booking: { teacherId } },
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: RECEIVED_REVIEW_SELECT,
    });
  }
}
