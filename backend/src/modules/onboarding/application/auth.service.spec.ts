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
