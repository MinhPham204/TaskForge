import type { ExecutionContext } from '@nestjs/common';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { PostgresTenantInterceptor } from './tenant.interceptor';
import {
  POSTGRES_ORGANIZATION_HEADER,
  PostgresTenantMembershipGuard,
  type PostgresTenantRequest,
} from './tenant-membership.guard';
import { postgresTenantStorage } from './tenant-context';

describe('PostgresTenantMembershipGuard', () => {
  const organizationId = 'b1cc24e8-bfbf-4b88-9b78-7d659a5ecb79';
  const request: PostgresTenantRequest = {
    user: { sub: 'user-id' },
    headers: { [POSTGRES_ORGANIZATION_HEADER]: organizationId },
  };
  const reflector = { getAllAndOverride: jest.fn() };
  const tenantAccess = { verify: jest.fn() };

  beforeEach(() => {
    reflector.getAllAndOverride.mockReset();
    reflector.getAllAndOverride.mockReturnValue(false);
    tenantAccess.verify.mockReset();
    request.user = { sub: 'user-id' };
    request.headers = { [POSTGRES_ORGANIZATION_HEADER]: organizationId };
    request.postgresTenant = undefined;
  });

  it('verifies the UUID header against active PostgreSQL Membership, not a global role', async () => {
    tenantAccess.verify.mockResolvedValue({
      id: 'membership-id',
      userId: 'user-id',
      organizationId,
      role: 'MEMBER',
    });
    const guard = new PostgresTenantMembershipGuard(
      reflector as never,
      tenantAccess as never,
    );

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);

    expect(tenantAccess.verify).toHaveBeenCalledWith('user-id', organizationId);
    expect(request.postgresTenant).toEqual(
      expect.objectContaining({
        id: 'membership-id',
        role: 'MEMBER',
      }),
    );
  });

  it('fails closed for a malformed or duplicate tenant header', async () => {
    request.headers = { [POSTGRES_ORGANIZATION_HEADER]: ['first', 'second'] };
    const guard = new PostgresTenantMembershipGuard(
      reflector as never,
      tenantAccess as never,
    );

    await expect(
      guard.canActivate(makeContext(request)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tenantAccess.verify).not.toHaveBeenCalled();
  });

  it('does not open async tenant context unless the guard attached verified access', () => {
    const interceptor = new PostgresTenantInterceptor(reflector as never);

    expect(() =>
      interceptor.intercept(makeContext(request), { handle: () => of('ok') }),
    ).toThrow(ForbiddenException);
  });

  it('propagates only verified Membership context through the request', async () => {
    request.postgresTenant = {
      id: 'membership-id',
      userId: 'user-id',
      organizationId,
      role: 'ADMIN' as never,
    };
    const interceptor = new PostgresTenantInterceptor(reflector as never);

    await expect(
      firstValueFrom(
        interceptor.intercept(makeContext(request), {
          handle: () => of(postgresTenantStorage.getStore()),
        }),
      ),
    ).resolves.toEqual({
      organizationId,
      membershipId: 'membership-id',
      membershipRole: 'ADMIN',
    });
  });
});

function makeContext(request: PostgresTenantRequest): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
