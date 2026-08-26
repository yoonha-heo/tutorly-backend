import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { BusinessException } from '@/common/exceptions/business.exception';
import { PrismaService } from '@/database/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsQueryDto } from './dto/reviews-query.dto';

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

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

    try {
      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            bookingId: booking.id,
            rating: dto.rating,
            comment: dto.comment,
          },
        });

        const stats = await tx.review.aggregate({
          where: {
            booking: { teacherId: booking.teacherId },
          },
          _avg: { rating: true },
          _count: { _all: true },
        });

        await tx.teacherProfile.update({
          where: { id: booking.teacherId },
          data: {
            averageRating: stats._avg.rating ?? 0,
            reviewCount: stats._count._all,
          },
        });

        return review;
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
