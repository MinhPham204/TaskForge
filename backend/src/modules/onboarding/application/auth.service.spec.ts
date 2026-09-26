import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { EmailService } from '../../../common/services/email.service';
import type { RedisService } from '../../../common/services/redis.service';
import type { EntityManager } from 'typeorm';
import { UserEntity } from '../persistence/typeorm/onboarding.entities';
import { PostgresAuthService } from './auth.service';

describe('PostgresAuthService', () => {
  const findOneBy = jest.fn();
  const create = jest.fn();
  const save = jest.fn();
  const getOne = jest.fn();
  const queryBuilder = {
    addSelect: jest.fn(),
    where: jest.fn(),
    getOne,
  };
  const repository = { findOneBy, create, save, createQueryBuilder: jest.fn() };
  const manager = {
    getRepository: jest.fn(() => repository),
  } as unknown as EntityManager;
  const jwt = {
    sign: jest.fn(),
    verify: jest.fn(),
    signAsync: jest.fn(),
  } as unknown as JwtService;
  const redis = {
    setOtp: jest.fn(),
    getOtp: jest.fn(),
    deleteOtp: jest.fn(),
  } as unknown as RedisService;
  const email = { sendOtpEmail: jest.fn() } as unknown as EmailService;
  const config = {
    get: jest.fn((key: string) => `${key}-value`),
  } as unknown as ConfigService;

  beforeEach(() => {
    findOneBy.mockReset();
    create.mockReset();
    save.mockReset();
    getOne.mockReset();
    queryBuilder.addSelect.mockReset().mockReturnValue(queryBuilder);
    queryBuilder.where.mockReset().mockReturnValue(queryBuilder);
    repository.createQueryBuilder.mockReset().mockReturnValue(queryBuilder);
    (manager.getRepository as jest.Mock).mockClear();
    (jwt.sign as jest.Mock).mockReset();
    (jwt.verify as jest.Mock).mockReset();
    (jwt.signAsync as jest.Mock).mockReset();
    (redis.setOtp as jest.Mock).mockReset();
    (redis.getOtp as jest.Mock).mockReset();
    (redis.deleteOtp as jest.Mock).mockReset();
    (email.sendOtpEmail as jest.Mock).mockReset();
  });

  it('creates a global verified User without an Organization or Membership', async () => {
    const service = createService(manager, jwt, redis, email, config);
    const user = makeUser();
    findOneBy.mockResolvedValue(null);
    (jwt.verify as jest.Mock).mockReturnValue({ email: 'new@example.test' });
    create.mockReturnValue(user);
    save.mockResolvedValue(user);
    (jwt.signAsync as jest.Mock)
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await service.completeSignup('verified-token', {
      fullName: 'New User',
      password: 'password-123',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.test',
        name: 'New User',
        emailVerifiedAt: expect.any(Date),
      }),
    );
    expect(create.mock.calls[0][0]).not.toHaveProperty('organizationId');
    expect(create.mock.calls[0][0]).not.toHaveProperty('role');
    expect(result.user).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      profileImageUrl: null,
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: user.id, email: user.email },
      expect.any(Object),
    );
  });

  it('normalizes registration email before checking and sending an OTP', async () => {
    const service = createService(manager, jwt, redis, email, config);
    findOneBy.mockResolvedValue(null);
    (redis.setOtp as jest.Mock).mockResolvedValue(undefined);
    (email.sendOtpEmail as jest.Mock).mockResolvedValue(undefined);

    await service.register(' User@Example.Test ');

    expect(findOneBy).toHaveBeenCalledWith({ email: 'user@example.test' });
    expect(redis.setOtp).toHaveBeenCalledWith(
      'user@example.test',
      expect.stringMatching(/^\d{6}$/),
      300,
    );
    expect(email.sendOtpEmail).toHaveBeenCalledWith(
      'user@example.test',
      expect.any(String),
    );
  });

  it('issues token claims without a global authorization role on login', async () => {
    const service = createService(manager, jwt, redis, email, config);
    const user = makeUser({
      passwordHash: await awaitPasswordHash('password-123'),
    });
    getOne.mockResolvedValue(user);
    (jwt.signAsync as jest.Mock)
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    save.mockResolvedValue(user);

    await service.login({ email: user.email, password: 'password-123' });

    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: user.id, email: user.email },
      expect.any(Object),
    );
  });

  it('applies the signup password policy before creating a User', async () => {
    const service = createService(manager, jwt, redis, email, config);
    (jwt.verify as jest.Mock).mockReturnValue({ email: 'new@example.test' });

    await expect(
      service.completeSignup('verified-token', {
        fullName: 'New User',
        password: 'short',
      }),
    ).rejects.toThrow('Password must be between 8 and 128 characters');

    expect(create).not.toHaveBeenCalled();
  });

  it('changes a password only after the current password matches and revokes the refresh credential', async () => {
    const service = createService(manager, jwt, redis, email, config);
    const user = makeUser({
      passwordHash: await awaitPasswordHash('current-password'),
      refreshTokenHash: await awaitPasswordHash('refresh-token'),
    });
    getOne.mockResolvedValue(user);
    save.mockImplementation(async (entity) => entity);

    await expect(
      service.changePassword(user.id, {
        currentPassword: 'current-password',
        newPassword: 'new-password',
        confirmPassword: 'new-password',
      }),
    ).resolves.toEqual({
      message: 'Password changed successfully. Please sign in again.',
    });

    expect(await bcrypt.compare('new-password', user.passwordHash)).toBe(true);
    expect(user.refreshTokenHash).toBeNull();
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({ actionCode: 'AUTH_PASSWORD_CHANGED' }),
    );
    expect(create.mock.calls.at(-1)?.[0]).not.toHaveProperty('password');
    expect(create.mock.calls.at(-1)?.[0]).not.toHaveProperty('currentPassword');
    expect(create.mock.calls.at(-1)?.[0]).not.toHaveProperty('newPassword');
  });

  it('rejects an incorrect current password without mutating credentials', async () => {
    const service = createService(manager, jwt, redis, email, config);
    const passwordHash = await awaitPasswordHash('current-password');
    const user = makeUser({ passwordHash, refreshTokenHash: 'refresh-hash' });
    getOne.mockResolvedValue(user);

    await expect(
      service.changePassword(user.id, {
        currentPassword: 'wrong-password',
        newPassword: 'new-password',
        confirmPassword: 'new-password',
      }),
    ).rejects.toThrow('Current password is incorrect');

    expect(user.passwordHash).toBe(passwordHash);
    expect(user.refreshTokenHash).toBe('refresh-hash');
    expect(save).not.toHaveBeenCalled();
  });

  it('returns safe default personal preferences until a User saves them', async () => {
    const service = createService(manager, jwt, redis, email, config);
    findOneBy.mockResolvedValueOnce(makeUser()).mockResolvedValueOnce(null);

    await expect(service.getPersonalPreferences('user-id')).resolves.toEqual({
      timezone: 'UTC',
      locale: 'en-US',
      weekStartsOn: 1,
      inAppNotificationsEnabled: true,
    });
  });

  it('persists personal preferences without recording credentials in audit data', async () => {
    const service = createService(manager, jwt, redis, email, config);
    const user = makeUser();
    findOneBy.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    create.mockImplementation((value) => value);
    save.mockImplementation(async (entity) => entity);

    await expect(
      service.updatePersonalPreferences(user.id, {
        timezone: 'Asia/Ho_Chi_Minh',
        locale: 'vi-VN',
        weekStartsOn: 1,
        inAppNotificationsEnabled: false,
      }),
    ).resolves.toEqual({
      timezone: 'Asia/Ho_Chi_Minh',
      locale: 'vi-VN',
      weekStartsOn: 1,
      inAppNotificationsEnabled: false,
    });

    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({ actionCode: 'AUTH_PERSONAL_PREFERENCES_UPDATED' }),
    );
    expect(create.mock.calls.at(-1)?.[0]).not.toHaveProperty('password');
    expect(create.mock.calls.at(-1)?.[0]).not.toHaveProperty('token');
  });

  it('prohibits password change on portfolio demo accounts', async () => {
    const service = createService(manager, jwt, redis, email, config);
    const demoUser = makeUser({ email: 'owner@taskforge.dev' });
    getOne.mockResolvedValueOnce(demoUser);

    await expect(
      service.changePassword('demo-user-id', {
        currentPassword: 'Password123!',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      }),
    ).rejects.toThrow('Password change is disabled for demo accounts in portfolio mode.');
  });
});

function createService(
  manager: EntityManager,
  jwt: JwtService,
  redis: RedisService,
  email: EmailService,
  config: ConfigService,
): PostgresAuthService {
  return new PostgresAuthService(manager, jwt, redis, email, config);
}

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-id',
    email: 'user@example.test',
    name: 'User',
    passwordHash: 'unused',
    profileImageUrl: null,
    emailVerifiedAt: new Date(),
    refreshTokenHash: null,
    disabledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function awaitPasswordHash(password: string): Promise<string> {
  return bcrypt.hash(password, 4);
}
