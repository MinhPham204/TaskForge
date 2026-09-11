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
} from '../../onboarding/persistence/typeorm/onboarding.entities';
import {
  PostgresOrganizationMembershipRepository,
  PostgresOrganizationRepository,
  PostgresTeamMemberRepository,
  PostgresTeamRepository,
} from '../../onboarding/persistence/typeorm/onboarding.repositories';
import {
  ProjectModuleCode,
  ProjectRole,
  ProjectState,
  TaskStatusSemanticCategory,
  type ProjectEntity,
} from '../persistence/typeorm/project.entities';
import {
  PostgresProjectMembershipRepository,
  PostgresProjectModuleSettingRepository,
  PostgresProjectRepository,
  PostgresProjectTaskStatusRepository,
  PostgresProjectTeamRepository,
} from '../persistence/typeorm/project.repositories';
import { PostgresTaskDependencyRepository } from '../../task/persistence/typeorm/task.repositories';
import { writePostgresActivity } from '../../collaboration/application/activity.writer';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';

export interface PostgresProjectActor {
  organizationId: string;
  membershipId: string;
}

export interface CreatePostgresProjectInput {
  name: string;
  description?: string;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface UpdatePostgresProjectInput {
  name?: string;
  description?: string;
  startDate?: string | null;
  dueDate?: string | null;
}

const DEFAULT_STATUSES = [
  ['To Do', TaskStatusSemanticCategory.NOT_STARTED],
  ['In Progress', TaskStatusSemanticCategory.IN_PROGRESS],
  ['In Review', TaskStatusSemanticCategory.REVIEW],
  ['Done', TaskStatusSemanticCategory.COMPLETED],
] as const;

const DEFAULT_MODULE_CODES = [
  ProjectModuleCode.MILESTONES,
  ProjectModuleCode.DOCUMENTS,
  ProjectModuleCode.FILES,
  ProjectModuleCode.RISKS,
];

/** P3 project setup and lifecycle; participant changes remain P3-04/P3-05. */
export class PostgresProjectService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  create(
    actor: PostgresProjectActor,
    input: CreatePostgresProjectInput,
  ): Promise<ProjectEntity> {
    const name = requiredName(input.name);
    assertDateRange(input.startDate, input.dueDate);
    return this.transactions.run(async (manager) => {
      await this.requireActiveAdministrator(manager, actor);
      const generalTeam = await this.requireCreatorGeneralTeam(manager, actor);
      const projects = new PostgresProjectRepository(manager);
      const now = new Date();
      const project = await projects.save(
        projects.create({
          organizationId: actor.organizationId,
          name,
          description: input.description?.trim() ?? '',
          state: ProjectState.DRAFT,
          startDate: input.startDate ?? null,
          dueDate: input.dueDate ?? null,
          createdByMembershipId: actor.membershipId,
          completedAt: null,
          archivedAt: null,
          version: '0',
        }),
      );

      await new PostgresProjectTeamRepository(manager).save(
        new PostgresProjectTeamRepository(manager).create({
          organizationId: actor.organizationId,
          projectId: project.id,
          teamId: generalTeam.id,
          addedByMembershipId: actor.membershipId,
          addedAt: now,
          removedAt: null,
        }),
      );
      await new PostgresProjectMembershipRepository(manager).save(
        new PostgresProjectMembershipRepository(manager).create({
          organizationId: actor.organizationId,
          projectId: project.id,
          organizationMembershipId: actor.membershipId,
          role: ProjectRole.PROJECT_MANAGER,
          addedAt: now,
          removedAt: null,
        }),
      );

      const statuses = new PostgresProjectTaskStatusRepository(manager);
      for (const [
        position,
        [statusName, semanticCategory],
      ] of DEFAULT_STATUSES.entries()) {
        await statuses.save(
          statuses.create({
            organizationId: actor.organizationId,
            projectId: project.id,
            name: statusName,
            semanticCategory,
            position,
            archivedAt: null,
            version: '0',
          }),
        );
      }

      const settings = new PostgresProjectModuleSettingRepository(manager);
      for (const moduleCode of DEFAULT_MODULE_CODES) {
        await settings.save(
          settings.create({
            organizationId: actor.organizationId,
            projectId: project.id,
            moduleCode,
            enabled: true,
            version: '0',
          }),
        );
      }
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId: project.id, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_CREATED', subjectType: 'PROJECT', subjectId: project.id });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId: project.id, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_CREATED', targetType: 'PROJECT', targetId: project.id, afterData: { state: project.state, name: project.name } });
      return project;
    });
  }

  update(
    actor: PostgresProjectActor,
    projectId: string,
    input: UpdatePostgresProjectInput,
  ): Promise<ProjectEntity> {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException('At least one Project field is required');
    }
    assertDateRange(input.startDate, input.dueDate);
    return this.transactions.run(async (manager) => {
      const project = await this.requireProjectManager(
        manager,
        actor,
        projectId,
      );
      if (project.state === ProjectState.ARCHIVED) {
        throw new ConflictException('Archived projects are read-only');
      }
      if (input.name !== undefined) project.name = requiredName(input.name);
      if (input.description !== undefined)
        project.description = input.description.trim();
      if (input.startDate !== undefined) project.startDate = input.startDate;
      if (input.dueDate !== undefined) project.dueDate = input.dueDate;
      assertDateRange(project.startDate, project.dueDate);
      const saved = await new PostgresProjectRepository(manager).save(project);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_UPDATED', subjectType: 'PROJECT', subjectId: projectId });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'PROJECT_UPDATED', targetType: 'PROJECT', targetId: projectId, afterData: { name: saved.name, dueDate: saved.dueDate } });
      return saved;
    });
  }

  get(actor: PostgresProjectActor, projectId: string): Promise<ProjectEntity> {
    return this.transactions.run(async (manager) => {
      const project = await new PostgresProjectRepository(manager).findById(
        actor.organizationId,
        projectId,
      );
      if (!project) throw new NotFoundException('Project not found');
      const organizationMembership =
        await new PostgresOrganizationMembershipRepository(
          manager,
        ).findActiveByIdForUpdate(actor.organizationId, actor.membershipId);
      if (!organizationMembership)
        throw new ForbiddenException(
          'Active Organization membership is required',
        );
      if (
        organizationMembership.role === OrganizationRole.OWNER ||
        organizationMembership.role === OrganizationRole.ADMIN
      )
        return project;
      const projectMembership = await new PostgresProjectMembershipRepository(
        manager,
      ).findActiveByProjectAndOrganizationMembershipForUpdate(
        actor.organizationId,
        projectId,
        actor.membershipId,
      );
      if (!projectMembership)
        throw new ForbiddenException('Active Project membership is required');
      return project;
    });
  }

  transition(
    actor: PostgresProjectActor,
    projectId: string,
    command: 'activate' | 'complete' | 'reopen' | 'archive' | 'restore',
  ): Promise<ProjectEntity> {
    return this.transactions.run(async (manager) => {
      const project = await this.requireProjectManager(
        manager,
        actor,
        projectId,
      );
      const expected = transitionExpectedState(command);
      if (project.state !== expected) {
        throw new ConflictException(
          `Project cannot ${command} from ${project.state}`,
        );
      }
      const previousState = project.state;
      const now = new Date();
      switch (command) {
        case 'activate':
          project.state = ProjectState.ACTIVE;
          break;
        case 'complete':
          if (
            await new PostgresTaskDependencyRepository(
              manager,
            ).hasNonTerminalForProjectForUpdate(actor.organizationId, projectId)
          ) {
            throw new ConflictException(
              'Project cannot complete while non-terminal Tasks remain',
            );
          }
          project.state = ProjectState.COMPLETED;
          project.completedAt = now;
          break;
        case 'reopen':
          project.state = ProjectState.ACTIVE;
          project.completedAt = null;
          break;
        case 'archive':
          project.state = ProjectState.ARCHIVED;
          project.archivedAt = now;
          break;
        case 'restore':
          project.state = ProjectState.COMPLETED;
          project.archivedAt = null;
          break;
      }
      const saved = await new PostgresProjectRepository(manager).save(project);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: `PROJECT_${command.toUpperCase()}D`, subjectType: 'PROJECT', subjectId: projectId, safeMetadata: { state: saved.state } });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: `PROJECT_${command.toUpperCase()}`, targetType: 'PROJECT', targetId: projectId, beforeData: { state: previousState }, afterData: { state: saved.state } });
      return saved;
    });
  }

  private async requireActiveAdministrator(
    manager: EntityManager,
    actor: PostgresProjectActor,
  ): Promise<void> {
    const organization = await new PostgresOrganizationRepository(
      manager,
    ).findByIdForUpdate(actor.organizationId);
    if (!organization || organization.archivedAt)
      throw new NotFoundException('Organization not found');
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

  private async requireCreatorGeneralTeam(
    manager: EntityManager,
    actor: PostgresProjectActor,
  ): Promise<TeamEntity> {
    const teams = new PostgresTeamRepository(manager);
    const general = await teams.findActiveByNameForUpdate(
      actor.organizationId,
      'General',
    );
    if (!general) throw new NotFoundException('Active General team not found');
    const relation = await new PostgresTeamMemberRepository(
      manager,
    ).findActiveByTeamAndMembershipForUpdate(
      actor.organizationId,
      general.id,
      actor.membershipId,
    );
    if (!relation) {
      throw new ConflictException(
        'Creator must be an active General team member for solo Project creation',
      );
    }
    return general;
  }

  private async requireProjectManager(
    manager: EntityManager,
    actor: PostgresProjectActor,
    projectId: string,
  ): Promise<ProjectEntity> {
    const projects = new PostgresProjectRepository(manager);
    const project = await projects.findByIdForUpdate(
      actor.organizationId,
      projectId,
    );
    if (!project) throw new NotFoundException('Project not found');
    const membership = await new PostgresProjectMembershipRepository(
      manager,
    ).findActiveByProjectAndOrganizationMembershipForUpdate(
      actor.organizationId,
      projectId,
      actor.membershipId,
    );
    if (!membership || membership.role !== ProjectRole.PROJECT_MANAGER) {
      throw new ForbiddenException('An active Project Manager is required');
    }
    return project;
  }
}

function requiredName(value: string): string {
  const name = value.trim();
  if (!name) throw new BadRequestException('Project name is required');
  return name;
}

function assertDateRange(
  startDate?: string | null,
  dueDate?: string | null,
): void {
  if (startDate && dueDate && startDate > dueDate) {
    throw new BadRequestException(
      'Project due date cannot be before start date',
    );
  }
}

function transitionExpectedState(
  command: Parameters<PostgresProjectService['transition']>[2],
): ProjectState {
  switch (command) {
    case 'activate':
      return ProjectState.DRAFT;
    case 'complete':
      return ProjectState.ACTIVE;
    case 'reopen':
      return ProjectState.COMPLETED;
    case 'archive':
      return ProjectState.COMPLETED;
    case 'restore':
      return ProjectState.ARCHIVED;
  }
}
