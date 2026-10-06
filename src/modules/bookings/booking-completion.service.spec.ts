import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/database/prisma/prisma.service';
import { TeachersService } from '@/modules/teachers/teachers.service';
import { BookingCompletionService } from './booking-completion.service';

describe('BookingCompletionService', () => {
  let service: BookingCompletionService;
  const tx = {
    $queryRaw: jest.fn(),
    availabilityBlock: { deleteMany: jest.fn() },
  };
  const prisma = {
    booking: { findMany: jest.fn() },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const teachersService = {
    incrementLessonCount: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingCompletionService,
        { provide: PrismaService, useValue: prisma },
        { provide: TeachersService, useValue: teachersService },
      ],
    }).compile();

    service = module.get(BookingCompletionService);
  });

  describe('completeConfirmedBookings', () => {
    it('marks ended confirmed lessons as completed and increments the teacher lesson count', async () => {
      prisma.booking.findMany.mockResolvedValue([{ id: 'booking-id' }]);
      tx.$queryRaw.mockResolvedValue([
        { id: 'booking-id', teacherId: 'teacher-id' },
      ]);

      await service.completeConfirmedBookings();

      expect(tx.availabilityBlock.deleteMany).toHaveBeenCalledWith({
        where: { bookingId: { in: ['booking-id'] } },
      });
      expect(teachersService.incrementLessonCount).toHaveBeenCalledWith(
        'teacher-id',
      );
    });

    it('does not increment the lesson count when there is nothing to complete', async () => {
      prisma.booking.findMany.mockResolvedValue([]);

      await service.completeConfirmedBookings();

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(teachersService.incrementLessonCount).not.toHaveBeenCalled();
    });
  });
});
