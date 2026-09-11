import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
  UserEntity,
} from '../../onboarding/persistence/typeorm/onboarding.entities';
import {
  ProjectEntity,
  ProjectMembershipEntity,
  ProjectRole,
} from '../../projects/persistence/typeorm/project.entities';
import { TaskEntity } from '../../task/persistence/typeorm/task.entities';
import {
  ActivityEntryEntity,
  ProjectFileEntity,
  StoredFileEntity,
  TaskAttachmentEntity,
} from '../persistence/typeorm/collaboration.entities';
import {
  PostgresFileStorageService,
  type DownloadPostgresFile,
  type PostgresFileActor,
  type UploadPostgresFileInput,
} from './file-storage';
import { PostgresFileRelationService } from './file-relation.service';

export interface ActivityViewRow {
  id: string;
  projectId: string | null;
  actionCode: string;
  subjectType: string;
  subjectId: string | null;
  safeMetadata: Record<string, unknown>;
  occurredAt: Date;
  actorName: string | null;
  actorEmail: string | null;
}

export interface ProjectFileViewRow {
  id: string;
  projectId: string;
  storedFileId: string;
  displayName: string | null;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: Date;
  uploaderName: string | null;
}

export interface TaskAttachmentViewRow {
  id: string;
  projectId: string;
  taskId: string;
  storedFileId: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: Date;
  uploaderName: string | null;
}

@Injectable()
export class PostgresCollaborationService {
  constructor(
    private readonly transactions: PostgresTransactionRunner,
    private readonly storage: PostgresFileStorageService,
    private readonly relations: PostgresFileRelationService,
  ) {}

