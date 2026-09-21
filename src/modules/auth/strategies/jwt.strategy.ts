import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import Redis from 'ioredis';
import { BusinessException } from '@/common/exceptions/business.exception';
import { REDIS } from '@/modules/redis/redis.module';

function extractJwtFromCookie(req: Request) {
  const cookies: unknown = req.cookies;
  if (
    typeof cookies !== 'object' ||
    cookies === null ||
    !('accessToken' in cookies)
  ) {
    return null;
  }

  const token = cookies.accessToken;
  return typeof token === 'string' ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractJwtFromCookie]),
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: { sub: string; role: string; jti?: string }) {
    if (!payload.sub) {
      throw new BusinessException(
        'ACCESS_TOKEN_INVALID',
        'Please sign in again.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (payload.jti) {
      const denied = await this.redis.exists(`jwt:deny:${payload.jti}`);
      if (denied) {
        throw new BusinessException(
          'ACCESS_TOKEN_REVOKED',
          'Please sign in again.',
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    return {
      userId: payload.sub,
      role: payload.role,
      jti: payload.jti,
    };
  }
}
