import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/user/schemas/user.schema';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { TenantRequest } from '../interfaces/tenant-request.interface';

/**
 * RolesGuard — check role của active Membership đã được tenant guard xác thực
 * so với danh sách role được phép (từ metadata @Roles(...)).
 *
 * Flow sử dụng:
 *   @Roles(UserRole.ADMIN, UserRole.OWNER)
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Patch(':id/approve')
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Lấy danh sách role được phép từ metadata của handler/class
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Không có @Roles() -> Accept all
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<TenantRequest>();
    const userRole = request.activeMembership?.role;

    // Kiểm tra role của user có nằm trong danh sách được phép không
    return !!userRole && requiredRoles.includes(userRole);
  }
}
