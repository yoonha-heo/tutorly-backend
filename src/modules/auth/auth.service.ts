import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { AuthProvider } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
    );
  }

  async loginWithGoogle(dto: GoogleLoginDto) {
    const googleUser = await this.verifyGoogleIdToken(dto.idToken);

    const user = await this.prisma.user.upsert({
      where: {
        provider_providerId: {
          provider: AuthProvider.GOOGLE,
          providerId: googleUser.providerId,
        },
      },
      update: {
        email: googleUser.email,
        name: googleUser.name,
        profileImage: googleUser.profileImage,
      },
      create: {
        email: googleUser.email,
        name: googleUser.name,
        profileImage: googleUser.profileImage,
        provider: AuthProvider.GOOGLE,
        providerId: googleUser.providerId,
        role: dto.role,
      },
      include: {
        teacherProfile: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        role: user.role,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '1h',
      },
    );

    return {
      accessToken,
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

  private async verifyGoogleIdToken(idToken: string) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email) {
        throw new UnauthorizedException('Invalid Google token');
      }

      return {
        providerId: payload.sub,
        email: payload.email,
        name: payload.name ?? null,
        profileImage: payload.picture ?? null,
      };
    } catch {
      throw new UnauthorizedException('Invalid Google token');
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
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return { user };
  }
}
