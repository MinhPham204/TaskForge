import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import {
  OrganizationRoleDefinitionEntity,
  OrganizationRolePermissionEntity,
} from '../persistence/typeorm/onboarding.entities';
import type {
  InvitationState,
  OrganizationInvitationEntity,
  OrganizationMembershipEntity,
  OrganizationMembershipState,
} from '../persistence/typeorm/onboarding.entities';
import {
  PostgresOrganizationInvitationRepository,
  PostgresOrganizationMembershipRepository,
  PostgresOrganizationRepository,
  PostgresUserRepository,
} from '../persistence/typeorm/onboarding.repositories';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';
import { writePostgresOutbox } from '../../collaboration/application/outbox.writer';
import { encryptOutboxInvitationCredential } from '../../collaboration/application/outbox-credential';
import { PostgresOrganizationPermissionService } from './organization-permission.service';

const ACTIVE_MEMBERSHIP = 'ACTIVE' as OrganizationMembershipState;
const SUSPENDED_MEMBERSHIP = 'SUSPENDED' as OrganizationMembershipState;
const REVOKED_MEMBERSHIP = 'REVOKED' as OrganizationMembershipState;
const LEFT_MEMBERSHIP = 'LEFT' as OrganizationMembershipState;
const PENDING_INVITATION = 'PENDING' as InvitationState;
const ACCEPTED_INVITATION = 'ACCEPTED' as InvitationState;
const REJECTED_INVITATION = 'REJECTED' as InvitationState;
const REVOKED_INVITATION = 'REVOKED' as InvitationState;
const EXPIRED_INVITATION = 'EXPIRED' as InvitationState;

export interface CreatePostgresInvitationInput {
  email: string;
  expiresAt: Date;
  roleId?: string;
}

export interface CreatedPostgresInvitation {
  invitation: OrganizationInvitationEntity;
  /** Internal delivery credential. A future HTTP controller must send it only by email. */
  token: string;
}

export interface InvitationSummary {
  id: string;
  organizationId: string;
  email: string;
  roleId: string;
  roleName: string;
  systemCode: string | null;
  state: InvitationState;
  expiresAt: Date;
  createdAt: Date;
}

export interface OrganizationMemberSummary {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  profileImageUrl: string | null;
  role: string;
  roleId: string;
  roleName: string;
  systemCode: string | null;
  isOwner: boolean;
  state: OrganizationMembershipState;
  joinedAt: Date;
  stateChangedAt: Date;
}

/**
 * Invitation and OrganizationMembership lifecycle commands. Every mutation is
 * manager-scoped so invitation acceptance and membership activation commit or
 * roll back together. P2-10 wires this service into the PostgreSQL runtime.
 */
export class PostgresInvitationMembershipService {
  constructor(
    private readonly manager: EntityManager,
    private readonly transactions: PostgresTransactionRunner,
  ) {}

