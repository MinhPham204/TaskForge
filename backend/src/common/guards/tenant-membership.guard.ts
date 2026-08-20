import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { MembershipService } from '../../modules/membership/membership.service';
import { SKIP_TENANT_KEY } from '../decorators/skip-tenant.decorator';
import type { TenantRequest } from '../interfaces/tenant-request.interface';

export const ORGANIZATION_HEADER = 'x-organization-id';

/**
 * Validates tenant membership before route-level RBAC guards execute.
 *
 * Nest runs guards before interceptors, so this validation cannot live in
 * TenantInterceptor when RolesGuard/OrgAdminGuard need activeMembership.
 */
@Injectable()
export class TenantMembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly membershipService: MembershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipTenant = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipTenant) return true;

    const request = context.switchToHttp().getRequest<TenantRequest>();
    const userId = request.user?._id?.toString();
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const headerValue = request.headers[ORGANIZATION_HEADER];
    const organizationId = Array.isArray(headerValue)
      ? headerValue[0]
      : headerValue;

    if (!organizationId) {
      throw new BadRequestException(
        `Missing header "${ORGANIZATION_HEADER}". Select a workspace before continuing.`,
      );
    }
    if (!Types.ObjectId.isValid(organizationId)) {
      throw new BadRequestException(
        `Header "${ORGANIZATION_HEADER}" must be a valid organization id.`,
      );
    }

    const membership = await this.membershipService.findByUserAndOrg(
      userId,
      organizationId,
      true,
    );
    if (!membership) {
      throw new ForbiddenException(
        'You do not have an active membership in this organization.',
      );
    }

    request.activeMembership = membership;
    return true;
  }
}
