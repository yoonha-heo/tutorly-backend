import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import Stripe from 'stripe';
import { BusinessException } from '@/common/exceptions/business.exception';
import { PrismaService } from '@/database/prisma/prisma.service';
import { ChatsService } from '@/modules/chats/chats.service';
import { MeetingService } from '@/modules/meeting/meeting.service';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let createPaymentIntent: jest.SpiedFunction<
    Stripe['paymentIntents']['create']
  >;
  const tx = {
    $queryRaw: jest.fn(),
    payment: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      update: jest.fn(),
    },
    webhookEvent: {
      create: jest.fn(),
    },
  };
  const prisma = {
    booking: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
    },
    webhookEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const meetingService = {
    createRoom: jest.fn(),
  };
  const chatsService = {
    notifyLessonConfirmed: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'sk_test_dummy' },
        },
        { provide: MeetingService, useValue: meetingService },
        { provide: ChatsService, useValue: chatsService },
      ],
    }).compile();

    service = module.get(PaymentService);
    createPaymentIntent = jest
      .spyOn(service.stripe.paymentIntents, 'create')
      .mockResolvedValue({
        id: 'pi_test',
        client_secret: 'cs_test',
        amount: 4000,
      } as Stripe.Response<Stripe.PaymentIntent>);
  });

  function payableBooking() {
    return {
      id: 'booking-id',
      studentId: 'student-id',
      status: BookingStatus.PENDING_PAYMENT,
      price: 40,
      paymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lessonStartAt: new Date(Date.now() + 60 * 60 * 1000),
      payment: null,
    };
  }

  describe('createPaymentIntent', () => {
    it('creates a Stripe intent and stores the payment as READY for a payment-pending booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(payableBooking());
      tx.payment.findUnique.mockResolvedValue(null);
      tx.payment.upsert.mockResolvedValue({
        clientSecret: 'cs_test',
        paymentIntentId: 'pi_test',
      });

      await expect(
        service.createPaymentIntent('student-id', 'booking-id'),
      ).resolves.toEqual({
        clientSecret: 'cs_test',
        paymentIntentId: 'pi_test',
      });

      expect(createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 4000,
          currency: 'usd',
          metadata: { bookingId: 'booking-id', studentId: 'student-id' },
        }),
        { idempotencyKey: 'create_intent_booking_booking-id' },
      );
      expect(tx.payment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { bookingId: 'booking-id' },
          create: expect.objectContaining({
            status: PaymentStatus.READY,
          }) as object,
        }),
      );
    });

    it('rejects with BOOKING_ACCESS_DENIED when the booking does not belong to the user', async () => {
      prisma.booking.findUnique.mockResolvedValue(payableBooking());

      await expect(
        service.createPaymentIntent('other-user', 'booking-id'),
      ).rejects.toMatchObject({ code: 'BOOKING_ACCESS_DENIED' });
      expect(createPaymentIntent).not.toHaveBeenCalled();
    });

    it('rejects with BOOKING_NOT_PAYABLE when the booking is not awaiting payment', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...payableBooking(),
        status: BookingStatus.CONFIRMED,
      });

      await expect(
        service.createPaymentIntent('student-id', 'booking-id'),
      ).rejects.toMatchObject({ code: 'BOOKING_NOT_PAYABLE' });
      expect(createPaymentIntent).not.toHaveBeenCalled();
    });

    it('returns the existing client secret without calling Stripe again when it is already READY', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...payableBooking(),
        payment: {
          status: PaymentStatus.READY,
          clientSecret: 'cs_existing',
          paymentIntentId: 'pi_existing',
        },
      });

      await expect(
        service.createPaymentIntent('student-id', 'booking-id'),
      ).resolves.toEqual({
        clientSecret: 'cs_existing',
        paymentIntentId: 'pi_existing',
      });
      expect(createPaymentIntent).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    const lessonStartAt = new Date('2026-09-26T01:00:00.000Z');
    const lessonEndAt = new Date('2026-09-26T01:50:00.000Z');

    function succeededEvent(): Stripe.Event {
      return {
        id: 'evt_success',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            latest_charge: { receipt_url: 'https://pay.stripe.com/receipt' },
          },
        },
      } as Stripe.Event;
    }

    it('marks the payment PAID and the booking CONFIRMED, then creates a chat notice and a meeting room on a successful payment webhook', async () => {
      jest
        .spyOn(service.stripe.webhooks, 'constructEvent')
        .mockReturnValue(succeededEvent());
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-id',
        bookingId: 'booking-id',
        status: PaymentStatus.READY,
        booking: {
          id: 'booking-id',
          studentId: 'student-id',
          lessonStartAt,
          lessonEndAt,
          meetingUrl: null,
          teacher: { userId: 'teacher-user-id' },
        },
      });
      tx.$queryRaw.mockResolvedValueOnce([
        {
          id: 'payment-id',
          bookingId: 'booking-id',
          status: PaymentStatus.READY,
        },
      ]);
      tx.booking.update.mockResolvedValue({
        id: 'booking-id',
        studentId: 'student-id',
        lessonStartAt,
        lessonEndAt,
        meetingUrl: null,
        teacher: { userId: 'teacher-user-id' },
      });
      meetingService.createRoom.mockResolvedValue({
        roomUrl: 'https://whereby.test/room',
      });

      await expect(
        service.handleWebhook(Buffer.from('{}'), 'sig_test'),
      ).resolves.toEqual({ received: true });

      expect(tx.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.PAID,
            receiptUrl: 'https://pay.stripe.com/receipt',
          }) as object,
        }),
      );
      expect(tx.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: BookingStatus.CONFIRMED },
        }),
      );
      expect(chatsService.notifyLessonConfirmed).toHaveBeenCalledWith({
        studentId: 'student-id',
        teacherUserId: 'teacher-user-id',
        bookingId: 'booking-id',
        lessonStartAt,
      });
      expect(meetingService.createRoom).toHaveBeenCalledWith(lessonEndAt);
      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'booking-id' },
        data: { meetingUrl: 'https://whereby.test/room' },
      });
    });

    it('rejects with STRIPE_WEBHOOK_INVALID when the signature is missing or verification fails', async () => {
      await expect(
        service.handleWebhook(Buffer.from('{}'), ''),
      ).rejects.toBeInstanceOf(BusinessException);
      await expect(
        service.handleWebhook(Buffer.from('{}'), ''),
      ).rejects.toMatchObject({ code: 'STRIPE_WEBHOOK_INVALID' });

      jest
        .spyOn(service.stripe.webhooks, 'constructEvent')
        .mockImplementation(() => {
          throw new Error('bad signature');
        });

      await expect(
        service.handleWebhook(Buffer.from('{}'), 'bad'),
      ).rejects.toMatchObject({ code: 'STRIPE_WEBHOOK_INVALID' });
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('does not change the booking status again when payment is already complete and a meeting URL exists', async () => {
      jest
        .spyOn(service.stripe.webhooks, 'constructEvent')
        .mockReturnValue(succeededEvent());
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-id',
        status: PaymentStatus.PAID,
        booking: {
          id: 'booking-id',
          meetingUrl: 'https://whereby.test/room',
          teacher: { userId: 'teacher-user-id' },
        },
      });

      await expect(
        service.handleWebhook(Buffer.from('{}'), 'sig_test'),
      ).resolves.toEqual({ received: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(meetingService.createRoom).not.toHaveBeenCalled();
    });

    it('records the event and keeps the booking status for a cancelled PaymentIntent webhook', async () => {
      jest.spyOn(service.stripe.webhooks, 'constructEvent').mockReturnValue({
        id: 'evt_canceled',
        type: 'payment_intent.canceled',
        data: { object: { id: 'pi_test' } },
      } as Stripe.Event);

      await expect(
        service.handleWebhook(Buffer.from('{}'), 'sig_test'),
      ).resolves.toEqual({ received: true });
      expect(prisma.webhookEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId: 'evt_canceled',
            eventType: 'payment_intent.canceled',
          }) as object,
        }),
      );
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
      expect(tx.booking.update).not.toHaveBeenCalled();
    });
  });
});