  async createInvitation(
    actorUserId: string,
    organizationId: string,
    input: CreatePostgresInvitationInput,
  ): Promise<CreatedPostgresInvitation> {
    const email = normalizeEmail(input.email);
    if (input.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invitation expiry must be in the future');
    }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashInvitationToken(token);
    const invitation = await this.transactions.run(async (manager) => {
      const memberships = new PostgresOrganizationMembershipRepository(manager);
      const actor = await this.requireActiveAdministrator(
        manager,
        actorUserId,
        organizationId,
        'org.members.invite',
      );
      const actorCapabilities = await new PostgresOrganizationPermissionService(manager).resolve(actorUserId, organizationId);
      const requestedRole = input.roleId
        ? await manager.getRepository(OrganizationRoleDefinitionEntity).createQueryBuilder('role').setLock('pessimistic_write').where('role.organization_id = :organizationId', { organizationId }).andWhere('role.id = :roleId', { roleId: input.roleId }).getOne()
        : await manager.getRepository(OrganizationRoleDefinitionEntity).findOneBy({ organizationId, systemCode: 'MEMBER' });
      if (!requestedRole || requestedRole.archivedAt || requestedRole.systemCode === 'OWNER' || requestedRole.isProtected) throw new BadRequestException('Invitation role must be an active non-Owner role in this Organization');
      const requestedPermissions = await manager.getRepository(OrganizationRolePermissionEntity).find({ where: { organizationId, roleId: requestedRole.id } });
      if (!actorCapabilities.isOwner && requestedPermissions.some((grant) => !actorCapabilities.permissions.includes(grant.permissionCode))) throw new ForbiddenException('Invited role permissions cannot exceed the inviter effective permissions');
      const users = new PostgresUserRepository(manager);
      const recipient = await users.findByEmail(email);
      if (recipient) {
        const activeMembership =
          await memberships.findActiveByUserAndOrganizationForUpdate(
            recipient.id,
            organizationId,
          );
        if (activeMembership) {
          throw new ConflictException(
            'User already has an active organization membership',
          );
        }
      }

      const invitations = new PostgresOrganizationInvitationRepository(manager);
      const pending =
        await invitations.findPendingByOrganizationAndEmailForUpdate(
          organizationId,
          email,
        );
      if (pending) {
        if (isExpired(pending)) {
          pending.state = EXPIRED_INVITATION;
          pending.respondedAt = new Date();
          await invitations.save(pending);
        } else {
          throw new ConflictException(
            'A pending invitation already exists for this email',
          );
        }
      }

      const created = await invitations.save(
        invitations.create({
          organizationId,
          email,
          roleId: requestedRole.id,
          invitedByMembershipId: actor.id,
          tokenHash,
          state: PENDING_INVITATION,
          expiresAt: input.expiresAt,
          respondedAt: null,
          acceptedUserId: null,
        }),
      );
      await writePostgresAudit(manager, {
        organizationId,
        actorUserId,
        actorMembershipId: actor.id,
        actionCode: 'ORGANIZATION_INVITATION_CREATED',
        targetType: 'ORGANIZATION_INVITATION',
        targetId: created.id,
        afterData: { email: created.email, roleId: created.roleId, roleName: requestedRole.name, expiresAt: created.expiresAt.toISOString() },
      });
      await writePostgresOutbox(manager, {
        organizationId,
        eventType: 'ORGANIZATION_INVITATION_CREATED',
        aggregateId: created.id,
        payload: {
          invitationId: created.id,
          credential: encryptOutboxInvitationCredential(token),
        },
      });
      return created;
    });

    return { invitation, token };
  }

  async listOrganizationInvitations(
    actorUserId: string,
    organizationId: string,
  ): Promise<InvitationSummary[]> {
    await this.requireActiveAdministratorForRead(
      this.manager,
      actorUserId,
      organizationId,
      'org.invitations.read',
    );
    const invitations = await new PostgresOrganizationInvitationRepository(
      this.manager,
    ).listPendingByOrganization(organizationId);
    return Promise.all(invitations.filter((invitation) => !isExpired(invitation)).map((invitation) => this.toInvitationSummary(this.manager, invitation)));
  }

  async listOrganizationMembers(
    actorUserId: string,
    organizationId: string,
  ): Promise<OrganizationMemberSummary[]> {
    await this.requireActiveAdministratorForRead(
      this.manager,
      actorUserId,
      organizationId,
      'org.members.read',
    );
    return new PostgresOrganizationMembershipRepository(
      this.manager,
    ).listByOrganization(organizationId);
  }

  async listMyPendingInvitations(userId: string): Promise<InvitationSummary[]> {
    const user = await new PostgresUserRepository(this.manager).findById(
      userId,
    );
    if (!user || user.disabledAt) {
      throw new NotFoundException('User not found');
    }
    const invitations = await new PostgresOrganizationInvitationRepository(
      this.manager,
    ).listPendingByEmail(user.email);
    return Promise.all(invitations.filter((invitation) => !isExpired(invitation)).map((invitation) => this.toInvitationSummary(this.manager, invitation)));
  }

  acceptInvitation(
    userId: string,
    token: string,
  ): Promise<OrganizationMembershipEntity> {
    return this.respondToInvitation(userId, token, 'ACCEPTED').then(
      (membership) => {
        if (!membership) {
          throw new ConflictException('Invitation was not accepted');
        }
        return membership;
      },
    );
  }

  rejectInvitation(userId: string, token: string): Promise<void> {
    return this.respondToInvitation(userId, token, 'REJECTED').then(
      () => undefined,
    );
  }

