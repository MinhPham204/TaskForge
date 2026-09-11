import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import type {
  InvitationState,
  OrganizationInvitationEntity,
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
} from '../persistence/typeorm/onboarding.entities';
import {
  PostgresOrganizationInvitationRepository,
  PostgresOrganizationMembershipRepository,
  PostgresOrganizationRepository,
  PostgresUserRepository,
} from '../persistence/typeorm/onboarding.repositories';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';

const OWNER_ROLE = 'OWNER' as OrganizationRole;
const ADMIN_ROLE = 'ADMIN' as OrganizationRole;
const MEMBER_ROLE = 'MEMBER' as OrganizationRole;
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
  role?: OrganizationRole.ADMIN | OrganizationRole.MEMBER;
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
  role: OrganizationRole;
  state: InvitationState;
  expiresAt: Date;
  createdAt: Date;
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
    const role = input.role ?? MEMBER_ROLE;
    if (role !== ADMIN_ROLE && role !== MEMBER_ROLE) {
      throw new BadRequestException('Invitation role must be ADMIN or MEMBER');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashInvitationToken(token);
    const invitation = await this.transactions.run(async (manager) => {
      const memberships = new PostgresOrganizationMembershipRepository(manager);
      const actor = await this.requireActiveAdministrator(
        manager,
        actorUserId,
        organizationId,
      );
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
          invitedRole: role,
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
        afterData: { email: created.email, role: created.invitedRole, expiresAt: created.expiresAt.toISOString() },
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
    );
    const invitations = await new PostgresOrganizationInvitationRepository(
      this.manager,
    ).listPendingByOrganization(organizationId);
    return invitations
      .filter((invitation) => !isExpired(invitation))
      .map(toSummary);
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
    return invitations
      .filter((invitation) => !isExpired(invitation))
      .map(toSummary);
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
      const memberships = new PostgresOrganizationMembershipRepository(manager);
      const membership = await memberships.findByUserAndOrganizationForUpdate(
        userId,
        organizationId,
      );
      if (!membership) {
        throw new NotFoundException('Organization membership not found');
      }
      this.assertNotActiveOwner(membership);
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
    return this.transactions.run(async (manager) => {
      const users = new PostgresUserRepository(manager);
      const user = await users.findByIdForUpdate(userId);
      if (!user || user.disabledAt) {
        throw new NotFoundException('User not found');
      }
      const invitations = new PostgresOrganizationInvitationRepository(manager);
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

      const organization = await new PostgresOrganizationRepository(
        manager,
      ).findByIdForUpdate(invitation.organizationId);
      if (!organization || organization.archivedAt) {
        throw new NotFoundException('Organization not found');
      }
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
        membership.role = invitation.invitedRole;
        membership.state = ACTIVE_MEMBERSHIP;
        membership.stateChangedAt = new Date();
      } else {
        membership = memberships.create({
          organizationId: invitation.organizationId,
          userId,
          role: invitation.invitedRole,
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
        afterData: { role: savedMembership.role, state: savedMembership.state },
      });
      return savedMembership;
    });
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
      );
      const memberships = new PostgresOrganizationMembershipRepository(manager);
      const target = await memberships.findByUserAndOrganizationForUpdate(
        targetUserId,
        organizationId,
      );
      if (!target) {
        throw new NotFoundException('Organization membership not found');
      }
      this.assertNotActiveOwner(target);
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
        beforeData: { state: previousState, role: saved.role },
        afterData: { state: saved.state, role: saved.role },
      });
      return saved;
    });
  }

  private async requireActiveAdministrator(
    manager: EntityManager,
    actorUserId: string,
    organizationId: string,
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
    if (!actor || (actor.role !== OWNER_ROLE && actor.role !== ADMIN_ROLE)) {
      throw new ForbiddenException(
        'An active organization owner or admin is required',
      );
    }
    return actor;
  }

  private async requireActiveAdministratorForRead(
    manager: EntityManager,
    actorUserId: string,
    organizationId: string,
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
    if (!actor || (actor.role !== OWNER_ROLE && actor.role !== ADMIN_ROLE)) {
      throw new ForbiddenException(
        'An active organization owner or admin is required',
      );
    }
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

  private assertNotActiveOwner(membership: OrganizationMembershipEntity): void {
    if (
      membership.role === OWNER_ROLE &&
      membership.state === ACTIVE_MEMBERSHIP
    ) {
      throw new ConflictException(
        'Transfer ownership before changing the active owner membership',
      );
    }
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

function toSummary(
  invitation: OrganizationInvitationEntity,
): InvitationSummary {
  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    email: invitation.email,
    role: invitation.invitedRole,
    state: invitation.state,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}
