import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import type { MembershipDocument } from '../../modules/membership/schemas/membership.schema';
import { UserRole } from '../../modules/user/schemas/user.schema';
import { RolesGuard } from './roles.guard';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('authorizes with Membership role and ignores the legacy global user role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    const request = {
      user: { role: UserRole.MEMBER },
      activeMembership: {
        organization: new Types.ObjectId(),
        role: UserRole.ADMIN,
      } as MembershipDocument,
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('denies when the Membership role is not allowed', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    const request = {
      user: { role: UserRole.ADMIN },
      activeMembership: {
        organization: new Types.ObjectId(),
        role: UserRole.MEMBER,
      } as MembershipDocument,
    };

    expect(guard.canActivate(contextFor(request))).toBe(false);
  });
});
