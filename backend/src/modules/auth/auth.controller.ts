import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { GetUser } from './decorators/get-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserDto } from '../user/dto/update-user.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator';

interface AuthUser {
  _id: { toString(): string };
  name: string;
  email: string;
  role: string;
  profileImageUrl: string | null;
  organization: unknown;
}

interface RefreshUser extends AuthUser {
  rawRefreshToken: string;
}

/**
 * @SkipTenant(): toàn bộ endpoint Auth vận hành trên `User` — đã nằm trong excludedModels
 * của tenantPlugin, không cần header X-Organization-Id. Đây cũng là nơi user vừa đăng nhập
 * (chưa có org active nào để gửi header) gọi /me, đổi mật khẩu... — không thể bắt buộc
 * header ở đây.
 */
@ApiTags('Auth')
@Controller('auth')
@SkipTenant()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // REGISTER (gồm 3 bước: register -> verify OTP -> set password)

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 1: Register and send OTP to email' })
  @ApiResponse({ status: 200, description: 'Sent OTP to email' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 2: Verify OTP' })
  @ApiResponse({
    status: 200,
    description: 'Verification successful, returns verifiedToken',
  })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('set-password')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('verifiedToken')
  @ApiOperation({
    summary: 'Step 3: Set password to complete account creation',
  })
  @ApiResponse({ status: 201, description: 'Account created successfully' })
  setPassword(@Req() req: any, @Body() dto: SetPasswordDto) {
    // Tự lôi authorization ra từ object request
    const authHeader = req.headers.authorization;
    const verifiedToken = authHeader?.replace('Bearer ', '').trim();

    return this.authService.setPassword(verifiedToken, dto);
  }
  // Login, Logout, Refresh Token

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login to the system' })
  @ApiResponse({
    status: 200,
    description: 'Returns accessToken and  refreshToken',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from the system' })
  logout(@GetUser('_id') userId: { toString(): string }) {
    return this.authService.logout(userId.toString());
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  refreshTokens(@GetUser() user: RefreshUser) {
    return this.authService.refreshTokens(
      user._id.toString(),
      user.rawRefreshToken,
    );
  }

  // Profile & Change Password
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@GetUser() user: AuthUser) {
    return this.authService.getProfile(user._id.toString());
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Update personal information (name, avatar)' })
  updateProfile(
    @GetUser('_id') userId: { toString(): string },
    @Body() dto: UpdateUserDto,
  ) {
    return this.authService.updateProfile(userId.toString(), dto);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password while logged in' })
  changePassword(
    @GetUser('_id') userId: { toString(): string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId.toString(), dto);
  }

  // forgot & reset password

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forgot password: Send reset link/OTP to email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using reset token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
