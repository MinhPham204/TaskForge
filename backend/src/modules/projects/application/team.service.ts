import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import {
  OrganizationRole,
  type TeamEntity,
  type TeamMemberEntity,
} from '../../onboarding/persistence/typeorm/onboarding.entities';
import {
  PostgresOrganizationMembershipRepository,
  PostgresOrganizationRepository,
  PostgresTeamMemberRepository,
  PostgresTeamRepository,
} from '../../onboarding/persistence/typeorm/onboarding.repositories';

export interface PostgresTeamActor {
  organizationId: string;
  membershipId: string;
}

export interface CreatePostgresTeamInput {
  name: string;
  description?: string;
  logoUrl?: string | null;
}

export interface UpdatePostgresTeamInput {
  name?: string;
  description?: string;
  logoUrl?: string | null;
}

/** Team is a role-free reusable Organization grouping. */
export class PostgresTeamService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  list(actor: PostgresTeamActor) {
    return this.transactions.run(async (manager) => {
      await this.requireActiveOrganizationMembership(manager, actor);
      return (
        await new PostgresTeamRepository(manager).listActiveByOrganization(
          actor.organizationId,
        )
      ).map((team) => this.teamView(team));
    });
  }

  get(actor: PostgresTeamActor, teamId: string) {
    return this.transactions.run(async (manager) => {
      await this.requireActiveOrganizationMembership(manager, actor);
      const team = await this.requireActiveTeam(
        new PostgresTeamRepository(manager),
        actor.organizationId,
        teamId,
      );
      const members = await new PostgresTeamMemberRepository(
        manager,
      ).listActiveForTeam(actor.organizationId, teamId);
      return {
        ...this.teamView(team),
        members: members.map((member) => ({
          organizationMembershipId: member.organizationMembershipId,
          organizationRole: member.organizationRole,
          joinedAt: member.joinedAt,
          user: {
            id: member.userId,
            name: member.userName,
            email: member.userEmail,
            profileImageUrl: member.userProfileImageUrl,
          },
        })),
      };
    });
  }

  create(actor: PostgresTeamActor, input: CreatePostgresTeamInput) {
    const name = requiredName(input.name);
    return this.transactions.run(async (manager) => {
      await this.requireActiveAdministrator(manager, actor);
      const teams = new PostgresTeamRepository(manager);
      if (await teams.findByNameForUpdate(actor.organizationId, name)) {
        throw new ConflictException(
          'Team name already exists in this organization',
        );
      }
      try {
        return await teams.save(
          teams.create({
            organizationId: actor.organizationId,
            name,
            description: input.description?.trim() ?? '',
            logoUrl: input.logoUrl ?? null,
            archivedAt: null,
          }),
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            'Team name already exists in this organization',
          );
        }
        throw error;
      }
    });
  }

  update(
    actor: PostgresTeamActor,
    teamId: string,
    input: UpdatePostgresTeamInput,
  ): Promise<TeamEntity> {
    if (
      input.name === undefined &&
      input.description === undefined &&
      input.logoUrl === undefined
    ) {
      throw new BadRequestException('At least one Team field is required');
    }
    return this.transactions.run(async (manager) => {
      await this.requireActiveAdministrator(manager, actor);
      const teams = new PostgresTeamRepository(manager);
      const team = await this.requireActiveTeam(
        teams,
        actor.organizationId,
        teamId,
      );
      if (input.name !== undefined) {
        const name = requiredName(input.name);
        const sameName = await teams.findByNameForUpdate(
          actor.organizationId,
          name,
        );
        if (sameName && sameName.id !== team.id) {
          throw new ConflictException(
            'Team name already exists in this organization',
          );
        }
        team.name = name;
      }
      if (input.description !== undefined)
        team.description = input.description.trim();
      if (input.logoUrl !== undefined) team.logoUrl = input.logoUrl;
      try {
        return await teams.save(team);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            'Team name already exists in this organization',
          );
        }
        throw error;
      }
    });
  }

  archive(actor: PostgresTeamActor, teamId: string): Promise<TeamEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireActiveAdministrator(manager, actor);
      const teams = new PostgresTeamRepository(manager);
      const team = await this.requireActiveTeam(
        teams,
        actor.organizationId,
        teamId,
      );
      team.archivedAt = new Date();
      return teams.save(team);
    });
  }

  addMember(
    actor: PostgresTeamActor,
    teamId: string,
    organizationMembershipId: string,
  ): Promise<TeamMemberEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireActiveAdministrator(manager, actor);
      const teams = new PostgresTeamRepository(manager);
      await this.requireActiveTeam(teams, actor.organizationId, teamId);
      const memberships = new PostgresOrganizationMembershipRepository(manager);
      const membership = await memberships.findActiveByIdForUpdate(
        actor.organizationId,
        organizationMembershipId,
      );
      if (!membership) {
        throw new NotFoundException('Active organization membership not found');
      }
      const teamMembers = new PostgresTeamMemberRepository(manager);
      const existing = await teamMembers.findByTeamAndMembershipForUpdate(
        actor.organizationId,
        teamId,
        organizationMembershipId,
      );
      if (existing?.removedAt === null) {
        throw new ConflictException(
          'Organization member is already in this team',
        );
      }
      if (existing) {
        existing.removedAt = null;
        existing.joinedAt = new Date();
        return teamMembers.save(existing);
      }
      return teamMembers.save(
        teamMembers.create({
          organizationId: actor.organizationId,
          teamId,
          organizationMembershipId,
          joinedAt: new Date(),
          removedAt: null,
        }),
      );
    });
  }

  removeMember(
    actor: PostgresTeamActor,
    teamId: string,
    organizationMembershipId: string,
  ): Promise<TeamMemberEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireActiveAdministrator(manager, actor);
      const teams = new PostgresTeamRepository(manager);
      await this.requireActiveTeam(teams, actor.organizationId, teamId);
      const teamMembers = new PostgresTeamMemberRepository(manager);
      const existing = await teamMembers.findByTeamAndMembershipForUpdate(
        actor.organizationId,
        teamId,
        organizationMembershipId,
      );
      if (!existing || existing.removedAt) {
        throw new NotFoundException('Active team member not found');
      }
      existing.removedAt = new Date();
      return teamMembers.save(existing);
    });
  }

  private async requireActiveAdministrator(
    manager: EntityManager,
    actor: PostgresTeamActor,
  ): Promise<void> {
    const organization = await new PostgresOrganizationRepository(
      manager,
    ).findByIdForUpdate(actor.organizationId);
    if (!organization || organization.archivedAt) {
      throw new NotFoundException('Organization not found');
    }
    const membership = await new PostgresOrganizationMembershipRepository(
      manager,
    ).findActiveByIdForUpdate(actor.organizationId, actor.membershipId);
    if (
      !membership ||
      (membership.role !== OrganizationRole.OWNER &&
        membership.role !== OrganizationRole.ADMIN)
    ) {
      throw new ForbiddenException(
        'An active organization owner or admin is required',
      );
    }
  }

  private async requireActiveOrganizationMembership(
    manager: EntityManager,
    actor: PostgresTeamActor,
  ) {
    const membership = await new PostgresOrganizationMembershipRepository(
      manager,
    ).findActiveByIdForUpdate(actor.organizationId, actor.membershipId);
    if (!membership)
      throw new ForbiddenException(
        'Active organization membership is required',
      );
    return membership;
  }

  private teamView(team: TeamEntity) {
    return {
      id: team.id,
      name: team.name,
      description: team.description,
      logoUrl: team.logoUrl,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  }

  private async requireActiveTeam(
    teams: PostgresTeamRepository,
    organizationId: string,
    teamId: string,
  ): Promise<TeamEntity> {
    const team = await teams.findActiveByIdForUpdate(organizationId, teamId);
    if (!team) throw new NotFoundException('Active team not found');
    return team;
  }
}

function requiredName(value: string): string {
  const name = value.trim();
  if (!name) throw new BadRequestException('Team name is required');
  return name;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
