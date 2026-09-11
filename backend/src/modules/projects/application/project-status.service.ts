import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import {
  ProjectRole,
  ProjectState,
  TaskStatusSemanticCategory,
  type ProjectTaskStatusEntity,
} from '../persistence/typeorm/project.entities';
import {
  PostgresProjectMembershipRepository,
  PostgresProjectRepository,
  PostgresProjectTaskStatusRepository,
} from '../persistence/typeorm/project.repositories';
import type { PostgresProjectActor } from './project.service';

export class PostgresProjectStatusService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}
  create(
    actor: PostgresProjectActor,
    projectId: string,
    name: string,
    semanticCategory: TaskStatusSemanticCategory,
  ): Promise<ProjectTaskStatusEntity> {
    return this.transactions.run(async (manager) => {
      await this.manager(manager, actor, projectId);
      const statuses = new PostgresProjectTaskStatusRepository(manager);
      const active = await statuses.listActiveForProjectForUpdate(
        actor.organizationId,
        projectId,
      );
      return statuses.save(
        statuses.create({
          organizationId: actor.organizationId,
          projectId,
          name: name.trim(),
          semanticCategory,
          position: active.length,
          archivedAt: null,
          version: '0',
        }),
      );
    });
  }
  rename(
    actor: PostgresProjectActor,
    projectId: string,
    statusId: string,
    name: string,
  ): Promise<ProjectTaskStatusEntity> {
    if (!name.trim()) throw new BadRequestException('Status name is required');
    return this.transactions.run(async (manager) => {
      await this.manager(manager, actor, projectId);
      const statuses = new PostgresProjectTaskStatusRepository(manager);
      const status = await this.status(statuses, actor, projectId, statusId);
      status.name = name.trim();
      return statuses.save(status);
    });
  }
  reorder(
    actor: PostgresProjectActor,
    projectId: string,
    statusId: string,
    position: number,
  ): Promise<ProjectTaskStatusEntity> {
    return this.transactions.run(async (manager) => {
      await this.manager(manager, actor, projectId);
      const statuses = new PostgresProjectTaskStatusRepository(manager);
      const active = await statuses.listActiveForProjectForUpdate(
        actor.organizationId,
        projectId,
      );
      const current = active.find((status) => status.id === statusId);
      if (!current)
        throw new NotFoundException('Active Project status not found');
      if (position < 0 || position >= active.length)
        throw new BadRequestException('Status position is out of range');
      const reordered = active.filter((status) => status.id !== statusId);
      reordered.splice(position, 0, current);
      const offset = active.length + 1;
      for (const [index, status] of active.entries()) {
        status.position = offset + index;
        await statuses.save(status);
      }
      for (const [index, status] of reordered.entries()) {
        status.position = index;
        await statuses.save(status);
      }
      return current;
    });
  }
  archive(
    actor: PostgresProjectActor,
    projectId: string,
    statusId: string,
  ): Promise<ProjectTaskStatusEntity> {
    return this.transactions.run(async (manager) => {
      await this.manager(manager, actor, projectId);
      const statuses = new PostgresProjectTaskStatusRepository(manager);
      const active = await statuses.listActiveForProjectForUpdate(
        actor.organizationId,
        projectId,
      );
      const status = active.find((item) => item.id === statusId);
      if (!status)
        throw new NotFoundException('Active Project status not found');
      if (
        required(status.semanticCategory) &&
        active.filter(
          (item) => item.semanticCategory === status.semanticCategory,
        ).length <= 1
      )
        throw new ConflictException(
          'Project must retain a required semantic status',
        );
      status.archivedAt = new Date();
      await statuses.save(status);
      const remaining = active.filter((item) => item.id !== statusId);
      for (const [index, item] of remaining.entries()) {
        item.position = index;
        await statuses.save(item);
      }
      return status;
    });
  }
  private async manager(
    manager: EntityManager,
    actor: PostgresProjectActor,
    projectId: string,
  ): Promise<void> {
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
  }
  private async status(
    repo: PostgresProjectTaskStatusRepository,
    actor: PostgresProjectActor,
    projectId: string,
    statusId: string,
  ) {
    const status = await repo.findActiveByIdForUpdate(
      actor.organizationId,
      projectId,
      statusId,
    );
    if (!status) throw new NotFoundException('Active Project status not found');
    return status;
  }
}
function required(category: TaskStatusSemanticCategory) {
  return (
    category === TaskStatusSemanticCategory.NOT_STARTED ||
    category === TaskStatusSemanticCategory.IN_PROGRESS ||
    category === TaskStatusSemanticCategory.COMPLETED
  );
}
