import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { StringValue } from 'ms';
import { PostgresAuthService } from '../application/auth.service';
import { PostgresWorkspaceService } from '../application/workspace.service';
import { PostgresJwtAuthGuard } from '../tenant/jwt-auth.guard';
import {
  PostgresCompleteSignupDto,
  PostgresLoginDto,
  PostgresRegisterDto,
  PostgresVerifyOtpDto,
  UpdatePostgresProfileDto,
} from './dto/auth.dto';
import { PostgresCurrentUserId } from './current-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class PostgresAuthController {
  constructor(
    private readonly auth: PostgresAuthService,
    private readonly workspaces: PostgresWorkspaceService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Send an email verification OTP' })
  register(@Body() dto: PostgresRegisterDto) {
    return this.auth.register(dto.email);
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify OTP and return a short-lived signup token' })
  verifyOtp(@Body() dto: PostgresVerifyOtpDto) {
    return this.auth.verifyOtp(dto.email, dto.otp);
  }

  @Post('set-password')
  @ApiBearerAuth('verifiedToken')
  @ApiOperation({
    summary: 'Create a global user after email verification (no workspace)',
  })
  completeSignup(@Req() request: { headers: Record<string, string | undefined> }, @Body() dto: PostgresCompleteSignupDto) {
    return this.auth.completeSignup(readBearerToken(request), dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Sign in with an existing global user' })
  login(@Body() dto: PostgresLoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Rotate an authenticated refresh token' })
  async refresh(@Req() request: { headers: Record<string, string | undefined> }) {
    const refreshToken = readBearerToken(request);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret: requiredConfig(this.config, 'JWT_REFRESH_SECRET'),
      });
      return this.auth.refreshTokens(payload.sub, refreshToken);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  @UseGuards(PostgresJwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @Post('logout')
  @ApiOkResponse({ description: 'Refresh token has been revoked' })
  logout(@PostgresCurrentUserId() userId: string) {
    return this.auth.logout(userId);
  }

  @UseGuards(PostgresJwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @Get('me')
  getProfile(@PostgresCurrentUserId() userId: string) {
    return this.auth.getProfile(userId);
  }

  @UseGuards(PostgresJwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @Patch('profile')
  updateProfile(
    @PostgresCurrentUserId() userId: string,
    @Body() dto: UpdatePostgresProfileDto,
  ) {
    return this.auth.updateProfile(userId, dto);
  }

  /** Compatibility route used by the current workspace selector. */
  @UseGuards(PostgresJwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @Get('my-organizations')
  listMyOrganizations(@PostgresCurrentUserId() userId: string) {
    return this.workspaces.listWorkspaces(userId);
  }
}

function readBearerToken(request: {
  headers: Record<string, string | undefined>;
}): string {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    throw new UnauthorizedException('Bearer token is required');
  }
  return authorization.slice('Bearer '.length);
}

function requiredConfig(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (!value) {
    throw new Error(`${key} is required for PostgreSQL authentication.`);
  }
  return value as StringValue;
}
