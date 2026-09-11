import { AsyncLocalStorage } from 'async_hooks';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { OrganizationRole } from '../persistence/typeorm/onboarding.entities';

export interface PostgresTenantContext {
  organizationId: string;
  membershipId: string;
  membershipRole: OrganizationRole;
}

export const postgresTenantStorage =
  new AsyncLocalStorage<PostgresTenantContext>();

/**
 * Context is propagation only. The guard establishes authority from an active
 * PostgreSQL Membership before any value is placed here.
 */
@Injectable()
export class PostgresTenantContextService {
  get(): PostgresTenantContext | undefined {
    return postgresTenantStorage.getStore();
  }

  require(): PostgresTenantContext {
    const context = this.get();
    if (!context) {
      throw new ForbiddenException('Verified tenant context is required');
    }
    return context;
  }

  run<T>(context: PostgresTenantContext, work: () => T): T {
    return postgresTenantStorage.run(context, work);
  }
}
