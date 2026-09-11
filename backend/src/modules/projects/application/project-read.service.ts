import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import { OrganizationRole } from '../../onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOrganizationMembershipRepository } from '../../onboarding/persistence/typeorm/onboarding.repositories';
import {
  ProjectEntity,
  ProjectRole,
} from '../persistence/typeorm/project.entities';
import {
  PostgresProjectMembershipRepository,
  PostgresProjectModuleSettingRepository,
  PostgresProjectRepository,
  PostgresProjectTaskStatusRepository,
  PostgresProjectTeamRepository,
} from '../persistence/typeorm/project.repositories';
import type { PostgresProjectActor } from './project.service';

@Injectable()
export class PostgresProjectReadService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  list(actor: PostgresProjectActor) {
    return this.transactions.run(async (manager) => {
      const membership = await this.requireActiveMembership(manager, actor);
      const projects = new PostgresProjectRepository(manager);
      if (
        [OrganizationRole.OWNER, OrganizationRole.ADMIN].includes(
          membership.role,
        )
      ) {
        const result = await projects.listByOrganizationForMembership(
          actor.organizationId,
          actor.membershipId,
        );
        return result.entities.map((project, index) =>
          this.projectView(
            project,
            result.raw[index]?.actorProjectRole ?? null,
            membership.role,
          ),
        );
      }
      const result = await projects.listVisibleByOrganizationMembership(
        actor.organizationId,
        actor.membershipId,
      );
      return result.entities.map((project, index) =>
        this.projectView(
          project,
          result.raw[index]?.actorProjectRole ?? null,
          membership.role,
        ),
      );
    });
  }

  get(actor: PostgresProjectActor, projectId: string) {
    return this.transactions.run(async (manager) => {
      const visible = await this.requireVisibleProject(
        manager,
        actor,
        projectId,
      );
      return this.projectView(
        visible.project,
        visible.projectRole,
        visible.organizationRole,
      );
    });
  }

  listTeams(actor: PostgresProjectActor, projectId: string) {
    return this.withVisibleProject(actor, projectId, (manager) =>
      new PostgresProjectTeamRepository(manager).listActiveForProject(
        actor.organizationId,
        projectId,
      ),
    );
  }

  listMembers(actor: PostgresProjectActor, projectId: string) {
    return this.withVisibleProject(actor, projectId, (manager) =>
      new PostgresProjectMembershipRepository(manager)
        .listActiveForProject(actor.organizationId, projectId)
        .then((rows) =>
          rows.map((row) => ({
            id: row.projectMembershipId,
            projectMembershipId: row.projectMembershipId,
            organizationMembershipId: row.organizationMembershipId,
            role: row.role,
            organizationRole: row.organizationRole,
            addedAt: row.addedAt,
            user: {
              id: row.userId,
              name: row.userName,
              email: row.userEmail,
              profileImageUrl: row.userProfileImageUrl,
            },
          })),
        ),
    );
  }

  listStatuses(actor: PostgresProjectActor, projectId: string) {
    return this.withVisibleProject(actor, projectId, async (manager) =>
      (
        await new PostgresProjectTaskStatusRepository(
          manager,
        ).listActiveForProject(actor.organizationId, projectId)
      ).map((status) => ({
        id: status.id,
        name: status.name,
        semanticCategory: status.semanticCategory,
        position: status.position,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
      })),
    );
  }

  listModules(actor: PostgresProjectActor, projectId: string) {
    return this.withVisibleProject(actor, projectId, async (manager) =>
      (
        await new PostgresProjectModuleSettingRepository(
          manager,
        ).listForProject(actor.organizationId, projectId)
      ).map((setting) => ({
        moduleCode: setting.moduleCode,
        enabled: setting.enabled,
        updatedAt: setting.updatedAt,
      })),
    );
  }

  private async withVisibleProject<T>(
    actor: PostgresProjectActor,
    projectId: string,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.transactions.run(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      return action(manager);
    });
  }

  private async requireActiveMembership(
    manager: EntityManager,
    actor: PostgresProjectActor,
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

  private async requireVisibleProject(
    manager: EntityManager,
    actor: PostgresProjectActor,
    projectId: string,
  ) {
    const project = await new PostgresProjectRepository(manager).findById(
      actor.organizationId,
      projectId,
    );
    if (!project)
      throw new NotFoundException('Project not found in active organization');
    const membership = await this.requireActiveMembership(manager, actor);
    const projectMembership = await new PostgresProjectMembershipRepository(
      manager,
    ).findActiveByProjectAndOrganizationMembershipForUpdate(
      actor.organizationId,
      projectId,
      actor.membershipId,
    );
    if (
      !projectMembership &&
      ![OrganizationRole.OWNER, OrganizationRole.ADMIN].includes(membership.role)
    )
      throw new ForbiddenException('Focused Project membership is required');
    return {
      project,
      projectRole: projectMembership?.role ?? null,
      organizationRole: membership.role,
    };
  }

  private projectView(
    project: ProjectEntity,
    projectRole: ProjectRole | null,
    organizationRole?: OrganizationRole,
  ) {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      state: project.state,
      startDate: project.startDate,
      dueDate: project.dueDate,
      completedAt: project.completedAt,
      archivedAt: project.archivedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      viewer: {
        projectRole,
        organizationRole: organizationRole ?? null,
        canManage: projectRole === ProjectRole.PROJECT_MANAGER,
      },
    };
  }
}
