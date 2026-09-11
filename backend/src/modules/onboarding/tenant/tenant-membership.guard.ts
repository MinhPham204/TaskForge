import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { SKIP_TENANT_KEY } from '../../../common/decorators/skip-tenant.decorator';
import type { VerifiedPostgresTenantMembership } from './tenant-access.service';
import { PostgresTenantAccessService } from './tenant-access.service';

export const POSTGRES_ORGANIZATION_HEADER = 'x-organization-id';

export interface PostgresTenantRequest {
  user?: { sub?: string };
  headers: Record<string, string | string[] | undefined>;
  postgresTenant?: VerifiedPostgresTenantMembership;
}

@Injectable()
export class PostgresTenantMembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantAccess: PostgresTenantAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipTenant = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipTenant) return true;

    const request = context.switchToHttp().getRequest<PostgresTenantRequest>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const headerValue = request.headers[POSTGRES_ORGANIZATION_HEADER];
    if (Array.isArray(headerValue) || !headerValue) {
      throw new BadRequestException(
        `Missing single header "${POSTGRES_ORGANIZATION_HEADER}". Select a workspace before continuing.`,
      );
    }
    if (!isUUID(headerValue, '4')) {
      throw new BadRequestException(
        `Header "${POSTGRES_ORGANIZATION_HEADER}" must be a UUID v4 organization id.`,
      );
    }

    request.postgresTenant = await this.tenantAccess.verify(
      userId,
      headerValue,
    );
    return true;
  }
}