  /** List project activity timeline - safe metadata only */
  listActivities(
    actor: PostgresFileActor,
    projectId: string,
  ): Promise<ActivityViewRow[]> {
    return this.transactions.run(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      const rows = await manager
        .createQueryBuilder(ActivityEntryEntity, 'a')
        .leftJoin(
          OrganizationMembershipEntity,
          'om',
          'om.id = a.actor_membership_id AND om.organization_id = a.organization_id',
        )
        .leftJoin(UserEntity, 'u', 'u.id = om.user_id')
        .where('a.organization_id = :orgId', { orgId: actor.organizationId })
        .andWhere('a.project_id = :projectId', { projectId })
        .orderBy('a.occurred_at', 'DESC')
        .limit(100)
        .select([
          'a.id AS "id"',
          'a.project_id AS "projectId"',
          'a.action_code AS "actionCode"',
          'a.subject_type AS "subjectType"',
          'a.subject_id AS "subjectId"',
          'a.safe_metadata AS "safeMetadata"',
          'a.occurred_at AS "occurredAt"',
          'u.name AS "actorName"',
          'u.email AS "actorEmail"',
        ])
        .getRawMany();

      return rows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        actionCode: r.actionCode,
        subjectType: r.subjectType,
        subjectId: r.subjectId,
        safeMetadata: (r.safeMetadata as Record<string, unknown>) || {},
        occurredAt: new Date(r.occurredAt),
        actorName: r.actorName || null,
        actorEmail: r.actorEmail || null,
      }));
    });
  }

  /** List active project files */
  listProjectFiles(
    actor: PostgresFileActor,
    projectId: string,
  ): Promise<ProjectFileViewRow[]> {
    return this.transactions.run(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      const rows = await manager
        .createQueryBuilder(ProjectFileEntity, 'pf')
        .innerJoin(
          StoredFileEntity,
          'sf',
          'sf.id = pf.stored_file_id AND sf.organization_id = pf.organization_id',
        )
        .leftJoin(
          ProjectMembershipEntity,
          'pm',
          'pm.id = pf.added_by_project_membership_id AND pm.organization_id = pf.organization_id',
        )
        .leftJoin(
          OrganizationMembershipEntity,
          'om',
          'om.id = pm.organization_membership_id AND om.organization_id = pf.organization_id',
        )
        .leftJoin(UserEntity, 'u', 'u.id = om.user_id')
        .where('pf.organization_id = :orgId', { orgId: actor.organizationId })
        .andWhere('pf.project_id = :projectId', { projectId })
        .andWhere('pf.removed_at IS NULL')
        .andWhere('sf.deleted_at IS NULL')
        .orderBy('pf.created_at', 'DESC')
        .select([
          'pf.id AS "id"',
          'pf.project_id AS "projectId"',
          'pf.stored_file_id AS "storedFileId"',
          'pf.display_name AS "displayName"',
          'pf.created_at AS "createdAt"',
          'sf.original_name AS "originalName"',
          'sf.media_type AS "mediaType"',
          'sf.size_bytes AS "sizeBytes"',
          'u.name AS "uploaderName"',
        ])
        .getRawMany();

      return rows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        storedFileId: r.storedFileId,
        displayName: r.displayName || null,
        originalName: r.originalName,
        mediaType: r.mediaType || 'application/octet-stream',
        sizeBytes: Number(r.sizeBytes) || 0,
        createdAt: new Date(r.createdAt),
        uploaderName: r.uploaderName || null,
      }));
    });
  }

  /** Upload and attach a file to project */
  async uploadProjectFile(
    actor: PostgresFileActor,
    projectId: string,
    fileInput: UploadPostgresFileInput,
    displayName?: string,
  ): Promise<ProjectFileViewRow> {
    const stored = await this.storage.upload(actor, fileInput);
    try {
      const relation = await this.relations.addToProject(
        actor,
        projectId,
        stored.id,
        displayName,
      );
      return {
        id: relation.id,
        projectId: relation.projectId,
        storedFileId: stored.id,
        displayName: relation.displayName,
        originalName: stored.originalName,
        mediaType: stored.mediaType,
        sizeBytes: Number(stored.sizeBytes),
        createdAt: relation.createdAt,
        uploaderName: null,
      };
    } catch (error) {
      // Best-effort cleanup of stored file if relation creation failed
      await this.storage.archive(actor, stored.id).catch(() => {});
      throw error;
    }
  }

  /** Download project file */
  async downloadProjectFile(
    actor: PostgresFileActor,
    projectId: string,
    projectFileId: string,
  ): Promise<DownloadPostgresFile> {
    const projectFile = await this.transactions.run(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      const row = await manager.getRepository(ProjectFileEntity).findOneBy({
        id: projectFileId,
        organizationId: actor.organizationId,
        projectId,
        removedAt: IsNull(),
      });
      if (!row) throw new NotFoundException('Project file not found');
      return row;
    });

    const file = await this.storage.download(actor, projectFile.storedFileId);
    return {
      ...file,
      originalName: projectFile.displayName?.trim() || file.originalName,
    };
  }

  /** Soft remove file from project */
  removeProjectFile(
    actor: PostgresFileActor,
    projectId: string,
    projectFileId: string,
  ): Promise<ProjectFileEntity> {
    return this.relations.removeFromProject(actor, projectId, projectFileId);
  }

  /** List task attachments */
  listTaskAttachments(
    actor: PostgresFileActor,
    projectId: string,
    taskId: string,
  ): Promise<TaskAttachmentViewRow[]> {
    return this.transactions.run(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      await this.requireTask(manager, actor.organizationId, projectId, taskId);

      const rows = await manager
        .createQueryBuilder(TaskAttachmentEntity, 'ta')
        .innerJoin(
          StoredFileEntity,
          'sf',
          'sf.id = ta.stored_file_id AND sf.organization_id = ta.organization_id',
        )
        .leftJoin(
          ProjectMembershipEntity,
          'pm',
          'pm.id = ta.attached_by_project_membership_id AND pm.organization_id = ta.organization_id',
        )
        .leftJoin(
          OrganizationMembershipEntity,
          'om',
          'om.id = pm.organization_membership_id AND om.organization_id = ta.organization_id',
        )
        .leftJoin(UserEntity, 'u', 'u.id = om.user_id')
        .where('ta.organization_id = :orgId', { orgId: actor.organizationId })
        .andWhere('ta.project_id = :projectId', { projectId })
        .andWhere('ta.task_id = :taskId', { taskId })
        .andWhere('ta.removed_at IS NULL')
        .andWhere('sf.deleted_at IS NULL')
        .orderBy('ta.created_at', 'DESC')
        .select([
          'ta.id AS "id"',
          'ta.project_id AS "projectId"',
          'ta.task_id AS "taskId"',
          'ta.stored_file_id AS "storedFileId"',
          'ta.created_at AS "createdAt"',
          'sf.original_name AS "originalName"',
          'sf.media_type AS "mediaType"',
          'sf.size_bytes AS "sizeBytes"',
          'u.name AS "uploaderName"',
        ])
        .getRawMany();

      return rows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        taskId: r.taskId,
        storedFileId: r.storedFileId,
        originalName: r.originalName,
        mediaType: r.mediaType || 'application/octet-stream',
        sizeBytes: Number(r.sizeBytes) || 0,
        createdAt: new Date(r.createdAt),
        uploaderName: r.uploaderName || null,
      }));
    });
  }

  /** Upload and attach a file to a task */
  async uploadTaskAttachment(
    actor: PostgresFileActor,
    projectId: string,
    taskId: string,
    fileInput: UploadPostgresFileInput,
  ): Promise<TaskAttachmentViewRow> {
    const stored = await this.storage.upload(actor, fileInput);
    try {
      const relation = await this.relations.attachToTask(
        actor,
        projectId,
        taskId,
        stored.id,
      );
      return {
        id: relation.id,
        projectId: relation.projectId,
        taskId: relation.taskId,
        storedFileId: stored.id,
        originalName: stored.originalName,
        mediaType: stored.mediaType,
        sizeBytes: Number(stored.sizeBytes),
        createdAt: relation.createdAt,
        uploaderName: null,
      };
    } catch (error) {
      await this.storage.archive(actor, stored.id).catch(() => {});
      throw error;
    }
  }

  /** Download task attachment */
  async downloadTaskAttachment(
    actor: PostgresFileActor,
    projectId: string,
    taskId: string,
    attachmentId: string,
  ): Promise<DownloadPostgresFile> {
    const attachment = await this.transactions.run(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      const row = await manager.getRepository(TaskAttachmentEntity).findOneBy({
        id: attachmentId,
        organizationId: actor.organizationId,
        projectId,
        taskId,
        removedAt: IsNull(),
      });
      if (!row) throw new NotFoundException('Task attachment not found');
      return row;
    });

    return this.storage.download(actor, attachment.storedFileId);
  }

  /** Unlink task attachment */
  unlinkTaskAttachment(
    actor: PostgresFileActor,
    projectId: string,
    taskId: string,
    attachmentId: string,
  ): Promise<TaskAttachmentEntity> {
    return this.relations.unlinkTask(actor, projectId, taskId, attachmentId);
  }

  private async requireVisibleProject(
    manager: EntityManager,
    actor: PostgresFileActor,
    projectId: string,
  ): Promise<void> {
    const project = await manager.getRepository(ProjectEntity).findOneBy({
      id: projectId,
      organizationId: actor.organizationId,
    });
    if (!project)
      throw new NotFoundException('Project not found in active organization');

    const membership = await manager
      .getRepository(OrganizationMembershipEntity)
      .findOneBy({
        id: actor.membershipId,
        organizationId: actor.organizationId,
        state: OrganizationMembershipState.ACTIVE,
      });
    if (!membership)
      throw new ForbiddenException(
        'Active organization membership is required',
      );

    if (
      membership.role === OrganizationRole.OWNER ||
      membership.role === OrganizationRole.ADMIN
    ) {
      return;
    }

    const projectMembership = await manager
      .getRepository(ProjectMembershipEntity)
      .findOneBy({
        organizationId: actor.organizationId,
        projectId,
        organizationMembershipId: actor.membershipId,
        removedAt: IsNull(),
      });
    if (!projectMembership)
      throw new ForbiddenException('Focused Project membership is required');
  }

  private async requireTask(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<void> {
    const task = await manager.getRepository(TaskEntity).findOneBy({
      id: taskId,
      organizationId,
      projectId,
      archivedAt: IsNull(),
    });
    if (!task) throw new NotFoundException('Task not found');
  }
}
