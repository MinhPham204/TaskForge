import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { MembershipService } from '../../modules/membership/membership.service';
import type { MembershipDocument } from '../../modules/membership/schemas/membership.schema';
import { UserRole } from '../../modules/user/schemas/user.schema';
import { TenantMembershipGuard } from './tenant-membership.guard';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('TenantMembershipGuard', () => {
  const userId = new Types.ObjectId().toString();
  const organizationId = new Types.ObjectId().toString();
  let reflector: { getAllAndOverride: jest.Mock };
  let membershipService: { findByUserAndOrg: jest.Mock };
  let guard: TenantMembershipGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    membershipService = { findByUserAndOrg: jest.fn() };
    guard = new TenantMembershipGuard(
      reflector as unknown as Reflector,
      membershipService as unknown as MembershipService,
    );
  });

  it('rejects an authenticated tenant request without organization header', async () => {
    const request = { user: { _id: userId }, headers: {} };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(membershipService.findByUserAndOrg).not.toHaveBeenCalled();
  });

  it('rejects an invalid organization id before querying membership', async () => {
    const request = {
      user: { _id: userId },
      headers: { 'x-organization-id': 'not-an-object-id' },
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(membershipService.findByUserAndOrg).not.toHaveBeenCalled();
  });

  it('rejects when no active membership exists', async () => {
    membershipService.findByUserAndOrg.mockResolvedValue(null);
    const request = {
      user: { _id: userId },
      headers: { 'x-organization-id': organizationId },
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(membershipService.findByUserAndOrg).toHaveBeenCalledWith(
      userId,
      organizationId,
      true,
    );
  });

  it('attaches the validated active membership for later RBAC guards', async () => {
    const membership = {
      user: new Types.ObjectId(userId),
      organization: new Types.ObjectId(organizationId),
      role: UserRole.ADMIN,
      isActive: true,
    } as MembershipDocument;
    membershipService.findByUserAndOrg.mockResolvedValue(membership);
    const request: Record<string, unknown> = {
      user: { _id: userId },
      headers: { 'x-organization-id': organizationId },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.activeMembership).toBe(membership);
  });

  it('bypasses membership validation for an explicit SkipTenant route', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const request = { user: { _id: userId }, headers: {} };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(membershipService.findByUserAndOrg).not.toHaveBeenCalled();
  });
});
