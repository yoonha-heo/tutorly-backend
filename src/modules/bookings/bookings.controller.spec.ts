import { Test, TestingModule } from '@nestjs/testing';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { UserRole } from '@prisma/client';

describe('BookingsController', () => {
  let controller: BookingsController;
  const bookingsService = {
    getMyLessons: jest.fn(),
    getMyTeachingLessons: jest.fn(),
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

  it('gets teaching lessons for the current teacher', () => {
    const user = { userId: 'teacher-user-id', role: UserRole.TEACHER };

    controller.getMyTeachingLessons(user);

    expect(bookingsService.getMyTeachingLessons).toHaveBeenCalledWith(
      'teacher-user-id',
    );
  });
});
