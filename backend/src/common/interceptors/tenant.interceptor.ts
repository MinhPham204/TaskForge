import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tenantStorage } from '../als/tenant-storage';
import { SKIP_TENANT_KEY } from '../decorators/skip-tenant.decorator';
import type { TenantRequest } from '../interfaces/tenant-request.interface';

/**
 * TenantInterceptor — chạy sau Guards (JwtAuthGuard đã set req.user).
 *
 * TenantMembershipGuard đã validate `X-Organization-Id` và gắn activeMembership
 * trước khi các RBAC guard chạy. Interceptor chỉ mở ALS quanh controller/service để
 * Mongoose tenant plugin và application context dùng đúng organization đã xác thực.
 *
 * Route/controller đánh dấu @SkipTenant() (vd: Auth, Organization) sẽ bỏ qua toàn bộ
 * bước này — các route đó vận hành trên User/Organization, vốn đã bị loại khỏi
 * tenantPlugin nên không cần org context.
 *
 * Public routes (không có user, vd: login/register): bỏ qua, không set context.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skipTenant = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipTenant) return next.handle();

    const req = context.switchToHttp().getRequest<TenantRequest>();

    if (!req.user?._id) return next.handle(); // Public route; auth guard xử lý route private.

    const membership = req.activeMembership;
    if (!membership) {
      throw new ForbiddenException(
        'Tenant context was not validated before request handling.',
      );
    }
    const organizationId = membership.organization.toString();

    // Wrap handler trong ALS context -> mọi async operation kế thừa context này
    return new Observable((subscriber) => {
      tenantStorage.run(
        { organizationId, membershipRole: membership.role },
        () => {
          next.handle().subscribe({
            next: (val) => subscriber.next(val),
            error: (err) => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
        },
      );
    });
  }
}
