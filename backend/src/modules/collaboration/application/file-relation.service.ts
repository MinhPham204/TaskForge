import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { withErrorCode } from '../../../common/http/coded-error';
import { assertTaskMutable } from '../../task/domain/task-policy';
import { activeTaskIdentity } from '../../task/domain/task-membership';
import { PostgresProjectRepository } from '../../projects/persistence/typeorm/project.repositories';
import { PostgresTaskRepository } from '../../task/persistence/typeorm/task.repositories';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import {
  ProjectRole,
  ProjectMembershipEntity,
  ProjectModuleCode,
  ProjectModuleSettingEntity,
} from '../../projects/persistence/typeorm/project.entities';
import {
  ProjectFileEntity,
  StoredFileEntity,
  TaskAttachmentEntity,
} from '../persistence/typeorm/collaboration.entities';
import {
  PostgresProjectFileRepository,
  PostgresTaskAttachmentRepository,
} from '../persistence/typeorm/collaboration.repositories';

export interface PostgresFileRelationActor {
  organizationId: string;
  membershipId: string;
}

/** P5-07 relation policy. Task attachments never depend on the Project Files module. */
export class PostgresFileRelationService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  preflightTask(
    actor: PostgresFileRelationActor,
    projectId: string,
    taskId: string,
  ): Promise<void> {
    return this.transactions.run(async (manager) => {
      await this.taskUploadAccess(manager, actor, projectId, taskId);
    });
  }

  preflightProject(
    actor: PostgresFileRelationActor,
    projectId: string,
  ): Promise<void> {
    return this.transactions.run(async (manager) => {
      await this.projectUploadAccess(manager, actor, projectId);
    });
  }

  private async taskUploadAccess(
    manager: EntityManager,
    actor: PostgresFileRelationActor,
    projectId: string,
    taskId: string,
  ) {
    const membership = await requireProjectMembership(
      manager,
      actor,
      projectId,
    );
    await requireTask(manager, actor.organizationId, projectId, taskId, true);
    return membership;
  }

  private async projectUploadAccess(
    manager: EntityManager,
    actor: PostgresFileRelationActor,
    projectId: string,
  ) {
    const membership = await requireProjectMembership(
      manager,
      actor,
      projectId,
    );
    const project = await new PostgresProjectRepository(
      manager,
    ).findByIdForUpdate(actor.organizationId, projectId);
    if (!project)
      throw withErrorCode(
        new NotFoundException('Project not found'),
        'RESOURCE_NOT_FOUND',
      );
    assertTaskMutable(project.state, null);
    if (membership.role !== ProjectRole.PROJECT_MANAGER)
      throw withErrorCode(
        new ForbiddenException('An active Project Manager is required'),
        'PROJECT_MANAGER_REQUIRED',
      );
    const setting = await manager
      .getRepository(ProjectModuleSettingEntity)
      .findOneBy({
        organizationId: actor.organizationId,
        projectId,
        moduleCode: ProjectModuleCode.FILES,
      });
    if (!setting?.enabled)
      throw withErrorCode(
        new ConflictException('Project Files module is disabled'),
        'PROJECT_MODULE_DISABLED',
      );
    return membership;
  }

  attachToTask(
    actor: PostgresFileRelationActor,
    projectId: string,
    taskId: string,
    storedFileId: string,
  ): Promise<TaskAttachmentEntity> {
    return this.transactions.run((manager) =>
      this.attachToTaskInTransaction(
        manager,
        actor,
        projectId,
        taskId,
        storedFileId,
      ),
    );
  }

  async attachToTaskInTransaction(
    manager: EntityManager,
    actor: PostgresFileRelationActor,
    projectId: string,
    taskId: string,
    storedFileId: string,
  ): Promise<TaskAttachmentEntity> {
    const membership = await this.taskUploadAccess(
      manager,
      actor,
      projectId,
      taskId,
    );
    await requireStoredFile(manager, actor.organizationId, storedFileId);
    const repository = new PostgresTaskAttachmentRepository(manager);
    const existing = await manager
      .getRepository(TaskAttachmentEntity)
      .findOneBy({
        organizationId: actor.organizationId,
        projectId,
        taskId,
        storedFileId,
        removedAt: IsNull(),
      });
    if (existing)
      throw new ConflictException('File is already attached to this task');
    return repository.save(
      repository.create({
        organizationId: actor.organizationId,
        projectId,
        taskId,
        storedFileId,
        attachedByProjectMembershipId: membership.id,
        removedAt: null,
      }),
    );
  }

  addToProject(
    actor: PostgresFileRelationActor,
    projectId: string,
    storedFileId: string,
    displayName?: string | null,
  ): Promise<ProjectFileEntity> {
    return this.transactions.run((manager) =>
      this.addToProjectInTransaction(
        manager,
        actor,
        projectId,
        storedFileId,
        displayName,
      ),
    );
  }

  async addToProjectInTransaction(
    manager: EntityManager,
    actor: PostgresFileRelationActor,
    projectId: string,
    storedFileId: string,
    displayName?: string | null,
  ): Promise<ProjectFileEntity> {
    const membership = await this.projectUploadAccess(
      manager,
      actor,
      projectId,
    );
    await requireStoredFile(manager, actor.organizationId, storedFileId);
    const repository = new PostgresProjectFileRepository(manager);
    const existing = await manager.getRepository(ProjectFileEntity).findOneBy({
      organizationId: actor.organizationId,
      projectId,
      storedFileId,
      removedAt: IsNull(),
    });
    if (existing)
      throw new ConflictException('File is already in this project');
    return repository.save(
      repository.create({
        organizationId: actor.organizationId,
        projectId,
        storedFileId,
        addedByProjectMembershipId: membership.id,
        displayName: displayName?.trim() || null,
        removedAt: null,
      }),
    );
  }

  unlinkTask(
    actor: PostgresFileRelationActor,
    projectId: string,
    taskId: string,
    attachmentId: string,
  ): Promise<TaskAttachmentEntity> {
    return this.transactions.run(async (manager) => {
      await requireProjectMembership(manager, actor, projectId);
      await requireTask(manager, actor.organizationId, projectId, taskId);
      const attachment = await manager
        .getRepository(TaskAttachmentEntity)
        .findOneBy({
          id: attachmentId,
          organizationId: actor.organizationId,
          projectId,
          taskId,
        });
      if (!attachment) throw new NotFoundException('Task attachment not found');
      if (!attachment.removedAt) {
        attachment.removedAt = new Date();
        await manager.getRepository(TaskAttachmentEntity).save(attachment);
      }
      return attachment;
    });
  }

  removeFromProject(
    actor: PostgresFileRelationActor,
    projectId: string,
    projectFileId: string,
  ): Promise<ProjectFileEntity> {
    return this.transactions.run(async (manager) => {
      const membership = await requireProjectMembership(
        manager,
        actor,
        projectId,
      );
      if (membership.role !== ProjectRole.PROJECT_MANAGER)
        throw new ForbiddenException('An active Project Manager is required');
      const project = await new PostgresProjectRepository(
        manager,
      ).findByIdForUpdate(actor.organizationId, projectId);
      if (!project) throw new NotFoundException('Project not found');
      assertTaskMutable(project.state, null);
      const projectFile = await manager
        .getRepository(ProjectFileEntity)
        .findOneBy({
          id: projectFileId,
          organizationId: actor.organizationId,
          projectId,
        });
      if (!projectFile) throw new NotFoundException('Project file not found');
      if (!projectFile.removedAt) {
        projectFile.removedAt = new Date();
        await manager.getRepository(ProjectFileEntity).save(projectFile);
      }
      return projectFile;
    });
  }
}

