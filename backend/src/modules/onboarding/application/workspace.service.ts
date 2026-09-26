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
import { writePostgresAudit } from '../../collaboration/application/audit.writer';

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

export interface OrganizationSettingsSummary {
  id: string;
  name: string;
  logoUrl: string | null;
  role: OrganizationRole;
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

  async getOrganizationSettings(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationSettingsSummary> {
    const workspace = await this.selectWorkspace(userId, organizationId);
    return {
      id: workspace.organizationId,
      name: workspace.name,
      logoUrl: workspace.logoUrl,
      role: workspace.role,
    };
  }

  updateOrganization(
    actorUserId: string,
    organizationId: string,
    input: UpdatePostgresOrganizationInput,
  ): Promise<OrganizationEntity> {
    return this.transactions.run(async (manager) => {
      const { organization, actor } = await this.requireAdministratorAndOrganization(
        manager,
        actorUserId,
        organizationId,
      );
      const beforeData = { name: organization.name, logoUrl: organization.logoUrl };

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

      const saved = await new PostgresOrganizationRepository(manager).save(
        organization,
      );
      await writePostgresAudit(manager, {
        organizationId,
        actorUserId,
        actorMembershipId: actor.id,
        actionCode: 'ORGANIZATION_PROFILE_UPDATED',
        targetType: 'ORGANIZATION',
        targetId: saved.id,
        beforeData,
        afterData: { name: saved.name, logoUrl: saved.logoUrl },
      });
      return saved;
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
      const saved = await new PostgresOrganizationRepository(manager).save(
        organization,
      );
      await writePostgresAudit(manager, {
        organizationId,
        actorUserId,
        actionCode: 'ORGANIZATION_ARCHIVED',
        targetType: 'ORGANIZATION',
        targetId: saved.id,
      });
      return saved;
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
      await writePostgresAudit(manager, {
        organizationId,
        actorUserId,
        actorMembershipId: currentOwner.id,
        actionCode: 'ORGANIZATION_OWNERSHIP_TRANSFERRED',
        targetType: 'ORGANIZATION_MEMBERSHIP',
        targetId: target.id,
        beforeData: { previousOwnerUserId: actorUserId },
        afterData: {
          ownerUserId: target.userId,
          previousOwnerRole: currentOwner.role,
        },
      });
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

  private async requireAdministratorAndOrganization(
    manager: EntityManager,
    actorUserId: string,
    organizationId: string,
  ): Promise<{ organization: OrganizationEntity; actor: { id: string } }> {
    const organizations = new PostgresOrganizationRepository(manager);
    const memberships = new PostgresOrganizationMembershipRepository(manager);
    const organization = await organizations.findByIdForUpdate(organizationId);
    if (!organization || organization.archivedAt) {
      throw new NotFoundException('Organization not found');
    }
    const actor = await memberships.findActiveByUserAndOrganizationForUpdate(
      actorUserId,
      organizationId,
    );
    if (!actor || (actor.role !== 'OWNER' && actor.role !== 'ADMIN')) {
      throw new ForbiddenException(
        'An active organization owner or admin is required',
      );
    }
    return { organization, actor };
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
