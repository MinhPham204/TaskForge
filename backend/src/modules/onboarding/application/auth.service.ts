import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { EntityManager } from 'typeorm';
import type { StringValue } from 'ms';
import type { EmailService } from '../../../common/services/email.service';
import type { RedisService } from '../../../common/services/redis.service';
import {
  PostgresUserPreferenceRepository,
  PostgresUserRepository,
} from '../persistence/typeorm/onboarding.repositories';
import type {
  UserEntity,
  UserPreferenceEntity,
} from '../persistence/typeorm/onboarding.entities';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';
import { PasswordResetChallenges, resetDigest } from './password-reset';
import { UserEntity as ResetUserEntity } from '../persistence/typeorm/onboarding.entities';

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

export interface ChangePostgresPasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UpdatePostgresPersonalPreferencesInput {
  timezone: string;
  locale: string;
  weekStartsOn: number;
  inAppNotificationsEnabled: boolean;
}

export type PostgresPersonalPreferencesResponse =
  UpdatePostgresPersonalPreferencesInput;

const DEFAULT_PERSONAL_PREFERENCES: PostgresPersonalPreferencesResponse = {
  timezone: 'UTC',
  locale: 'en-US',
  weekStartsOn: 1,
  inAppNotificationsEnabled: true,
};

