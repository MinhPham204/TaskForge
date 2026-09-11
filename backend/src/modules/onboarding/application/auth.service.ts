import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { EntityManager } from 'typeorm';
import type { StringValue } from 'ms';
import type { EmailService } from '../../../common/services/email.service';
import type { RedisService } from '../../../common/services/redis.service';
import { PostgresUserRepository } from '../persistence/typeorm/onboarding.repositories';
import type { UserEntity } from '../persistence/typeorm/onboarding.entities';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';

export interface CompletePostgresSignupInput {
  fullName: string;
  password: string;
  profileImageUrl?: string | null;
}

export interface PostgresLoginInput {
  email: string;
  password: string;
}

export interface UpdatePostgresProfileInput {
  name?: string;
  profileImageUrl?: string | null;
}

export interface PostgresAuthUserResponse {
  id: string;
  name: string;
  email: string;
  profileImageUrl: string | null;
}

export interface PostgresTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface PostgresAuthResult extends PostgresTokenPair {
  user: PostgresAuthUserResponse;
}

interface VerifiedEmailPayload {
  email: string;
}

interface AuthTokenPayload {
  sub: string;
  email: string;
}

/**
 * PostgreSQL authentication implementation for the Phase 2 cutover.
 *
 * It deliberately receives an EntityManager from the runtime transaction
 * boundary, keeping all authentication writes atomic.
 */
export class PostgresAuthService {
  private readonly users: PostgresUserRepository;

