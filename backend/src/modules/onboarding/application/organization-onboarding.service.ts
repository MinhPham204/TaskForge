import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import {
  OrganizationMembershipState,
  OrganizationRole,
} from '../persistence/typeorm/onboarding.entities';
import {
  PostgresOrganizationMembershipRepository,
  PostgresOrganizationRepository,
  PostgresTeamMemberRepository,
  PostgresTeamRepository,
  PostgresUserRepository,
} from '../persistence/typeorm/onboarding.repositories';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';

export interface CreatePostgresOrganizationInput {
  name: string;
  logoUrl?: string | null;
}

export interface CreatedPostgresOrganization {
  organizationId: string;
  membershipId: string;
  generalTeamId: string;
}

/**
 * Owns the multi-row onboarding invariant. The caller supplies an authenticated
 * global User ID; no client-provided Organization ID or role is accepted.
 */
export class PostgresOrganizationOnboardingService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  createOrganization(
    userId: string,
    input: CreatePostgresOrganizationInput,
  ): Promise<CreatedPostgresOrganization> {
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException('Organization name is required');
    }

    return this.transactions.run(async (manager) =>
      this.createInTransaction(manager, userId, { ...input, name }),
    );
  }

  private async createInTransaction(
    manager: EntityManager,
    userId: string,
    input: CreatePostgresOrganizationInput,
  ): Promise<CreatedPostgresOrganization> {
    const users = new PostgresUserRepository(manager);
    const organizations = new PostgresOrganizationRepository(manager);
    const memberships = new PostgresOrganizationMembershipRepository(manager);
    const teams = new PostgresTeamRepository(manager);
    const teamMembers = new PostgresTeamMemberRepository(manager);

    const user = await users.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.disabledAt) {
      throw new ForbiddenException(
        'Disabled users cannot create an organization',
      );
    }

    const now = new Date();
    const organization = await organizations.save(
      organizations.create({
        name: input.name,
        logoUrl: input.logoUrl ?? null,
      }),
    );
    const membership = await memberships.save(
      memberships.create({
        organizationId: organization.id,
        userId: user.id,
        role: OrganizationRole.OWNER,
        state: OrganizationMembershipState.ACTIVE,
        joinedAt: now,
        stateChangedAt: now,
      }),
    );
    const generalTeam = await teams.save(
      teams.create({
        organizationId: organization.id,
        name: 'General',
        description: '',
        logoUrl: null,
      }),
    );
    await teamMembers.save(
      teamMembers.create({
        organizationId: organization.id,
        teamId: generalTeam.id,
        organizationMembershipId: membership.id,
        joinedAt: now,
        removedAt: null,
      }),
    );
    await writePostgresAudit(manager, {
      organizationId: organization.id,
      actorUserId: user.id,
      actorMembershipId: membership.id,
      actionCode: 'ORGANIZATION_CREATED',
      targetType: 'ORGANIZATION',
      targetId: organization.id,
      afterData: { name: organization.name, ownerRole: membership.role },
    });

    return {
      organizationId: organization.id,
      membershipId: membership.id,
      generalTeamId: generalTeam.id,
    };
  }
}
