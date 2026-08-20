import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { defer, lastValueFrom, of } from 'rxjs';
import type { MembershipDocument } from '../../modules/membership/schemas/membership.schema';
import { UserRole } from '../../modules/user/schemas/user.schema';
import { tenantStorage } from '../als/tenant-storage';
import { TenantInterceptor } from './tenant.interceptor';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('TenantInterceptor', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let interceptor: TenantInterceptor;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    interceptor = new TenantInterceptor(reflector as unknown as Reflector);
  });

  it('opens ALS from the membership already validated by the guard', async () => {
    const organizationId = new Types.ObjectId();
    const request = {
      user: { _id: new Types.ObjectId().toString() },
      headers: { 'x-organization-id': organizationId.toString() },
      activeMembership: {
        organization: organizationId,
        role: UserRole.ADMIN,
      } as MembershipDocument,
    };
    let observedStore: ReturnType<typeof tenantStorage.getStore>;
    const next: CallHandler = {
      handle: () =>
        defer(() => {
          observedStore = tenantStorage.getStore();
          return of('ok');
        }),
    };

    const stream = interceptor.intercept(contextFor(request), next);
    await expect(lastValueFrom(stream)).resolves.toBe('ok');
    expect(observedStore).toEqual({
      organizationId: organizationId.toString(),
      membershipRole: UserRole.ADMIN,
    });
  });

  it('fails closed when an authenticated tenant route missed the tenant guard', () => {
    const request = {
      user: { _id: new Types.ObjectId().toString() },
      headers: {},
    };

    expect(() =>
      interceptor.intercept(contextFor(request), { handle: () => of('ok') }),
    ).toThrow(ForbiddenException);
  });

  it('does not require tenant context on an explicit SkipTenant route', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const request = {
      user: { _id: new Types.ObjectId().toString() },
      headers: {},
    };

    const stream = interceptor.intercept(contextFor(request), {
      handle: () => of('ok'),
    });
    await expect(lastValueFrom(stream)).resolves.toBe('ok');
  });
});
