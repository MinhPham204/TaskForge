import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import type {
  OrganizationEntity,
  OrganizationRole,
} from '../persistence/typeorm/onboarding.entities';
import {
  PostgresOrganizationMembershipRepository,
  PostgresOrganizationRepository,
} from '../persistence/typeorm/onboarding.repositories';

export interface WorkspaceSummary {
  organizationId: string;
  name: string;
  logoUrl: string | null;
  role: OrganizationRole;
  joinedAt: Date;
}

export interface UpdatePostgresOrganizationInput {
  name?: string;
  logoUrl?: string | null;
}

export interface TransferPostgresOrganizationOwnerInput {
  targetUserId: string;
  previousOwnerRole: OrganizationRole.ADMIN | OrganizationRole.MEMBER;
}

/**
 * Workspace reads and Organization lifecycle commands. Tenant authorization is
 * rechecked from active Membership here; P2-06 will add the HTTP guard/context
 * that supplies the same verified Organization scope to all tenant routes.
 */
export class PostgresWorkspaceService {
  constructor(
    private readonly manager: EntityManager,
    private readonly transactions: PostgresTransactionRunner,
  ) {}

  listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
    return new PostgresOrganizationMembershipRepository(
      this.manager,
    ).listActiveWorkspaces(userId);
  }

  async selectWorkspace(
    userId: string,
    organizationId: string,
  ): Promise<WorkspaceSummary> {
    const memberships = new PostgresOrganizationMembershipRepository(
      this.manager,
    );
    const membership = await memberships.findActiveByUserAndOrganization(
      userId,
      organizationId,
    );
    const organization = await new PostgresOrganizationRepository(
      this.manager,
    ).findActiveById(organizationId);

    if (!membership || !organization) {
      throw new ForbiddenException('Active workspace access is required');
    }

    return toWorkspaceSummary(
      organization,
      membership.role,
      membership.joinedAt,
    );
  }

  updateOrganization(
    actorUserId: string,
    organizationId: string,
    input: UpdatePostgresOrganizationInput,
  ): Promise<OrganizationEntity> {
    return this.transactions.run(async (manager) => {
      const organization = await this.requireOwnerAndOrganization(
        manager,
        actorUserId,
        organizationId,
      );

      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) {
          throw new BadRequestException('Organization name is required');
        }
        organization.name = name;
      }
      if (input.logoUrl !== undefined) {
        organization.logoUrl = input.logoUrl;
      }

      return new PostgresOrganizationRepository(manager).save(organization);
    });
  }

  archiveOrganization(
    actorUserId: string,
    organizationId: string,
  ): Promise<OrganizationEntity> {
    return this.transactions.run(async (manager) => {
      const organization = await this.requireOwnerAndOrganization(
        manager,
        actorUserId,
        organizationId,
      );
      organization.archivedAt = new Date();
      return new PostgresOrganizationRepository(manager).save(organization);
    });
  }

  transferOwner(
    actorUserId: string,
    organizationId: string,
    input: TransferPostgresOrganizationOwnerInput,
  ): Promise<void> {
    if (actorUserId === input.targetUserId) {
      throw new BadRequestException(
        'Target user is already the organization owner',
      );
    }
    if (
      input.previousOwnerRole !== 'ADMIN' &&
      input.previousOwnerRole !== 'MEMBER'
    ) {
      throw new BadRequestException(
        'Previous owner role must be ADMIN or MEMBER',
      );
    }

    return this.transactions.run(async (manager) => {
      const organizations = new PostgresOrganizationRepository(manager);
      const memberships = new PostgresOrganizationMembershipRepository(manager);
      const organization =
        await organizations.findByIdForUpdate(organizationId);
      if (!organization || organization.archivedAt) {
        throw new NotFoundException('Organization not found');
      }

      const currentOwner =
        await memberships.findActiveOwnerForUpdate(organizationId);
      if (!currentOwner || currentOwner.userId !== actorUserId) {
        throw new ForbiddenException(
          'Only the active owner can transfer ownership',
        );
      }

      const target = await memberships.findActiveByUserAndOrganizationForUpdate(
        input.targetUserId,
        organizationId,
      );
      if (!target) {
        throw new BadRequestException(
          'Target user must have an active organization membership',
        );
      }

      currentOwner.role = input.previousOwnerRole;
      target.role = 'OWNER' as OrganizationRole;
      await memberships.save(currentOwner);
      await memberships.save(target);
    });
  }

  private async requireOwnerAndOrganization(
    manager: EntityManager,
    actorUserId: string,
    organizationId: string,
  ): Promise<OrganizationEntity> {
    const organizations = new PostgresOrganizationRepository(manager);
    const memberships = new PostgresOrganizationMembershipRepository(manager);
    const organization = await organizations.findByIdForUpdate(organizationId);
    if (!organization || organization.archivedAt) {
      throw new NotFoundException('Organization not found');
    }

    const owner = await memberships.findActiveOwnerForUpdate(organizationId);
    if (!owner || owner.userId !== actorUserId) {
      throw new ForbiddenException(
        'Only the active owner can manage this organization',
      );
    }

    return organization;
  }
}

function toWorkspaceSummary(
  organization: OrganizationEntity,
  role: OrganizationRole,
  joinedAt: Date,
): WorkspaceSummary {
  return {
    organizationId: organization.id,
    name: organization.name,
    logoUrl: organization.logoUrl,
    role,
    joinedAt,
  };
}
