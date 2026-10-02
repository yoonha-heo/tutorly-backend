import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtPayload } from './types/jwt-payload.type';

const ACCESS_TOKEN_MAX_AGE_MS = 1000 * 60 * 15;
const REFRESH_TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function authCookieOptions(maxAge?: number) {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('lax' as const),
    path: '/',
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) {
  res.cookie(
    'accessToken',
    tokens.accessToken,
    authCookieOptions(ACCESS_TOKEN_MAX_AGE_MS),
  );
  res.cookie(
    'refreshToken',
    tokens.refreshToken,
    authCookieOptions(REFRESH_TOKEN_MAX_AGE_MS),
  );
}

function clearAuthCookies(res: Response) {
  const options = authCookieOptions();
  res.clearCookie('accessToken', options);
  res.clearCookie('refreshToken', options);
}

function readCookie(req: Request, name: string): string | undefined {
  return readStringProperty(cookieJar(req), name);
}

function cookieJar(req: Request): unknown {
  if (!('cookies' in req)) {
    return undefined;
  }

  return req.cookies;
}

function readStringProperty(source: unknown, name: string): string | undefined {
  if (!isRecord(source) || !(name in source)) {
    return undefined;
  }

  const value = source[name];
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  async loginWithGoogle(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithGoogle(dto);

    if (result.needsRole) {
      return { needsRole: true };
    }

    setAuthCookies(res, result);

    return {
      user: result.user,
    };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const tokens = await this.authService.refresh(
        readCookie(req, 'refreshToken'),
      );
      setAuthCookies(res, tokens);
      return { success: true };
    } catch (error) {
      clearAuthCookies(res);
      throw error;
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(
      readCookie(req, 'accessToken'),
      readCookie(req, 'refreshToken'),
    );
    clearAuthCookies(res);

    return {
      success: true,
    };
  }
}
