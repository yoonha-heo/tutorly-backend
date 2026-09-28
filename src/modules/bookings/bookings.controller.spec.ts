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

  it('gets lessons for the current user', async () => {
    const user = { userId: 'student-id', role: UserRole.STUDENT };

    await controller.getMyLessons(user);

    expect(bookingsService.getMyLessons).toHaveBeenCalledWith('student-id');
  });

  it('gets teaching lessons for the current teacher', async () => {
    const user = { userId: 'teacher-user-id', role: UserRole.TEACHER };

    await controller.getMyTeachingLessons(user);

    expect(bookingsService.getMyTeachingLessons).toHaveBeenCalledWith(
      'teacher-user-id',
    );
  });
});
