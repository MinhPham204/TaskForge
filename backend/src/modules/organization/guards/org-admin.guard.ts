import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../../user/schemas/user.schema';
import type { TenantRequest } from '../../../common/interfaces/tenant-request.interface';

/**
 * Guard lớp 1 cho nhóm API quản trị nhân sự Organization.
 * Cho phép ORG_OWNER và ORG_ADMIN thuộc đúng organization thao tác.
 */
@Injectable()
export class OrgAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const membership = request.activeMembership;
    const orgId = request.params?.id;

    if (!orgId) {
      throw new ForbiddenException('Organization ID not provided');
    }
    if (!membership || membership.organization.toString() !== orgId) {
      throw new ForbiddenException(
        'Active organization does not match the requested organization',
      );
    }

    const isAllowedRole =
      membership.role === UserRole.OWNER || membership.role === UserRole.ADMIN;

    if (!isAllowedRole) {
      throw new ForbiddenException(
        'Only ORG_OWNER or ORG_ADMIN can perform this action',
      );
    }

    return true;
  }
}
