import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../../user/schemas/user.schema';
import type { TenantRequest } from '../../../common/interfaces/tenant-request.interface';

/**
 * Guard để kiểm tra user có phải là Owner của organization không.
 * Chỉ organization owner mới được add/remove members.
 */
@Injectable()
export class OrgOwnerGuard implements CanActivate {
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
    if (membership.role !== UserRole.OWNER) {
      throw new ForbiddenException(
        'Only organization owner can perform this action',
      );
    }

    return true;
  }
}
