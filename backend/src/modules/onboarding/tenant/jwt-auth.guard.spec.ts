import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { UserEntity } from '../persistence/typeorm/onboarding.entities';
import { PostgresJwtAuthGuard } from './jwt-auth.guard';

describe('PostgresJwtAuthGuard', () => {
  const userRepository = { findOneBy: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === UserEntity) return userRepository;
      throw new Error('Unexpected entity');
    }),
  } as unknown as EntityManager;
  const jwtService = { verifyAsync: jest.fn() };
  const config = { get: jest.fn() };
  const request = {
    headers: { authorization: 'Bearer access-token' },
  };

  beforeEach(() => {
    userRepository.findOneBy.mockReset();
    jwtService.verifyAsync.mockReset();
    config.get.mockReset();
    config.get.mockReturnValue('access-secret');
    request.headers.authorization = 'Bearer access-token';
  });

  it('attaches only the verified subject/email for an enabled global User', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      email: 'user@example.test',
    });
    userRepository.findOneBy.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.test',
      disabledAt: null,
    });
    const guard = new PostgresJwtAuthGuard(
      jwtService as never,
      config as never,
      manager,
    );

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);

    expect(request).toMatchObject({
      user: { sub: 'user-id', email: 'user@example.test' },
    });
  });

  it('fails closed when the global User has been disabled', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      email: 'user@example.test',
    });
    userRepository.findOneBy.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.test',
      disabledAt: new Date(),
    });
    const guard = new PostgresJwtAuthGuard(
      jwtService as never,
      config as never,
      manager,
    );

    await expect(
      guard.canActivate(makeContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function makeContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
