import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Membership } from '../../modules/membership/schemas/membership.schema';
import type { TenantRequest } from '../interfaces/tenant-request.interface';

/** Returns the active Membership previously validated by TenantMembershipGuard. */
export const CurrentMembership = createParamDecorator(
  (field: keyof Membership | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<TenantRequest>();
    const membership = request.activeMembership;
    return field ? membership?.[field] : membership;
  },
);