  revokeInvitation(
    actorUserId: string,
    organizationId: string,
    invitationId: string,
  ): Promise<void> {
    return this.transactions.run(async (manager) => {
      const actor = await this.requireActiveAdministrator(
        manager,
        actorUserId,
        organizationId,
        'org.invitations.revoke',
      );
      const invitations = new PostgresOrganizationInvitationRepository(manager);
      const invitation = await invitations.findByIdForUpdate(invitationId);
      if (!invitation || invitation.organizationId !== organizationId) {
        throw new NotFoundException('Invitation not found');
      }
      await this.requirePendingInvitation(invitations, invitation);
      invitation.state = REVOKED_INVITATION;
      invitation.respondedAt = new Date();
      await invitations.save(invitation);
      await writePostgresAudit(manager, {
        organizationId,
        actorUserId,
        actorMembershipId: actor.id,
        actionCode: 'ORGANIZATION_INVITATION_REVOKED',
        targetType: 'ORGANIZATION_INVITATION',
        targetId: invitation.id,
      });
    });
  }

  suspendMembership(
    actorUserId: string,
    organizationId: string,
    targetUserId: string,
  ): Promise<OrganizationMembershipEntity> {
    return this.setMembershipState(
      actorUserId,
      organizationId,
      targetUserId,
      SUSPENDED_MEMBERSHIP,
    );
  }

  revokeMembership(
    actorUserId: string,
    organizationId: string,
    targetUserId: string,
  ): Promise<OrganizationMembershipEntity> {
    return this.setMembershipState(
      actorUserId,
      organizationId,
      targetUserId,
      REVOKED_MEMBERSHIP,
    );
  }