  constructor(
    private readonly manager: EntityManager,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {
    this.users = new PostgresUserRepository(manager);
  }

  async register(email: string): Promise<{ message: string }> {
    const normalizedEmail = normalizeEmail(email);
    const existing = await this.users.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const otp = generateOtp();
    await this.redisService.setOtp(normalizedEmail, otp, 300);
    await this.emailService.sendOtpEmail(normalizedEmail, otp);

    return { message: 'OTP sent to your email. Valid for 5 minutes.' };
  }

  async verifyOtp(
    email: string,
    otp: string,
  ): Promise<{ verifiedToken: string }> {
    const normalizedEmail = normalizeEmail(email);
    const storedOtp = await this.redisService.getOtp(normalizedEmail);

    if (!storedOtp) {
      throw new BadRequestException('OTP has expired or was not found');
    }
    if (storedOtp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    await this.redisService.deleteOtp(normalizedEmail);

    return {
      verifiedToken: this.jwtService.sign(
        { email: normalizedEmail },
        {
          secret: requiredConfig(this.config, 'JWT_VERIFIED_SECRET'),
          expiresIn: requiredConfig(
            this.config,
            'JWT_VERIFIED_EXPIRES_IN',
          ) as StringValue,
        },
      ),
    };
  }

  async completeSignup(
    verifiedToken: string | undefined,
    input: CompletePostgresSignupInput,
  ): Promise<PostgresAuthResult> {
    const email = this.verifyVerifiedEmail(verifiedToken);
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const user = this.users.create({
      email,
      name: input.fullName.trim(),
      passwordHash: await bcrypt.hash(input.password, 10),
      profileImageUrl: input.profileImageUrl ?? null,
      emailVerifiedAt: new Date(),
    });
    const savedUser = await this.users.save(user);
    const tokens = await this.issueTokens(savedUser);
    await this.storeRefreshToken(savedUser, tokens.refreshToken);
    await writePostgresAudit(this.manager, {
      actorUserId: savedUser.id,
      actionCode: 'AUTH_SIGNUP_COMPLETED',
      targetType: 'USER',
      targetId: savedUser.id,
      afterData: { email: savedUser.email, emailVerified: true },
    });

    return { ...tokens, user: sanitizeUser(savedUser) };
  }

  async login(input: PostgresLoginInput): Promise<PostgresAuthResult> {
    const user = await this.users.findByEmailWithCredentials(
      normalizeEmail(input.email),
    );
    if (!user || user.disabledAt || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.issueTokens(user);
    await this.storeRefreshToken(user, tokens.refreshToken);
    await writePostgresAudit(this.manager, {
      actorUserId: user.id,
      actionCode: 'AUTH_LOGIN_SUCCEEDED',
      targetType: 'USER',
      targetId: user.id,
    });

    return { ...tokens, user: sanitizeUser(user) };
  }

  async logout(userId: string): Promise<{ message: string }> {
    const user = await this.requireEnabledUser(userId);
    user.refreshTokenHash = null;
    await this.users.save(user);
    await writePostgresAudit(this.manager, {
      actorUserId: user.id,
      actionCode: 'AUTH_LOGOUT',
      targetType: 'USER',
      targetId: user.id,
    });
    return { message: 'Logged out successfully' };
  }

  async refreshTokens(
    userId: string,
    rawRefreshToken: string,
  ): Promise<PostgresTokenPair> {
    const user = await this.users.findByIdWithRefreshTokenHash(userId);
    if (!user || user.disabledAt || !user.refreshTokenHash) {
      throw new ForbiddenException('Access denied — please log in again');
    }

    const tokenMatches = await bcrypt.compare(
      rawRefreshToken,
      user.refreshTokenHash,
    );
    if (!tokenMatches) {
      throw new ForbiddenException(
        'Refresh token mismatch — please log in again',
      );
    }

    const tokens = await this.issueTokens(user);
    await this.storeRefreshToken(user, tokens.refreshToken);
    await writePostgresAudit(this.manager, {
      actorUserId: user.id,
      actionCode: 'AUTH_REFRESH_TOKEN_ROTATED',
      targetType: 'USER',
      targetId: user.id,
    });
    return tokens;
  }

  async getProfile(userId: string): Promise<PostgresAuthUserResponse> {
    return sanitizeUser(await this.requireEnabledUser(userId));
  }

  async updateProfile(
    userId: string,
    input: UpdatePostgresProfileInput,
  ): Promise<PostgresAuthUserResponse> {
    const user = await this.requireEnabledUser(userId);

    if (input.name !== undefined) {
      user.name = input.name.trim();
    }
    if (input.profileImageUrl !== undefined) {
      user.profileImageUrl = input.profileImageUrl;
    }

    const saved = await this.users.save(user);
    await writePostgresAudit(this.manager, {
      actorUserId: saved.id,
      actionCode: 'AUTH_PROFILE_UPDATED',
      targetType: 'USER',
      targetId: saved.id,
      afterData: { name: saved.name, profileImageUrl: saved.profileImageUrl },
    });
    return sanitizeUser(saved);
  }

  private verifyVerifiedEmail(verifiedToken: string | undefined): string {
    if (!verifiedToken) {
      throw new BadRequestException('Verified token is required');
    }

    try {
      const payload = this.jwtService.verify<VerifiedEmailPayload>(
        verifiedToken,
        {
          secret: requiredConfig(this.config, 'JWT_VERIFIED_SECRET'),
        },
      );
      return normalizeEmail(payload.email);
    } catch {
      throw new BadRequestException('Verified token is invalid or expired');
    }
  }

  private async requireEnabledUser(userId: string): Promise<UserEntity> {
    const user = await this.users.findById(userId);
    if (!user || user.disabledAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async issueTokens(user: UserEntity): Promise<PostgresTokenPair> {
    const payload: AuthTokenPayload = { sub: user.id, email: user.email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: requiredConfig(this.config, 'JWT_ACCESS_SECRET'),
        expiresIn: requiredConfig(
          this.config,
          'JWT_ACCESS_EXPIRES_IN',
        ) as StringValue,
      }),
      this.jwtService.signAsync(payload, {
        secret: requiredConfig(this.config, 'JWT_REFRESH_SECRET'),
        expiresIn: requiredConfig(
          this.config,
          'JWT_REFRESH_EXPIRES_IN',
        ) as StringValue,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(
    user: UserEntity,
    refreshToken: string,
  ): Promise<void> {
    user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.users.save(user);
  }

}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function requiredConfig(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (!value) {
    throw new Error(`${key} is required for PostgreSQL authentication.`);
  }
  return value;
}

function sanitizeUser(user: UserEntity): PostgresAuthUserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    profileImageUrl: user.profileImageUrl,
  };
}
