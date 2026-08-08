import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsPositive,
  Min,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

// JSON.stringify-encoded value embedded in an inline <script>. Escapes "</script>"
// so a hostile value (e.g. in an error token) can never terminate the script tag.
const jsScriptEscaper = (key: string, value: unknown) => {
  if (typeof value === 'string') {
    return value
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }
  return value;
};
const jsString = (value: unknown) =>
  JSON.stringify(value, jsScriptEscaper);

class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

class GoogleRegisterDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsOptional()
  joinCode?: string;

  @IsString()
  @IsOptional()
  groupName?: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  @IsOptional()
  cycleAmount?: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : '',
  )
  @IsString()
  @IsOptional()
  @IsIn(['weekly', 'monthly'])
  cycleInterval?: string;
}

class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({
    summary: 'Google OAuth Login (server-side redirect)',
    description:
      'Redirects the browser to Google for consent. On success Google redirects to /auth/google/callback which ' +
      'posts the AjoGuard JWT back to the configured frontend origin as /oauth-callback#access_token=... so a SPA can capture it. ' +
      'Query params decide the action: none = login; groupName+cycleAmount+cycleInterval = register as collector; joinCode = join an existing group. ' +
      'Alternatively, SPAs can call POST /auth/google/login or POST /auth/google/register with a Google ID token.',
  })
  @ApiQuery({ name: 'groupName', required: false })
  @ApiQuery({ name: 'cycleAmount', required: false, example: 10000 })
  @ApiQuery({
    name: 'cycleInterval',
    required: false,
    enum: ['weekly', 'monthly'],
  })
  @ApiQuery({ name: 'joinCode', required: false })
  @ApiQuery({ name: 'phoneNumber', required: true })
  @Get('google')
  googleAuth(
    @Res() res: Response,
    @Query('groupName') groupName?: string,
    @Query('cycleAmount') cycleAmount?: string,
    @Query('cycleInterval') cycleInterval?: string,
    @Query('joinCode') joinCode?: string,
    @Query('phoneNumber') phoneNumber?: string,
  ): void {
    const parsedAmount = cycleAmount ? Number(cycleAmount) : undefined;
    const state = this.authService.createOAuthState({
      groupName,
      cycleAmount: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
      cycleInterval,
      joinCode,
      phoneNumber,
    });

    res.redirect(this.authService.getGoogleAuthUrl(state));
  }

  @ApiOperation({
    summary: 'Google OAuth Callback',
    description:
      'Handles the redirect back from Google, verifies the user, then renders an HTML page that ' +
      'posts the AjoGuard JWT to the configured frontend origin (/oauth-callback#access_token=...) ' +
      'so the browser SPA can capture it.',
  })
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    try {
      const auth = await this.authService.handleGoogleCallback(code, state);
      const origin = this.configService
        .get<string>('CLIENT_ORIGIN')
        ?.replace(/\/$/, '');

      if (origin) {
        const html = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Signing you in…</title>
    <script>
      try {
        window.location.replace(
          ${jsString(origin)} + '/oauth-callback#access_token=' +
          encodeURIComponent(${jsString(auth.accessToken)}) +
          '&refresh_token=' + encodeURIComponent(${jsString(
            auth.refreshToken,
          )}) +
          '&expires_in=' + encodeURIComponent(${jsString(auth.expiresIn)}) +
          '&collector=' + encodeURIComponent(${jsString(
            JSON.stringify(auth.collector),
          )})
        );
      } catch (err) {
        document.write('Authentication failed. Please retry.');
      }
    </script>
  </head>
  <body>
    <noscript>
      <p>Your browser needs JavaScript to complete the sign-in. Close this window and use the app instead.</p>
    </noscript>
  </body>
</html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(html);
      }

      return res.json(auth);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: (error as Error).message,
      });
    }
  }

  @ApiOperation({
    summary: 'Google Auth Login (ID Token)',
    description:
      'Verify a Google ID Token from SPA/Mobile client and receive an AjoGuard JWT token',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google/login')
  @HttpCode(200)
  async googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto.idToken);
  }

  @ApiOperation({
    summary: 'Google Auth Registration',
    description:
      'Register a new collector and savings group (groupName, cycleAmount, cycleInterval) or join an existing group (joinCode) using Google Auth',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('google/register')
  @HttpCode(201)
  async googleRegister(@Body() dto: GoogleRegisterDto) {
    return this.authService.googleRegister(dto);
  }

  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Exchange a valid refresh token for a fresh access token and a rotated refresh token.',
  })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }
}
