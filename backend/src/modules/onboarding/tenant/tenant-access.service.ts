import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import type { OrganizationRole } from '../persistence/typeorm/onboarding.entities';
import { PostgresOrganizationMembershipRepository } from '../persistence/typeorm/onboarding.repositories';

export interface VerifiedPostgresTenantMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: OrganizationRole;
}

/**
 * Narrow PostgreSQL tenant authority boundary. It deliberately has no global
 * User role input: only an active Membership in a non-archived Organization
 * can establish tenant context.
 */
@Injectable()
export class PostgresTenantAccessService {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}

  async verify(
    userId: string,
    organizationId: string,
  ): Promise<VerifiedPostgresTenantMembership> {
    const membership = await new PostgresOrganizationMembershipRepository(
      this.manager,
    ).findVerifiedTenantMembership(userId, organizationId);
    if (!membership) {
      throw new ForbiddenException(
        'You do not have an active membership in this organization.',
      );
    }

    return {
      id: membership.id,
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: membership.role,
    };
  }
}
