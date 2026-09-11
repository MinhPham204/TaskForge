import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { SKIP_TENANT_KEY } from '../../../common/decorators/skip-tenant.decorator';
import { postgresTenantStorage } from './tenant-context';
import type { PostgresTenantRequest } from './tenant-membership.guard';

/** Opens PostgreSQL tenant context only after PostgresTenantMembershipGuard. */
@Injectable()
export class PostgresTenantInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skipTenant = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipTenant) return next.handle();

    const request = context.switchToHttp().getRequest<PostgresTenantRequest>();
    if (!request.user?.sub) return next.handle();
    const tenant = request.postgresTenant;
    if (!tenant) {
      throw new ForbiddenException(
        'Tenant context was not validated before request handling.',
      );
    }

    return new Observable((subscriber) => {
      postgresTenantStorage.run(
        {
          organizationId: tenant.organizationId,
          membershipId: tenant.id,
          membershipRole: tenant.role,
        },
        () => {
          next.handle().subscribe({
            next: (value) => subscriber.next(value),
            error: (error: unknown) => subscriber.error(error),
            complete: () => subscriber.complete(),
          });
        },
      );
    });
  }
}
