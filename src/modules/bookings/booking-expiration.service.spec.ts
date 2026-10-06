import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '@/database/prisma/prisma.service';
import { BookingExpirationService } from './booking-expiration.service';

describe('BookingExpirationService', () => {
  let service: BookingExpirationService;
  const tx = {
    booking: { updateMany: jest.fn() },
    availabilityBlock: { deleteMany: jest.fn() },
  };
  const prisma = {
    booking: { findMany: jest.fn() },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingExpirationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(BookingExpirationService);
  });

  describe('expirePendingBookings', () => {
    it('expires payment-pending bookings past the payment deadline and clears the slot block', async () => {
      prisma.booking.findMany.mockResolvedValue([{ id: 'booking-id' }]);
      tx.booking.updateMany.mockResolvedValue({ count: 1 });

      await service.expirePendingBookings();

      expect(tx.booking.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['booking-id'] },
            status: BookingStatus.PENDING_PAYMENT,
          }) as object,
          data: { status: BookingStatus.EXPIRED },
        }),
      );
      expect(tx.availabilityBlock.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bookingId: { in: ['booking-id'] },
          }) as object,
        }),
      );
    });

    it('does not open a transaction when there is nothing to expire', async () => {
      prisma.booking.findMany.mockResolvedValue([]);

      await service.expirePendingBookings();

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not clear the slot block when the status already changed and the update count is zero', async () => {
      prisma.booking.findMany.mockResolvedValue([{ id: 'booking-id' }]);
      tx.booking.updateMany.mockResolvedValue({ count: 0 });

      await service.expirePendingBookings();

      expect(tx.availabilityBlock.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects when a database error occurs so the scheduler can retry', async () => {
      prisma.booking.findMany.mockRejectedValue(new Error('db down'));

      await expect(service.expirePendingBookings()).rejects.toThrow('db down');
    });
  });
});
