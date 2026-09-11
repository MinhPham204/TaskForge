import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import { ProjectMembershipEntity, ProjectModuleCode, ProjectModuleSettingEntity } from '../../projects/persistence/typeorm/project.entities';
import { TaskEntity } from '../../task/persistence/typeorm/task.entities';
import { ProjectFileEntity, StoredFileEntity, TaskAttachmentEntity } from '../persistence/typeorm/collaboration.entities';
import { PostgresProjectFileRepository, PostgresTaskAttachmentRepository } from '../persistence/typeorm/collaboration.repositories';

export interface PostgresFileRelationActor { organizationId: string; membershipId: string; }

/** P5-07 relation policy. Task attachments never depend on the Project Files module. */
export class PostgresFileRelationService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  attachToTask(actor: PostgresFileRelationActor, projectId: string, taskId: string, storedFileId: string): Promise<TaskAttachmentEntity> {
    return this.transactions.run(async (manager) => {
      const membership = await requireProjectMembership(manager, actor, projectId);
      await requireTask(manager, actor.organizationId, projectId, taskId);
      await requireStoredFile(manager, actor.organizationId, storedFileId);
      const repository = new PostgresTaskAttachmentRepository(manager);
      const existing = await manager.getRepository(TaskAttachmentEntity).findOneBy({ organizationId: actor.organizationId, projectId, taskId, storedFileId, removedAt: IsNull() });
      if (existing) throw new ConflictException('File is already attached to this task');
      return repository.save(repository.create({ organizationId: actor.organizationId, projectId, taskId, storedFileId, attachedByProjectMembershipId: membership.id, removedAt: null }));
    });
  }

  addToProject(actor: PostgresFileRelationActor, projectId: string, storedFileId: string, displayName?: string | null): Promise<ProjectFileEntity> {
    return this.transactions.run(async (manager) => {
      const membership = await requireProjectMembership(manager, actor, projectId);
      if (membership.role !== 'PROJECT_MANAGER') throw new ForbiddenException('An active Project Manager is required');
      const setting = await manager.getRepository(ProjectModuleSettingEntity).findOneBy({ organizationId: actor.organizationId, projectId, moduleCode: ProjectModuleCode.FILES });
      if (!setting?.enabled) throw new ConflictException('Project Files module is disabled');
      await requireStoredFile(manager, actor.organizationId, storedFileId);
      const repository = new PostgresProjectFileRepository(manager);
      const existing = await manager.getRepository(ProjectFileEntity).findOneBy({ organizationId: actor.organizationId, projectId, storedFileId, removedAt: IsNull() });
      if (existing) throw new ConflictException('File is already in this project');
      return repository.save(repository.create({ organizationId: actor.organizationId, projectId, storedFileId, addedByProjectMembershipId: membership.id, displayName: displayName?.trim() || null, removedAt: null }));
    });
  }

  unlinkTask(actor: PostgresFileRelationActor, projectId: string, taskId: string, attachmentId: string): Promise<TaskAttachmentEntity> {
    return this.transactions.run(async (manager) => {
      await requireProjectMembership(manager, actor, projectId);
      const attachment = await manager.getRepository(TaskAttachmentEntity).findOneBy({ id: attachmentId, organizationId: actor.organizationId, projectId, taskId });
      if (!attachment) throw new NotFoundException('Task attachment not found');
      if (!attachment.removedAt) {
        attachment.removedAt = new Date();
        await manager.getRepository(TaskAttachmentEntity).save(attachment);
      }
      return attachment;
    });
  }

  removeFromProject(actor: PostgresFileRelationActor, projectId: string, projectFileId: string): Promise<ProjectFileEntity> {
    return this.transactions.run(async (manager) => {
      const membership = await requireProjectMembership(manager, actor, projectId);
      if (membership.role !== 'PROJECT_MANAGER') throw new ForbiddenException('An active Project Manager is required');
      const projectFile = await manager.getRepository(ProjectFileEntity).findOneBy({ id: projectFileId, organizationId: actor.organizationId, projectId });
      if (!projectFile) throw new NotFoundException('Project file not found');
      if (!projectFile.removedAt) {
        projectFile.removedAt = new Date();
        await manager.getRepository(ProjectFileEntity).save(projectFile);
      }
      return projectFile;
    });
  }
}

async function requireProjectMembership(manager: EntityManager, actor: PostgresFileRelationActor, projectId: string): Promise<ProjectMembershipEntity> {
  const membership = await manager.getRepository(ProjectMembershipEntity).findOneBy({ organizationId: actor.organizationId, projectId, organizationMembershipId: actor.membershipId, removedAt: IsNull() });
  if (!membership) throw new ForbiddenException('Active project membership is required');
  return membership;
}
async function requireTask(manager: EntityManager, organizationId: string, projectId: string, taskId: string): Promise<void> {
  const task = await manager.getRepository(TaskEntity).findOneBy({ id: taskId, organizationId, projectId, archivedAt: IsNull() });
  if (!task) throw new NotFoundException('Task not found');
}
async function requireStoredFile(manager: EntityManager, organizationId: string, storedFileId: string): Promise<void> {
  const file = await manager.getRepository(StoredFileEntity).findOneBy({ id: storedFileId, organizationId, deletedAt: IsNull() });
  if (!file) throw new NotFoundException('Stored file not found');
}