export const DEMO_USER_EMAILS = new Set([
  'owner@taskforge.dev',
  'pm@taskforge.dev',
  'dev@taskforge.dev',
  'designer@taskforge.dev',
]);

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
  private readonly resetDeliveries = new Set<Promise<void>>();
  private pendingResetRequests = 0;

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.resetDeliveries]);
  }

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
    ensurePasswordPolicy(input.password);
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
    await this.storeRefreshToken(user, tokens.refreshToken, user.passwordHash);
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
      user.refreshTokenHash.startsWith('sha256:')
        ? resetDigest(rawRefreshToken)
        : rawRefreshToken,
      user.refreshTokenHash.startsWith('sha256:')
        ? user.refreshTokenHash.slice(7)
        : user.refreshTokenHash,
    );
    if (!tokenMatches) {
      throw new ForbiddenException(
        'Refresh token mismatch — please log in again',
      );
    }

    const tokens = await this.issueTokens(user);
    const nextHash = await hashRefreshCredential(tokens.refreshToken);
    const updated: unknown[] = await this.manager.query(
      'WITH changed AS (UPDATE users SET refresh_token_hash = $1 WHERE id = $2 AND refresh_token_hash = $3 AND disabled_at IS NULL RETURNING id) SELECT id FROM changed',
      [nextHash, user.id, user.refreshTokenHash],
    );
    if (!updated.length)
      throw new ForbiddenException(
        'Refresh credential was revoked. Please sign in again.',
      );
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

  async getPersonalPreferences(
    userId: string,
  ): Promise<PostgresPersonalPreferencesResponse> {
    await this.requireEnabledUser(userId);
    const preferences = await new PostgresUserPreferenceRepository(
      this.manager,
    ).findByUserId(userId);
    return preferences
      ? sanitizePersonalPreferences(preferences)
      : DEFAULT_PERSONAL_PREFERENCES;
  }

  async updatePersonalPreferences(
    userId: string,
    input: UpdatePostgresPersonalPreferencesInput,
  ): Promise<PostgresPersonalPreferencesResponse> {
    const user = await this.requireEnabledUser(userId);
    const preferences = new PostgresUserPreferenceRepository(this.manager);
    const existing = await preferences.findByUserId(user.id);
    const next = existing ?? preferences.create({ userId: user.id });
    next.timezone = input.timezone;
    next.locale = input.locale;
    next.weekStartsOn = input.weekStartsOn;
    next.inAppNotificationsEnabled = input.inAppNotificationsEnabled;
    const saved = await preferences.save(next);
    await writePostgresAudit(this.manager, {
      actorUserId: user.id,
      actionCode: 'AUTH_PERSONAL_PREFERENCES_UPDATED',
      targetType: 'USER',
      targetId: user.id,
      afterData: { ...sanitizePersonalPreferences(saved) },
    });
    return sanitizePersonalPreferences(saved);
  }

  async changePassword(
    userId: string,
    input: ChangePostgresPasswordInput,
  ): Promise<{ message: string }> {
    if (input.newPassword !== input.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }
    ensurePasswordPolicy(input.newPassword);

    const user = await this.users.findByIdWithCredentials(userId);
    if (!user || user.disabledAt) {
      throw new NotFoundException('User not found');
    }
    if (DEMO_USER_EMAILS.has(user.email.toLowerCase())) {
      throw new ForbiddenException(
        'Password change is disabled for demo accounts in portfolio mode.',
      );
    }
    if (
      !user.passwordHash ||
      !(await bcrypt.compare(input.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    user.passwordHash = await bcrypt.hash(input.newPassword, 10);
    // The current persistence model permits one active refresh credential.
    // Clearing it revokes that credential immediately; no raw credential is audited.
    user.refreshTokenHash = null;
    await this.users.save(user);
    await writePostgresAudit(this.manager, {
      actorUserId: user.id,
      actionCode: 'AUTH_PASSWORD_CHANGED',
      targetType: 'USER',
      targetId: user.id,
    });

    return { message: 'Password changed successfully. Please sign in again.' };
  }

  async forgotPassword(
    email: string,
    ip: string,
  ): Promise<{ message: string; retryAfter: number }> {
    const normalized = normalizeEmail(email);
    const challenges = new PasswordResetChallenges(
      this.redisService,
      requiredConfig(this.config, 'JWT_REFRESH_SECRET'),
    );
    if (this.pendingResetRequests >= 20)
      throw new ServiceUnavailableException(
        'Password reset is busy. Please try again later.',
      );
    this.pendingResetRequests++;
    try {
      await challenges.reserve(normalized, ip);
      const user = await this.users.findByEmailWithCredentials(normalized);
      // All accounts follow the same Redis path and return before SMTP work.
      const challenge = await challenges.create(
        normalized,
        user?.id ?? randomUUID(),
        user?.passwordHash ?? randomUUID(),
      );
      const delivery = (async () => {
        let delivered = false;
        if (
          user &&
          !user.disabledAt &&
          user.passwordHash &&
          !DEMO_USER_EMAILS.has(normalized)
        ) {
          try {
            await this.emailService.sendPasswordResetEmail(
              normalized,
              challenge.otp,
            );
            delivered = true;
          } catch {
            /* Generic response and sanitized provider logging only. */
          }
        }
        await challenges.finish(normalized, challenge.generation, delivered);
      })()
        .catch(() => {
          new Logger(PostgresAuthService.name).warn(
            'Reset delivery finalization unavailable; challenge expires automatically.',
          );
        })
        .finally(() => {
          this.pendingResetRequests--;
          this.resetDeliveries.delete(delivery);
        });
      this.resetDeliveries.add(delivery);
    } catch (error) {
      this.pendingResetRequests--;
      throw error;
    }
    return {
      message:
        'If this account is eligible, a reset code will arrive shortly. If no code arrives, wait a minute and request another. Codes expire after 5 minutes.',
      retryAfter: 60,
    };
  }

  async resetPassword(
    input: {
      email: string;
      otp: string;
      newPassword: string;
      confirmPassword: string;
    },
    ip: string,
  ): Promise<{ message: string }> {
    ensurePasswordPolicy(input.newPassword);
    if (Buffer.byteLength(input.newPassword, 'utf8') > 72)
      throw new BadRequestException('Password must not exceed 72 UTF-8 bytes');
    if (input.newPassword !== input.confirmPassword)
      throw new BadRequestException('Password confirmation does not match');
    const claim = await new PasswordResetChallenges(
      this.redisService,
      requiredConfig(this.config, 'JWT_REFRESH_SECRET'),
    ).consume(normalizeEmail(input.email), input.otp, ip);
    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    // Redis consumes once before the DB transaction. On DB failure the code stays
    // consumed: request a fresh code, never restore a possibly superseded challenge.
    await this.manager.transaction(async (manager) => {
      const user = await manager
        .getRepository(ResetUserEntity)
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.id = :id', { id: claim.userId })
        .setLock('pessimistic_write')
        .getOne();
      if (
        !user ||
        user.disabledAt ||
        !user.passwordHash ||
        resetDigest(user.passwordHash) !== claim.credential ||
        DEMO_USER_EMAILS.has(user.email.toLowerCase())
      ) {
        throw new BadRequestException({
          code: 'RESET_CODE_INVALID',
          message: 'Reset code is invalid or expired. Request a new code.',
        });
      }
      await manager
        .getRepository(ResetUserEntity)
        .update(user.id, { passwordHash, refreshTokenHash: null });
      await writePostgresAudit(manager, {
        actorUserId: user.id,
        actionCode: 'AUTH_PASSWORD_RESET',
        targetType: 'USER',
        targetId: user.id,
      });
    });
    return {
      message:
        'Password reset successfully. Please sign in with your new password.',
    };
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
      this.jwtService.signAsync(
        { ...payload, jti: randomUUID(), purpose: 'refresh' },
        {
          secret: requiredConfig(this.config, 'JWT_REFRESH_SECRET'),
          expiresIn: requiredConfig(
            this.config,
            'JWT_REFRESH_EXPIRES_IN',
          ) as StringValue,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(
    user: UserEntity,
    refreshToken: string,
    expectedPasswordHash?: string,
  ): Promise<void> {
    user.refreshTokenHash = await hashRefreshCredential(refreshToken);
    if (expectedPasswordHash) {
      const updated: unknown[] = await this.manager.query(
        'WITH changed AS (UPDATE users SET refresh_token_hash = $1 WHERE id = $2 AND password_hash = $3 AND disabled_at IS NULL RETURNING id) SELECT id FROM changed',
        [user.refreshTokenHash, user.id, expectedPasswordHash],
      );
      if (!updated.length)
        throw new UnauthorizedException(
          'Credentials changed. Please sign in again.',
        );
      return;
    }
    await this.users.save(user);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function ensurePasswordPolicy(password: string): void {
  if (password.length < 8 || password.length > 128) {
    throw new BadRequestException(
      'Password must be between 8 and 128 characters',
    );
  }
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

function sanitizePersonalPreferences(
  preferences: UserPreferenceEntity,
): PostgresPersonalPreferencesResponse {
  return {
    timezone: preferences.timezone,
    locale: preferences.locale,
    weekStartsOn: preferences.weekStartsOn,
    inAppNotificationsEnabled: preferences.inAppNotificationsEnabled,
  };
}

async function hashRefreshCredential(token: string): Promise<string> {
  // Hash the full JWT before bcrypt; marker preserves legacy credential rotation.
  return `sha256:${await bcrypt.hash(resetDigest(token), 10)}`;
}
