import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { BusinessException } from '@/common/exceptions/business.exception';

@Injectable()
export class SchedulerGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('SCHEDULER_SECRET');
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-scheduler-secret');

    if (!expected || !provided) {
      throw new BusinessException(
        'SCHEDULER_UNAUTHORIZED',
        'Unauthorized.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    const authorized =
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer);

    if (!authorized) {
      throw new BusinessException(
        'SCHEDULER_UNAUTHORIZED',
        'Unauthorized.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return true;
  }
}
