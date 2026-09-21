import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { BusinessException } from '@/common/exceptions/business.exception';
import { PrismaService } from '@/database/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsQueryDto } from './dto/reviews-query.dto';
import { TeachersService } from '@/modules/teachers/teachers.service';

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teachersService: TeachersService,
  ) {}

  async createReview(userId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { review: true },
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

  async getTeacherReviews(teacherId: string, query: ReviewsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 4;
    const skip = (page - 1) * limit;
    const where = { booking: { teacherId } };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
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
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    const hasNextPage = page * limit < totalCount;

    return {
      items,
      page,
      limit,
      totalCount,
      hasNextPage,
      nextPage: hasNextPage ? page + 1 : null,
    };
  }

  async getMyReviews(studentId: string, query: ReviewsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 4;
    const skip = (page - 1) * limit;
    const where = { booking: { studentId } };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
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
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    const hasNextPage = page * limit < totalCount;

    return {
      items,
      page,
      limit,
      totalCount,
      hasNextPage,
      nextPage: hasNextPage ? page + 1 : null,
    };
  }
}
