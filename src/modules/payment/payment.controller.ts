import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { JwtPayload } from '@/modules/auth/types/jwt-payload.type';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) { }

  @Post('intent')
  @UseGuards(JwtAuthGuard)
  createPaymentIntent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return this.paymentService.createPaymentIntent(user.userId, dto.bookingId);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.paymentService.handleWebhook(req.rawBody, signature);
  }

}
