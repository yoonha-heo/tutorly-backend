import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client, LoginTicket } from 'google-auth-library';
import { AuthProvider, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { BusinessException } from '@/common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma/prisma.service';
import { REDIS } from '@/modules/redis/redis.module';
import { GoogleLoginDto } from './dto/google-login.dto';
import { JwtPayload } from './types/jwt-payload.type';

const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

function refreshKey(token: string) {
  return `refresh:${token}`;
}

function denyKey(jti: string) {
  return `jwt:deny:${jti}`;
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
    );
  }

  async loginWithGoogle(dto: GoogleLoginDto) {
    const googleUser = await this.verifyGoogleIdToken(dto.idToken);

    const existing = await this.prisma.user.findUnique({
      where: {
        provider_providerId: {
          provider: AuthProvider.GOOGLE,
          providerId: googleUser.providerId,
        },
      },
      select: { id: true },
    });

    const profile = {
      email: googleUser.email,
      name: googleUser.name,
      profileImage: googleUser.profileImage,
    };
    const teacherProfile = {
      select: {
        id: true,
        status: true,
        rejectionReason: true,
      },
    } as const;

    if (!existing) {
      if (!dto.role) {
        return { needsRole: true as const };
      }

      const created = await this.prisma.user.create({
        data: {
          ...profile,
          provider: AuthProvider.GOOGLE,
          providerId: googleUser.providerId,
          role: dto.role,
        },
        include: { teacherProfile },
      });
      const tokens = await this.issueAuthTokens(created.id, created.role);

      return {
        needsRole: false as const,
        ...tokens,
        user: {
          id: created.id,
          email: created.email,
          name: created.name,
          profileImage: created.profileImage,
          role: created.role,
          teacherProfile: created.teacherProfile,
        },
      };
    }

    const user = await this.prisma.user.update({
      where: { id: existing.id },
      data: profile,
      include: { teacherProfile },
    });

    const tokens = await this.issueAuthTokens(user.id, user.role);

    return {
      needsRole: false as const,
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImage: user.profileImage,
        role: user.role,
        teacherProfile: user.teacherProfile,
      },
    };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new BusinessException(
        'REFRESH_TOKEN_MISSING',
        'Please sign in again.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const userId = await this.authRedis(() =>
      this.redis.get(refreshKey(refreshToken)),
    );
    if (!userId) {
      throw new BusinessException(
        'REFRESH_TOKEN_INVALID',
        'Please sign in again.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      await this.authRedis(() => this.redis.del(refreshKey(refreshToken)));
      throw new BusinessException(
        'USER_NOT_FOUND',
        "Your account wasn't found. Please sign in again.",
        HttpStatus.UNAUTHORIZED,
        { userId },
      );
    }

    await this.authRedis(() => this.redis.del(refreshKey(refreshToken)));

    return this.issueAuthTokens(user.id, user.role);
  }

  async logout(
    accessToken: string | undefined,
    refreshToken: string | undefined,
  ) {
    if (accessToken) {
      await this.denyAccessToken(accessToken);
    }

    if (refreshToken) {
      try {
        await this.redis.del(refreshKey(refreshToken));
      } catch (error) {
        this.logger.warn(
          `Failed to delete refresh token on logout: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  async getMe(currentUser: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.userId },
      select: {
        id: true,
        email: true,
        name: true,
        profileImage: true,
        role: true,
        teacherProfile: {
          select: {
            id: true,
            status: true,
            rejectionReason: true,
          },
        },
      },
    });

    if (!user) {
      throw new BusinessException(
        'USER_NOT_FOUND',
        "Your account wasn't found. Please sign in again.",
        HttpStatus.UNAUTHORIZED,
        { userId: currentUser.userId },
      );
    }

    return { user };
  }

  private async issueAuthTokens(
    userId: string,
    role: UserRole,
  ): Promise<AuthTokens> {
    const jti = randomUUID();
    const accessToken = await this.jwtService.signAsync(
      {
        sub: userId,
        role,
        jti,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      },
    );

    const refreshToken = randomUUID();
    await this.authRedis(() =>
      this.redis.set(
        refreshKey(refreshToken),
        userId,
        'EX',
        REFRESH_TOKEN_TTL_SECONDS,
      ),
    );

    return { accessToken, refreshToken };
  }

  private async authRedis<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw new BusinessException(
        'AUTH_STORE_UNAVAILABLE',
        'Please try again.',
        HttpStatus.SERVICE_UNAVAILABLE,
        undefined,
        error,
      );
    }
  }

  private async denyAccessToken(accessToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        jti?: string;
        exp?: number;
      }>(accessToken, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      if (!payload.jti || !payload.exp) {
        return;
      }

      const ttlSeconds = payload.exp - Math.floor(Date.now() / 1000);
      if (ttlSeconds <= 0) {
        return;
      }

      await this.redis.set(denyKey(payload.jti), '1', 'EX', ttlSeconds);
    } catch {
      return;
    }
  }

  private async verifyGoogleIdToken(idToken: string) {
    let ticket: LoginTicket;
    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(
          'Failed to retrieve verification certificates:',
        )
      ) {
        throw error;
      }

      throw new BusinessException(
        'INVALID_GOOGLE_TOKEN',
        'Google sign-in failed. Please try again.',
        HttpStatus.UNAUTHORIZED,
        undefined,
        error,
      );
    }

    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      throw new BusinessException(
        'INVALID_GOOGLE_TOKEN',
        'Google sign-in failed. Please try again.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return {
      providerId: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
      profileImage: payload.picture ?? null,
    };
  }
}