  leaveOrganization(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembershipEntity> {
    return this.transactions.run(async (manager) => {
      const organization = await new PostgresOrganizationRepository(manager).findByIdForUpdate(organizationId);
      if (!organization || organization.archivedAt) throw new NotFoundException('Organization not found');
      const memberships = new PostgresOrganizationMembershipRepository(manager);
      const membership = await memberships.findByUserAndOrganizationForUpdate(
        userId,
        organizationId,
      );
      if (!membership) {
        throw new NotFoundException('Organization membership not found');
      }
      await this.assertNotActiveOwner(manager, membership);
      if (
        membership.state !== ACTIVE_MEMBERSHIP &&
        membership.state !== SUSPENDED_MEMBERSHIP
      ) {
        throw new ConflictException(
          'Membership cannot leave from its current state',
        );
      }
      membership.state = LEFT_MEMBERSHIP;
      membership.stateChangedAt = new Date();
      const saved = await memberships.save(membership);
      await writePostgresAudit(manager, {
        organizationId,
        actorUserId: userId,
        actorMembershipId: saved.id,
        actionCode: 'ORGANIZATION_MEMBERSHIP_LEFT',
        targetType: 'ORGANIZATION_MEMBERSHIP',
        targetId: saved.id,
        afterData: { state: saved.state },
      });
      return saved;
    });
  }

  private async respondToInvitation(
    userId: string,
    token: string,
    response: 'ACCEPTED' | 'REJECTED',
  ): Promise<OrganizationMembershipEntity | undefined> {
    if (!token) {
      throw new BadRequestException('Invitation token is required');
    }
    const result = await this.transactions.run(async (manager) => {
      const invitations = new PostgresOrganizationInvitationRepository(manager);
      // Discover the tenant without holding an invitation lock, then follow the
      // same Organization-first order as revoke/archive/transfer commands.
      const candidate = await invitations.findByTokenHash(hashInvitationToken(token));
      if (!candidate) throw new NotFoundException('Invitation not found');
      const organization = await new PostgresOrganizationRepository(manager).findByIdForUpdate(candidate.organizationId);
      if (!organization || organization.archivedAt) throw new NotFoundException('Organization not found');
      const users = new PostgresUserRepository(manager);
      const user = await users.findByIdForUpdate(userId);
      if (!user || user.disabledAt) {
        throw new NotFoundException('User not found');
      }
      const invitation = await invitations.findByTokenHashForUpdate(
        hashInvitationToken(token),
      );
      if (!invitation) {
        throw new NotFoundException('Invitation not found');
      }
      if (invitation.email !== user.email) {
        throw new ForbiddenException(
          'Invitation belongs to another email address',
        );
      }
      if (invitation.state === ACCEPTED_INVITATION) {
        if (invitation.acceptedUserId !== userId || response !== 'ACCEPTED') {
          throw new ConflictException('Invitation has already been accepted');
        }
        const membership = await new PostgresOrganizationMembershipRepository(
          manager,
        ).findActiveByUserAndOrganization(userId, invitation.organizationId);
        if (!membership) {
          throw new ConflictException(
            'Accepted invitation has no active membership',
          );
        }
        return membership;
      }
      if (isExpired(invitation)) {
        invitation.state = EXPIRED_INVITATION;
        invitation.respondedAt = new Date();
        await invitations.save(invitation);
        return null;
      }
      await this.requirePendingInvitation(invitations, invitation);
      if (response === 'REJECTED') {
        invitation.state = REJECTED_INVITATION;
        invitation.respondedAt = new Date();
        await invitations.save(invitation);
        await writePostgresAudit(manager, {
          organizationId: invitation.organizationId,
          actorUserId: userId,
          actionCode: 'ORGANIZATION_INVITATION_REJECTED',
          targetType: 'ORGANIZATION_INVITATION',
          targetId: invitation.id,
        });
        return undefined;
      }

      const invitationRole = await manager.getRepository(OrganizationRoleDefinitionEntity).findOneBy({ id: invitation.roleId, organizationId: invitation.organizationId });
      if (!invitationRole || invitationRole.archivedAt || invitationRole.systemCode === 'OWNER' || invitationRole.isProtected) throw new ConflictException('Invitation role is no longer active');

      const memberships = new PostgresOrganizationMembershipRepository(manager);
      let membership = await memberships.findByUserAndOrganizationForUpdate(
        userId,
        invitation.organizationId,
      );
      if (membership?.state === ACTIVE_MEMBERSHIP) {
        invitation.state = ACCEPTED_INVITATION;
        invitation.acceptedUserId = userId;
        invitation.respondedAt = new Date();
        await invitations.save(invitation);
        return membership;
      }
      if (membership) {
        membership.roleId = invitation.roleId;
        membership.state = ACTIVE_MEMBERSHIP;
        membership.stateChangedAt = new Date();
      } else {
        membership = memberships.create({
          organizationId: invitation.organizationId,
          userId,
          roleId: invitation.roleId,
          state: ACTIVE_MEMBERSHIP,
          joinedAt: new Date(),
          stateChangedAt: new Date(),
        });
      }
      const savedMembership = await memberships.save(membership);
      invitation.state = ACCEPTED_INVITATION;
      invitation.acceptedUserId = userId;
      invitation.respondedAt = new Date();
      await invitations.save(invitation);
      await writePostgresAudit(manager, {
        organizationId: invitation.organizationId,
        actorUserId: userId,
        actorMembershipId: savedMembership.id,
        actionCode: 'ORGANIZATION_INVITATION_ACCEPTED',
        targetType: 'ORGANIZATION_MEMBERSHIP',
        targetId: savedMembership.id,
        afterData: { roleId: savedMembership.roleId, state: savedMembership.state },
      });
      return savedMembership;
    });
    if (result === null) {
      throw new ConflictException('Invitation has expired');
    }
    return result;
  }

  private async setMembershipState(
    actorUserId: string,
    organizationId: string,
    targetUserId: string,
    state: typeof SUSPENDED_MEMBERSHIP | typeof REVOKED_MEMBERSHIP,
  ): Promise<OrganizationMembershipEntity> {
    return this.transactions.run(async (manager) => {
      const actor = await this.requireActiveAdministrator(
        manager,
        actorUserId,
        organizationId,
        state === SUSPENDED_MEMBERSHIP ? 'org.members.suspend' : 'org.members.revoke',
      );
      const memberships = new PostgresOrganizationMembershipRepository(manager);
      const target = await memberships.findByUserAndOrganizationForUpdate(
        targetUserId,
        organizationId,
      );
      if (!target) {
        throw new NotFoundException('Organization membership not found');
      }
      await this.assertNotActiveOwner(manager, target);
      if (
        state === SUSPENDED_MEMBERSHIP &&
        target.state !== ACTIVE_MEMBERSHIP
      ) {
        throw new ConflictException(
          'Only an active membership can be suspended',
        );
      }
      if (
        state === REVOKED_MEMBERSHIP &&
        target.state !== ACTIVE_MEMBERSHIP &&
        target.state !== SUSPENDED_MEMBERSHIP
      ) {
        throw new ConflictException(
          'Membership cannot be revoked from its current state',
        );
      }
      const previousState = target.state;
      target.state = state;
      target.stateChangedAt = new Date();
      const saved = await memberships.save(target);
      await writePostgresAudit(manager, {
        organizationId,
        actorUserId,
        actorMembershipId: actor.id,
        actionCode: `ORGANIZATION_MEMBERSHIP_${state}`,
        targetType: 'ORGANIZATION_MEMBERSHIP',
        targetId: saved.id,
        beforeData: { state: previousState, roleId: saved.roleId },
        afterData: { state: saved.state, roleId: saved.roleId },
      });
      return saved;
    });
  }

  private async requireActiveAdministrator(
    manager: EntityManager,
    actorUserId: string,
    organizationId: string,
    permissionCode: string,
  ): Promise<OrganizationMembershipEntity> {
    const organization = await new PostgresOrganizationRepository(
      manager,
    ).findByIdForUpdate(organizationId);
    if (!organization || organization.archivedAt) {
      throw new NotFoundException('Organization not found');
    }
    const memberships = new PostgresOrganizationMembershipRepository(manager);
    const actor = await memberships.findActiveByUserAndOrganizationForUpdate(
      actorUserId,
      organizationId,
    );
    if (!actor) {
      throw new ForbiddenException(
        'An active Organization Membership is required',
      );
    }
    await new PostgresOrganizationPermissionService(manager).requirePermission(actorUserId, organizationId, permissionCode);
    return actor;
  }

  private async requireActiveAdministratorForRead(
    manager: EntityManager,
    actorUserId: string,
    organizationId: string,
    permissionCode: string,
  ): Promise<OrganizationMembershipEntity> {
    const organization = await new PostgresOrganizationRepository(
      manager,
    ).findActiveById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    const actor = await new PostgresOrganizationMembershipRepository(
      manager,
    ).findActiveByUserAndOrganization(actorUserId, organizationId);
    if (!actor) {
      throw new ForbiddenException(
        'An active Organization Membership is required',
      );
    }
    await new PostgresOrganizationPermissionService(manager).requirePermission(actorUserId, organizationId, permissionCode);
    return actor;
  }

  private async requirePendingInvitation(
    invitations: PostgresOrganizationInvitationRepository,
    invitation: OrganizationInvitationEntity,
  ): Promise<void> {
    if (invitation.state !== PENDING_INVITATION) {
      throw new ConflictException('Invitation is no longer pending');
    }
    if (isExpired(invitation)) {
      invitation.state = EXPIRED_INVITATION;
      invitation.respondedAt = new Date();
      await invitations.save(invitation);
      throw new ConflictException('Invitation has expired');
    }
  }

  private async assertNotActiveOwner(manager: EntityManager, membership: OrganizationMembershipEntity): Promise<void> {
    const organization = await new PostgresOrganizationRepository(manager).findByIdForUpdate(membership.organizationId);
    if (membership.state === ACTIVE_MEMBERSHIP && organization?.ownerMembershipId === membership.id) {
      throw new ConflictException(
        'Transfer ownership before changing the active owner membership',
      );
    }
  }

  private async toInvitationSummary(manager: EntityManager, invitation: OrganizationInvitationEntity): Promise<InvitationSummary> {
    const role = await manager.getRepository(OrganizationRoleDefinitionEntity).findOneBy({ id: invitation.roleId, organizationId: invitation.organizationId });
    if (!role) throw new ConflictException('Invitation role is unavailable');
    return { id: invitation.id, organizationId: invitation.organizationId, email: invitation.email, roleId: role.id, roleName: role.name, systemCode: role.systemCode, state: invitation.state, expiresAt: invitation.expiresAt, createdAt: invitation.createdAt };
  }
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new BadRequestException('A valid invitation email is required');
  }
  return normalized;
}

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isExpired(invitation: OrganizationInvitationEntity): boolean {
  return invitation.expiresAt.getTime() <= Date.now();
}
