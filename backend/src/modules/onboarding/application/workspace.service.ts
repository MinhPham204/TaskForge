import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import { OrganizationRoleDefinitionEntity } from '../persistence/typeorm/onboarding.entities';
import type {
  OrganizationEntity,
} from '../persistence/typeorm/onboarding.entities';
import {
  PostgresOrganizationMembershipRepository,
  PostgresOrganizationRepository,
} from '../persistence/typeorm/onboarding.repositories';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';
import { PostgresOrganizationPermissionService } from './organization-permission.service';

export interface WorkspaceSummary {
  organizationId: string;
  name: string;
  logoUrl: string | null;
  role: string;
  roleId: string;
  roleName: string;
  systemCode: string | null;
  isOwner: boolean;
  joinedAt: Date;
}

export interface UpdatePostgresOrganizationInput {
  name?: string;
  logoUrl?: string | null;
}

export interface TransferPostgresOrganizationOwnerInput {
  targetUserId: string;
  previousOwnerRoleId: string;
}

export interface OrganizationSettingsSummary {
  id: string;
  name: string;
  logoUrl: string | null;
  role: string;
  roleId: string;
  roleName: string;
  systemCode: string | null;
  isOwner: boolean;
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

    const role = await this.manager.getRepository(OrganizationRoleDefinitionEntity).findOneBy({ id: membership.roleId, organizationId });
    if (!role || role.archivedAt) throw new ForbiddenException('Active Membership role is unavailable');
    return toWorkspaceSummary(organization, role, membership.id, membership.joinedAt);
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
      roleId: workspace.roleId,
      roleName: workspace.roleName,
      systemCode: workspace.systemCode,
      isOwner: workspace.isOwner,
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
      await new PostgresOrganizationPermissionService(manager).requirePermission(actorUserId, organizationId, 'org.settings.update');
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
      const previousOwnerRole = await manager.getRepository(OrganizationRoleDefinitionEntity).findOneBy({ id: input.previousOwnerRoleId, organizationId });
      const ownerRole = await manager.getRepository(OrganizationRoleDefinitionEntity).findOneBy({ id: currentOwner.roleId, organizationId, systemCode: 'OWNER', isProtected: true });
      const targetRole = await manager.getRepository(OrganizationRoleDefinitionEntity).findOneBy({ id: target.roleId, organizationId });
      if (!previousOwnerRole || previousOwnerRole.systemCode === 'OWNER' || previousOwnerRole.isProtected || previousOwnerRole.archivedAt) throw new BadRequestException('Previous owner role must be an active non-Owner role in this Organization');
      if (!ownerRole || !targetRole || targetRole.systemCode === 'OWNER' || targetRole.isProtected) throw new ConflictException('Ownership roles are inconsistent');
      const before = { ownerUserId: currentOwner.userId, ownerRoleId: ownerRole.id, previousOwnerRoleId: target.roleId };
      currentOwner.roleId = previousOwnerRole.id;
      target.roleId = ownerRole.id;
      await memberships.save(currentOwner);
      await memberships.save(target);
      organization.ownerMembershipId = target.id;
      await organizations.save(organization);
      await writePostgresAudit(manager, {
        organizationId,
        actorUserId,
        actorMembershipId: currentOwner.id,
        actionCode: 'ORGANIZATION_OWNERSHIP_TRANSFERRED',
        targetType: 'ORGANIZATION_MEMBERSHIP',
        targetId: target.id,
        beforeData: before,
        afterData: {
          ownerUserId: target.userId,
          ownerRoleId: ownerRole.id,
          previousOwnerRoleId: previousOwnerRole.id,
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

    const owner = await memberships.findActiveByIdForUpdate(organizationId, organization.ownerMembershipId);
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
    if (!actor) {
      throw new ForbiddenException(
        'An active Organization Membership is required',
      );
    }
    return { organization, actor };
  }
}

function toWorkspaceSummary(
  organization: OrganizationEntity,
  role: OrganizationRoleDefinitionEntity,
  membershipId: string,
  joinedAt: Date,
): WorkspaceSummary {
  return {
    organizationId: organization.id,
    name: organization.name,
    logoUrl: organization.logoUrl,
    role: role.name,
    roleId: role.id,
    roleName: role.name,
    systemCode: role.systemCode,
    isOwner: organization.ownerMembershipId === membershipId,
    joinedAt,
  };
}
