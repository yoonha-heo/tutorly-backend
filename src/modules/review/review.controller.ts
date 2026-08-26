import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { JwtPayload } from '@/modules/auth/types/jwt-payload.type';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsQueryDto } from './dto/reviews-query.dto';
import { ReviewService } from './review.service';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMyReviews(
    @CurrentUser() user: JwtPayload,
    @Query() query: ReviewsQueryDto,
  ) {
    return this.reviewService.getMyReviews(user.userId, query);
  }

  @Get('teacher/:teacherId')
  getTeacherReviews(
    @Param('teacherId') teacherId: string,
    @Query() query: ReviewsQueryDto,
  ) {
    return this.reviewService.getTeacherReviews(teacherId, query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  createReview(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.createReview(user.userId, dto);
  }
}
