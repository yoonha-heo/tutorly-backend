import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BusinessException } from '@/common/exceptions/business.exception';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(
    err: unknown,
    user: TUser | false,
    info?: unknown,
  ): TUser {
    if (err instanceof BusinessException) {
      throw err;
    }

    if (err instanceof Error) {
      throw err;
    }

    if (err) {
      throw new Error('Authentication failed.');
    }

    if (user) {
      return user;
    }

    const isMissingToken =
      info instanceof Error && info.message === 'No auth token';

    throw new BusinessException(
      isMissingToken ? 'ACCESS_TOKEN_MISSING' : 'ACCESS_TOKEN_INVALID',
      'Please sign in again.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