async function requireProjectMembership(
  manager: EntityManager,
  actor: PostgresFileRelationActor,
  projectId: string,
): Promise<ProjectMembershipEntity> {
  if (
    !(await activeTaskIdentity(
      manager,
      actor.organizationId,
      actor.membershipId,
      true,
    ))
  ) {
    throw withErrorCode(
      new ForbiddenException('Active organization membership is required'),
      'TENANT_MEMBERSHIP_REQUIRED',
    );
  }
  const membership = await manager
    .getRepository(ProjectMembershipEntity)
    .findOne({
      where: {
        organizationId: actor.organizationId,
        projectId,
        organizationMembershipId: actor.membershipId,
        removedAt: IsNull(),
      },
      lock: { mode: 'pessimistic_read' },
    });
  if (!membership)
    throw withErrorCode(
      new ForbiddenException('Active project membership is required'),
      'PROJECT_MEMBERSHIP_REQUIRED',
    );
  return membership;
}
async function requireTask(
  manager: EntityManager,
  organizationId: string,
  projectId: string,
  taskId: string,
  hideArchived = false,
): Promise<void> {
  const project = await new PostgresProjectRepository(
    manager,
  ).findByIdForUpdate(organizationId, projectId);
  if (!project)
    throw withErrorCode(
      new NotFoundException('Project not found'),
      'RESOURCE_NOT_FOUND',
    );
  const task = await new PostgresTaskRepository(manager).findByIdForUpdate(
    organizationId,
    projectId,
    taskId,
  );
  if (!task || (hideArchived && task.archivedAt))
    throw withErrorCode(
      new NotFoundException('Task not found'),
      'RESOURCE_NOT_FOUND',
    );
  assertTaskMutable(project.state, task.archivedAt);
}
async function requireStoredFile(
  manager: EntityManager,
  organizationId: string,
  storedFileId: string,
): Promise<void> {
  const file = await manager.getRepository(StoredFileEntity).findOne({
    where: { id: storedFileId, organizationId, deletedAt: IsNull() },
    lock: { mode: 'pessimistic_read' },
  });
  if (!file) throw new NotFoundException('Stored file not found');
}
