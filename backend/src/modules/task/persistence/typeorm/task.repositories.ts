import { IsNull } from 'typeorm';
import type { DeepPartial, EntityManager } from 'typeorm';
import {
  ApprovalRequestEntity,
  CommentEntity,
  TaskAssigneeEntity,
  TaskChecklistItemEntity,
  TaskEntity,
} from './task.entities';
import { TaskStatusSemanticCategory } from '../../../projects/persistence/typeorm/project.entities';

/** Manager-scoped repositories for the P4 Task transaction boundary. */
export class PostgresTaskRepository {
  constructor(private readonly manager: EntityManager) {}

  findById(organizationId: string, projectId: string, id: string) {
    return this.manager.getRepository(TaskEntity).findOneBy({
      id,
      organizationId,
      projectId,
    });
  }

  findByIdForUpdate(
    organizationId: string,
    projectId: string,
    id: string,
  ): Promise<TaskEntity | null> {
    return this.manager
      .getRepository(TaskEntity)
      .createQueryBuilder('task')
      .setLock('pessimistic_write')
      .where('task.organization_id = :organizationId', { organizationId })
      .andWhere('task.project_id = :projectId', { projectId })
      .andWhere('task.id = :id', { id })
      .getOne();
  }

  create(values: DeepPartial<TaskEntity>): TaskEntity {
    return this.manager.getRepository(TaskEntity).create(values);
  }

  save(task: TaskEntity): Promise<TaskEntity> {
    return this.manager.getRepository(TaskEntity).save(task);
  }
}

/** Cross-capability dependency reads, always used inside the Project transaction. */
export class PostgresTaskDependencyRepository {
  constructor(private readonly manager: EntityManager) {}

  async hasActiveOwningTeamForUpdate(
    organizationId: string,
    projectId: string,
    owningTeamId: string,
  ): Promise<boolean> {
    const tasks = await this.manager
      .getRepository(TaskEntity)
      .createQueryBuilder('task')
      .setLock('pessimistic_write')
      .where('task.organization_id = :organizationId', { organizationId })
      .andWhere('task.project_id = :projectId', { projectId })
      .andWhere('task.owning_team_id = :owningTeamId', { owningTeamId })
      .andWhere('task.archived_at IS NULL')
      .getMany();
    return tasks.length > 0;
  }

  async hasActiveAssignmentForProjectMembershipForUpdate(
    organizationId: string,
    projectId: string,
    projectMembershipId: string,
  ): Promise<boolean> {
    const assignments = await this.manager
      .getRepository(TaskAssigneeEntity)
      .createQueryBuilder('assignee')
      .setLock('pessimistic_write')
      .innerJoin(
        TaskEntity,
        'task',
        'task.organization_id = assignee.organization_id AND task.project_id = assignee.project_id AND task.id = assignee.task_id',
      )
      .where('assignee.organization_id = :organizationId', { organizationId })
      .andWhere('assignee.project_id = :projectId', { projectId })
      .andWhere('assignee.project_membership_id = :projectMembershipId', {
        projectMembershipId,
      })
      .andWhere('assignee.removed_at IS NULL')
      .andWhere('task.archived_at IS NULL')
      .getMany();
    return assignments.length > 0;
  }

  async hasNonTerminalForProjectForUpdate(
    organizationId: string,
    projectId: string,
  ): Promise<boolean> {
    const tasks = await this.manager
      .getRepository(TaskEntity)
      .createQueryBuilder('task')
      .setLock('pessimistic_write')
      .innerJoin(
        'project_task_statuses',
        'status',
        'status.organization_id = task.organization_id AND status.project_id = task.project_id AND status.id = task.status_id',
      )
      .where('task.organization_id = :organizationId', { organizationId })
      .andWhere('task.project_id = :projectId', { projectId })
      .andWhere('task.archived_at IS NULL')
      .andWhere('status.semantic_category NOT IN (:...terminalCategories)', {
        terminalCategories: [
          TaskStatusSemanticCategory.COMPLETED,
          TaskStatusSemanticCategory.CANCELLED,
        ],
      })
      .getMany();
    return tasks.length > 0;
  }
}

export class PostgresTaskAssigneeRepository {
  constructor(private readonly manager: EntityManager) {}

  create(values: DeepPartial<TaskAssigneeEntity>): TaskAssigneeEntity {
    return this.manager.getRepository(TaskAssigneeEntity).create(values);
  }

  findByTaskAndProjectMembershipForUpdate(
    organizationId: string,
    projectId: string,
    taskId: string,
    projectMembershipId: string,
  ): Promise<TaskAssigneeEntity | null> {
    return this.manager
      .getRepository(TaskAssigneeEntity)
      .createQueryBuilder('assignee')
      .setLock('pessimistic_write')
      .where('assignee.organization_id = :organizationId', { organizationId })
      .andWhere('assignee.project_id = :projectId', { projectId })
      .andWhere('assignee.task_id = :taskId', { taskId })
      .andWhere('assignee.project_membership_id = :projectMembershipId', {
        projectMembershipId,
      })
      .getOne();
  }

