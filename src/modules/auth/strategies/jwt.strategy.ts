import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import Redis from 'ioredis';
import { REDIS } from '@/modules/redis/redis.module';

function extractJwtFromCookie(req: Request) {
  return req?.cookies?.accessToken ?? null;
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
      throw new UnauthorizedException();
    }

    if (payload.jti) {
      const denied = await this.redis.exists(`jwt:deny:${payload.jti}`);
      if (denied) {
        throw new UnauthorizedException();
      }
    }

    return {
      userId: payload.sub,
      role: payload.role,
      jti: payload.jti,
    };
  }
}
