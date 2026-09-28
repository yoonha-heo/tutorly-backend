import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '@/database/prisma/prisma.service';
import { REDIS } from '@/modules/redis/redis.module';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const jwtService = {
    signAsync: jest.fn(),
  };
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) =>
              key === 'JWT_ACCESS_SECRET' ? 'jwt-secret' : 'google-client',
          },
        },
        { provide: REDIS, useValue: redis },
      ],
    }).compile();

    service = module.get(AuthService);
    googleClient().verifyIdToken = jest.fn().mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub',
        email: 'ada@example.com',
        name: 'Ada',
        picture: null,
      }),
    });
    jwtService.signAsync.mockResolvedValue('access-token');
    redis.set.mockResolvedValue('OK');
    redis.del.mockResolvedValue(1);
  });

  function googleClient() {
    return (
      service as unknown as {
        googleClient: { verifyIdToken: jest.Mock };
      }
    ).googleClient;
  }

  describe('loginWithGoogle', () => {
    it('updates the profile and issues access and refresh tokens for an existing user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-id' });
      prisma.user.update.mockResolvedValue({
        id: 'user-id',
        email: 'ada@example.com',
        name: 'Ada',
        profileImage: null,
        role: UserRole.STUDENT,
        teacherProfile: null,
      });

      const result = await service.loginWithGoogle({ idToken: 'google-token' });

      expect(result.needsRole).toBe(false);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-id' },
          data: expect.objectContaining({
            email: 'ada@example.com',
          }) as object,
        }),
      );
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^refresh:/),
        'user-id',
        'EX',
        60 * 60 * 24 * 7,
      );
    });

    it('returns needsRole without creating an account when a new user has no role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.loginWithGoogle({ idToken: 'google-token' }),
      ).resolves.toEqual({ needsRole: true });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('rejects with INVALID_GOOGLE_TOKEN when Google token verification fails', async () => {
      googleClient().verifyIdToken.mockRejectedValue(
        new Error('invalid token'),
      );

      await expect(
        service.loginWithGoogle({ idToken: 'bad-token' }),
      ).rejects.toMatchObject({ code: 'INVALID_GOOGLE_TOKEN' });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects with AUTH_STORE_UNAVAILABLE when the token store fails', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-id' });
      prisma.user.update.mockResolvedValue({
        id: 'user-id',
        email: 'ada@example.com',
        name: 'Ada',
        profileImage: null,
        role: UserRole.STUDENT,
        teacherProfile: null,
      });
      redis.set.mockRejectedValue(new Error('redis down'));

      await expect(
        service.loginWithGoogle({ idToken: 'google-token' }),
      ).rejects.toMatchObject({ code: 'AUTH_STORE_UNAVAILABLE' });
    });
  });

  describe('refresh', () => {
    it('revokes a valid refresh token and issues a new token pair', async () => {
      redis.get.mockResolvedValue('user-id');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        role: UserRole.STUDENT,
      });

      const result = await service.refresh('old-refresh');

      expect(redis.del).toHaveBeenCalledWith('refresh:old-refresh');
      expect(result.accessToken).toBe('access-token');
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^refresh:/),
        'user-id',
        'EX',
        60 * 60 * 24 * 7,
      );
    });

    it('rejects with REFRESH_TOKEN_MISSING when the refresh token is absent', async () => {
      await expect(service.refresh(undefined)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_MISSING',
      });
      expect(redis.get).not.toHaveBeenCalled();
    });

    it('rejects with REFRESH_TOKEN_INVALID when the refresh token is not in the store', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.refresh('missing-refresh')).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_INVALID',
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