  listActiveForTaskForUpdate(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<TaskAssigneeEntity[]> {
    return this.manager
      .getRepository(TaskAssigneeEntity)
      .createQueryBuilder('assignee')
      .setLock('pessimistic_write')
      .where('assignee.organization_id = :organizationId', { organizationId })
      .andWhere('assignee.project_id = :projectId', { projectId })
      .andWhere('assignee.task_id = :taskId', { taskId })
      .andWhere('assignee.removed_at IS NULL')
      .getMany();
  }

  save(assignee: TaskAssigneeEntity): Promise<TaskAssigneeEntity> {
    return this.manager.getRepository(TaskAssigneeEntity).save(assignee);
  }
}

export class PostgresTaskChecklistRepository {
  constructor(private readonly manager: EntityManager) {}

  findByIdForUpdate(
    organizationId: string,
    projectId: string,
    taskId: string,
    id: string,
  ): Promise<TaskChecklistItemEntity | null> {
    return this.manager
      .getRepository(TaskChecklistItemEntity)
      .createQueryBuilder('item')
      .setLock('pessimistic_write')
      .where('item.organization_id = :organizationId', { organizationId })
      .andWhere('item.project_id = :projectId', { projectId })
      .andWhere('item.task_id = :taskId', { taskId })
      .andWhere('item.id = :id', { id })
      .andWhere('item.removed_at IS NULL')
      .getOne();
  }

  countActiveForTask(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<number> {
    return this.manager.getRepository(TaskChecklistItemEntity).countBy({
      organizationId,
      projectId,
      taskId,
      removedAt: IsNull(),
    });
  }

  countIncompleteForTask(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<number> {
    return this.manager
      .getRepository(TaskChecklistItemEntity)
      .createQueryBuilder('item')
      .where('item.organization_id = :organizationId', { organizationId })
      .andWhere('item.project_id = :projectId', { projectId })
      .andWhere('item.task_id = :taskId', { taskId })
      .andWhere('item.removed_at IS NULL')
      .andWhere('item.completed_at IS NULL')
      .getCount();
  }

  create(
    values: DeepPartial<TaskChecklistItemEntity>,
  ): TaskChecklistItemEntity {
    return this.manager.getRepository(TaskChecklistItemEntity).create(values);
  }

  save(item: TaskChecklistItemEntity): Promise<TaskChecklistItemEntity> {
    return this.manager.getRepository(TaskChecklistItemEntity).save(item);
  }
}

export class PostgresApprovalRequestRepository {
  constructor(private readonly manager: EntityManager) {}

  findPendingForTaskForUpdate(organizationId: string, projectId: string, taskId: string) {
    return this.manager.getRepository(ApprovalRequestEntity).createQueryBuilder('request').setLock('pessimistic_write')
      .where('request.organization_id = :organizationId', { organizationId }).andWhere('request.project_id = :projectId', { projectId })
      .andWhere('request.task_id = :taskId', { taskId }).andWhere("request.state = 'PENDING'").getOne();
  }

  async nextRequestNumber(organizationId: string, projectId: string, taskId: string): Promise<number> {
    const row = await this.manager.getRepository(ApprovalRequestEntity).createQueryBuilder('request')
      .select('COALESCE(MAX(request.request_number), 0)', 'max').where('request.organization_id = :organizationId', { organizationId })
      .andWhere('request.project_id = :projectId', { projectId }).andWhere('request.task_id = :taskId', { taskId }).getRawOne<{ max: string }>();
    return Number(row?.max ?? 0) + 1;
  }

  hasApprovedForTask(organizationId: string, projectId: string, taskId: string): Promise<boolean> {
    return this.manager.getRepository(ApprovalRequestEntity).createQueryBuilder('request')
      .where('request.organization_id = :organizationId', { organizationId }).andWhere('request.project_id = :projectId', { projectId })
      .andWhere('request.task_id = :taskId', { taskId }).andWhere("request.state = 'APPROVED'").getExists();
  }

  create(values: DeepPartial<ApprovalRequestEntity>): ApprovalRequestEntity {
    return this.manager.getRepository(ApprovalRequestEntity).create(values);
  }

  save(request: ApprovalRequestEntity): Promise<ApprovalRequestEntity> {
    return this.manager.getRepository(ApprovalRequestEntity).save(request);
  }
}

export class PostgresCommentRepository {
  constructor(private readonly manager: EntityManager) {}

  findByIdForUpdate(
    organizationId: string,
    projectId: string,
    taskId: string,
    id: string,
  ): Promise<CommentEntity | null> {
    return this.manager
      .getRepository(CommentEntity)
      .createQueryBuilder('comment')
      .setLock('pessimistic_write')
      .where('comment.organization_id = :organizationId', { organizationId })
      .andWhere('comment.project_id = :projectId', { projectId })
      .andWhere('comment.task_id = :taskId', { taskId })
      .andWhere('comment.id = :id', { id })
      .getOne();
  }

  listActiveForTask(organizationId: string, projectId: string, taskId: string) {
    return this.manager.getRepository(CommentEntity).find({
      where: { organizationId, projectId, taskId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
  }

  create(values: DeepPartial<CommentEntity>): CommentEntity {
    return this.manager.getRepository(CommentEntity).create(values);
  }

  save(comment: CommentEntity): Promise<CommentEntity> {
    return this.manager.getRepository(CommentEntity).save(comment);
  }
}
