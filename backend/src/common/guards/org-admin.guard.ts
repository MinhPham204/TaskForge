import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../../modules/user/schemas/user.schema';
import type { TenantRequest } from '../interfaces/tenant-request.interface';

/**
 * Guard kiểm tra quyền cấp Organization cho nhóm API giám sát hạ tầng.
 * Chỉ ORG_OWNER và ORG_ADMIN được phép truy cập.
 */
@Injectable()
export class OrgAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const role = request.activeMembership?.role;

    if (!role) {
      throw new ForbiddenException('Active membership role is missing');
    }

    const allowed = role === UserRole.OWNER || role === UserRole.ADMIN;
    if (!allowed) {
      throw new ForbiddenException(
        'Only ORG_OWNER or ORG_ADMIN can perform this action',
      );
    }

    return true;
  }
}
