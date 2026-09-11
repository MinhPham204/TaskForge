import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import {
  PostgresOrganizationMembershipRepository,
  PostgresTeamRepository,
} from '../../onboarding/persistence/typeorm/onboarding.repositories';
import {
  ProjectRole,
  ProjectState,
  type ProjectMembershipEntity,
  type ProjectTeamEntity,
} from '../persistence/typeorm/project.entities';
import {
  PostgresProjectMembershipRepository,
  PostgresProjectRepository,
  PostgresProjectTeamRepository,
} from '../persistence/typeorm/project.repositories';
import type { PostgresProjectActor } from './project.service';
import { PostgresTaskDependencyRepository } from '../../task/persistence/typeorm/task.repositories';
import { writePostgresActivity } from '../../collaboration/application/activity.writer';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';

/** Participant commands enforce qualification and active-Project lower bounds. */
export class PostgresProjectParticipantService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  addTeam(
    actor: PostgresProjectActor,
    projectId: string,
    teamId: string,
  ): Promise<ProjectTeamEntity> {
    return this.transactions.run(async (manager) => {
      const project = await this.requireMutableProjectManager(
        manager,
        actor,
        projectId,
      );
      const team = await new PostgresTeamRepository(
        manager,
      ).findActiveByIdForUpdate(actor.organizationId, teamId);
      if (!team) throw new NotFoundException('Active Team not found');
      const relations = new PostgresProjectTeamRepository(manager);
      const existing = await relations.findByProjectAndTeamForUpdate(
        actor.organizationId,
        project.id,
        team.id,
      );
      if (existing?.removedAt === null)
        throw new ConflictException(
          'Team is already participating in this Project',
        );
      if (existing) {
        existing.removedAt = null;
        existing.addedAt = new Date();
        existing.addedByMembershipId = actor.membershipId;
        const saved = await relations.save(existing);
        await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_TEAM_ADDED', subjectType: 'TEAM', subjectId: teamId });
        await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_TEAM_ADDED', targetType: 'TEAM', targetId: teamId });
        return saved;
      }
      const saved = await relations.save(
        relations.create({
          organizationId: actor.organizationId,
          projectId: project.id,
          teamId: team.id,
          addedByMembershipId: actor.membershipId,
          addedAt: new Date(),
          removedAt: null,
        }),
      );
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_TEAM_ADDED', subjectType: 'TEAM', subjectId: teamId });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_TEAM_ADDED', targetType: 'TEAM', targetId: teamId });
      return saved;
    });
  }

  removeTeam(
    actor: PostgresProjectActor,
    projectId: string,
    teamId: string,
  ): Promise<ProjectTeamEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireMutableProjectManager(manager, actor, projectId);
      const relations = new PostgresProjectTeamRepository(manager);
      const existing = await relations.findByProjectAndTeamForUpdate(
        actor.organizationId,
        projectId,
        teamId,
      );
      if (!existing || existing.removedAt)
        throw new NotFoundException('Active participating Team not found');
      if (
        (await relations.countActiveForProjectForUpdate(
          actor.organizationId,
          projectId,
        )) <= 1
      ) {
        throw new ConflictException(
          'Project must retain at least one Participating Team',
        );
      }
      if (
        await new PostgresTaskDependencyRepository(
          manager,
        ).hasActiveOwningTeamForUpdate(
          actor.organizationId,
          projectId,
          teamId,
        )
      ) {
        throw new ConflictException(
          'Remove or archive active Tasks owned by this Team before removing it from the Project',
        );
      }
      const members = await new PostgresProjectMembershipRepository(
        manager,
      ).listActiveForProjectForUpdate(actor.organizationId, projectId);
      for (const member of members) {
        if (
          !(await relations.hasQualifyingTeamForMembership(
            actor.organizationId,
            projectId,
            member.organizationMembershipId,
            teamId,
          ))
        ) {
          throw new ConflictException(
            'Removing this Team would leave a Project Member without a Participating Team',
          );
        }
      }
      existing.removedAt = new Date();
      const saved = await relations.save(existing);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_TEAM_REMOVED', subjectType: 'TEAM', subjectId: teamId });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_TEAM_REMOVED', targetType: 'TEAM', targetId: teamId });
      return saved;
    });
  }

  addMember(
    actor: PostgresProjectActor,
    projectId: string,
    organizationMembershipId: string,
    role: ProjectRole,
  ): Promise<ProjectMembershipEntity> {
    return this.transactions.run(async (manager) => {
      const project = await this.requireMutableProjectManager(
        manager,
        actor,
        projectId,
      );
      const target = await new PostgresOrganizationMembershipRepository(
        manager,
      ).findActiveByIdForUpdate(actor.organizationId, organizationMembershipId);
      if (!target)
        throw new NotFoundException('Active Organization membership not found');
      const teams = new PostgresProjectTeamRepository(manager);
      if (
        !(await teams.hasQualifyingTeamForMembership(
          actor.organizationId,
          project.id,
          target.id,
        ))
      ) {
        throw new ConflictException(
          'Organization member must belong to an active Participating Team',
        );
      }
      const relations = new PostgresProjectMembershipRepository(manager);
      const existing =
        await relations.findByProjectAndOrganizationMembershipForUpdate(
          actor.organizationId,
          project.id,
          target.id,
        );
      if (existing?.removedAt === null)
        throw new ConflictException(
          'Organization member is already in this Project',
        );
      if (existing) {
        existing.role = role;
        existing.removedAt = null;
        existing.addedAt = new Date();
        const saved = await relations.save(existing);
        await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_MEMBER_ADDED', subjectType: 'ORGANIZATION_MEMBERSHIP', subjectId: target.id, safeMetadata: { role } });
        await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_MEMBER_ADDED', targetType: 'ORGANIZATION_MEMBERSHIP', targetId: target.id, afterData: { role } });
        return saved;
      }
      const saved = await relations.save(
        relations.create({
          organizationId: actor.organizationId,
          projectId: project.id,
          organizationMembershipId: target.id,
          role,
          addedAt: new Date(),
          removedAt: null,
        }),
      );
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_MEMBER_ADDED', subjectType: 'ORGANIZATION_MEMBERSHIP', subjectId: target.id, safeMetadata: { role } });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_MEMBER_ADDED', targetType: 'ORGANIZATION_MEMBERSHIP', targetId: target.id, afterData: { role } });
      return saved;
    });
  }

  removeMember(
    actor: PostgresProjectActor,
    projectId: string,
    organizationMembershipId: string,
  ): Promise<ProjectMembershipEntity> {
    return this.transactions.run(async (manager) => {
      const project = await this.requireMutableProjectManager(
        manager,
        actor,
        projectId,
      );
      const relations = new PostgresProjectMembershipRepository(manager);
      const existing =
        await relations.findByProjectAndOrganizationMembershipForUpdate(
          actor.organizationId,
          projectId,
          organizationMembershipId,
        );
      if (!existing || existing.removedAt)
        throw new NotFoundException('Active Project member not found');
      if (
        await new PostgresTaskDependencyRepository(
          manager,
        ).hasActiveAssignmentForProjectMembershipForUpdate(
          actor.organizationId,
          projectId,
          existing.id,
        )
      ) {
        throw new ConflictException(
          'Unassign or reassign this member from active Tasks before removing them from the Project',
        );
      }
      if (
        project.state === ProjectState.ACTIVE &&
        existing.role === ProjectRole.PROJECT_MANAGER
      ) {
        const activeMembers = await relations.listActiveForProjectForUpdate(
          actor.organizationId,
          projectId,
        );
        const projectManagerCount = activeMembers.filter(
          (member) => member.role === ProjectRole.PROJECT_MANAGER,
        ).length;
        if (projectManagerCount <= 1) {
          throw new ConflictException(
            'Active Project must retain at least one Project Manager',
          );
        }
      }
      existing.removedAt = new Date();
      const saved = await relations.save(existing);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_MEMBER_REMOVED', subjectType: 'ORGANIZATION_MEMBERSHIP', subjectId: organizationMembershipId });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_MEMBER_REMOVED', targetType: 'ORGANIZATION_MEMBERSHIP', targetId: organizationMembershipId });
      return saved;
    });
  }

  private async requireMutableProjectManager(
    manager: EntityManager,
    actor: PostgresProjectActor,
    projectId: string,
  ) {
    const project = await new PostgresProjectRepository(
      manager,
    ).findByIdForUpdate(actor.organizationId, projectId);
    if (!project) throw new NotFoundException('Project not found');
    if (project.state === ProjectState.ARCHIVED)
      throw new ConflictException('Archived projects are read-only');
    const membership = await new PostgresProjectMembershipRepository(
      manager,
    ).findActiveByProjectAndOrganizationMembershipForUpdate(
      actor.organizationId,
      projectId,
      actor.membershipId,
    );
    if (!membership || membership.role !== ProjectRole.PROJECT_MANAGER)
      throw new ForbiddenException('An active Project Manager is required');
    return project;
  }
}
