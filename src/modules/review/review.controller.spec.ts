import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

describe('ReviewController', () => {
  let controller: ReviewController;
  const reviewService = {
    createReview: jest.fn(),
    getMyReviews: jest.fn(),
    getTeacherReviews: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewController],
      providers: [{ provide: ReviewService, useValue: reviewService }],
    }).compile();

    controller = module.get<ReviewController>(ReviewController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a review for the current user', () => {
    const user = { userId: 'student-id', role: UserRole.STUDENT };
    const dto = { bookingId: 'booking-id', rating: 5 };

    controller.createReview(user, dto);

    expect(reviewService.createReview).toHaveBeenCalledWith(
      'student-id',
      dto,
    );
  });
});
