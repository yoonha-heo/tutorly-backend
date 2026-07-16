import { Test, TestingModule } from '@nestjs/testing';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { UserRole } from '@prisma/client';

describe('BookingsController', () => {
  let controller: BookingsController;
  const bookingsService = {
    getMyLessons: jest.fn(),
    createBooking: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [{ provide: BookingsService, useValue: bookingsService }],
    }).compile();

    controller = module.get<BookingsController>(BookingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('gets lessons for the current user', () => {
    const user = { userId: 'student-id', role: UserRole.STUDENT };

    controller.getMyLessons(user);

    expect(bookingsService.getMyLessons).toHaveBeenCalledWith('student-id');
  });
});
