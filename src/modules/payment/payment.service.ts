import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { BusinessException } from '@/common/exceptions/business.exception';
import { PrismaService } from '@/database/prisma/prisma.service';
import { ChatsService } from '@/modules/chats/chats.service';
import { MeetingService } from '@/modules/meeting/meeting.service';

@Injectable()
export class PaymentService {
  readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly meetingService: MeetingService,
    private readonly chatsService: ChatsService,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
    );
    this.webhookSecret = this.configService.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
  }

  async createPaymentIntent(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true },
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
        'BOOKING_ACCESS_DENIED',
        'You can only pay for your own bookings.',
        HttpStatus.FORBIDDEN,
      );
    }
    if (booking.status !== BookingStatus.PENDING_PAYMENT) {
      throw new BusinessException(
        'BOOKING_NOT_PAYABLE',
        'This booking is not waiting for payment.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      (booking.paymentExpiresAt && booking.paymentExpiresAt < new Date()) ||
      booking.lessonStartAt <= new Date()
    ) {
      throw new BusinessException(
        'BOOKING_PAYMENT_EXPIRED',
        'This booking payment has expired.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (booking.payment?.status === PaymentStatus.PAID) {
      throw new BusinessException(
        'PAYMENT_ALREADY_COMPLETED',
        'This booking has already been paid.',
        HttpStatus.CONFLICT,
      );
    }
    if (
      booking.payment?.status === PaymentStatus.READY &&
      booking.payment.clientSecret
    ) {
      return {
        clientSecret: booking.payment.clientSecret,
        paymentIntentId: booking.payment.paymentIntentId,
      };
    }

    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount: booking.price * 100,
        currency: 'usd',
        metadata: { bookingId: booking.id, studentId: booking.studentId },
        automatic_payment_methods: { enabled: true },
      },
      {
        idempotencyKey: `create_intent_booking_${booking.id}`,
      },
    );

    if (!paymentIntent.client_secret) {
      throw new BusinessException(
        'PAYMENT_INTENT_SECRET_MISSING',
        'Payment secret missing',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`,
      );

      const existing = await tx.payment.findUnique({
        where: { bookingId: booking.id },
      });

      if (existing?.status === PaymentStatus.READY && existing.clientSecret) {
        return existing;
      }

      return tx.payment.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          status: PaymentStatus.READY,
        },
        update: {
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          status: PaymentStatus.READY,
        },
      });
    });

    return {
      clientSecret: payment.clientSecret,
      paymentIntentId: payment.paymentIntentId,
    };
  }

  async handleWebhook(rawBody: Buffer | undefined, signature: string) {
    const event = this.constructWebhookEvent(rawBody, signature);

    if (
      event.type === 'payment_intent.canceled' ||
      event.type === 'charge.refunded'
    ) {
      await this.recordWebhookEvent(event);
      return { received: true };
    }

    if (event.type !== 'payment_intent.succeeded') {
      return { received: true };
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    let receiptUrl: string | null = null;
    const latestCharge = paymentIntent.latest_charge;

    if (typeof latestCharge === 'object' && latestCharge?.receipt_url) {
      receiptUrl = latestCharge.receipt_url;
    } else if (typeof latestCharge === 'string') {
      const charge = await this.stripe.charges.retrieve(latestCharge);
      receiptUrl = charge.receipt_url;
    }

    try {
      const payment = await this.prisma.payment.findUnique({
        where: { paymentIntentId: paymentIntent.id },
        include: { booking: true },
      });

      if (!payment) {
        throw new BusinessException(
          'PAYMENT_NOT_FOUND',
          'Payment not found for this intent.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      if (payment.status === PaymentStatus.PAID) {
        return { received: true };
      }

      const meeting = await this.meetingService.createRoom(
        payment.booking.lessonEndAt,
      );

      const result = await this.prisma.$transaction(async (tx) => {
        const [lockedPayment] = await tx.$queryRaw<
          Array<{ id: string; bookingId: string; status: PaymentStatus }>
        >(Prisma.sql`
          SELECT id, "bookingId", status FROM "Payment"
          WHERE "paymentIntentId" = ${paymentIntent.id}
          FOR UPDATE
        `);

        if (lockedPayment.status === PaymentStatus.PAID) {
          return;
        }

        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Booking" WHERE id = ${lockedPayment.bookingId} FOR UPDATE`,
        );

        await tx.payment.update({
          where: { id: lockedPayment.id },
          data: {
            status: PaymentStatus.PAID,
            paidAt: new Date(),
            receiptUrl,
          },
        });

        const confirmedBooking = await tx.booking.update({
          where: { id: lockedPayment.bookingId },
          data: {
            status: BookingStatus.CONFIRMED,
            meetingUrl: meeting.roomUrl,
          },
          include: {
            teacher: {
              select: { userId: true },
            },
          },
        });

        await tx.webhookEvent.create({
          data: {
            eventId: event.id,
            eventType: event.type,
            payload: event as unknown as Prisma.InputJsonValue,
          },
        });

        return confirmedBooking;
      });

      if (result) {
        await this.chatsService.notifyLessonConfirmed({
          studentId: result.studentId,
          teacherUserId: result.teacher.userId,
          bookingId: result.id,
          lessonStartAt: result.lessonStartAt,
          meetingUrl: meeting.roomUrl,
        });
      }

      return { received: true };
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }

      throw new BusinessException(
        'STRIPE_WEBHOOK_ERROR',
        'Error processing Stripe webhook.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async recordWebhookEvent(event: Stripe.Event) {
    try {
      await this.prisma.webhookEvent.create({
        data: {
          eventId: event.id,
          eventType: event.type,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }

      throw error;
    }
  }

  private constructWebhookEvent(
    rawBody: Buffer | undefined,
    signature: string,
  ) {
    if (!rawBody || !signature) {
      throw new BusinessException(
        'STRIPE_WEBHOOK_INVALID',
        'Stripe webhook signature is missing.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch {
      throw new BusinessException(
        'STRIPE_WEBHOOK_INVALID',
        'Stripe webhook signature is invalid.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
