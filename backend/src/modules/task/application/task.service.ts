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
  ProjectModuleCode,
  ProjectState,
  TaskStatusSemanticCategory,
} from '../../projects/persistence/typeorm/project.entities';
import {
  PostgresProjectMembershipRepository,
  PostgresProjectModuleSettingRepository,
  PostgresProjectRepository,
  PostgresProjectTaskStatusRepository,
  PostgresProjectTeamRepository,
} from '../../projects/persistence/typeorm/project.repositories';
import { MilestoneStatusCode } from '../../projects/persistence/typeorm/optional-module.entities';
import { PostgresMilestoneRepository } from '../../projects/persistence/typeorm/optional-module.repositories';
import type { PostgresProjectActor } from '../../projects/application/project.service';
import {
  TaskAssigneeEntity,
  ApprovalRequestEntity,
  ApprovalRequestState,
  TaskChecklistItemEntity,
  TaskEntity,
  CommentEntity,
} from '../persistence/typeorm/task.entities';
import {
  PostgresTaskAssigneeRepository,
  PostgresTaskChecklistRepository,
  PostgresCommentRepository,
  PostgresApprovalRequestRepository,
  PostgresTaskRepository,
} from '../persistence/typeorm/task.repositories';
import { PostgresTeamMemberRepository } from '../../onboarding/persistence/typeorm/onboarding.repositories';
import { writePostgresActivity } from '../../collaboration/application/activity.writer';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';

export interface CreatePostgresTaskInput {
  owningTeamId: string;
  statusId: string;
  title: string;
  description?: string;
  priorityCode: string;
  dueAt?: string | null;
  milestoneId?: string | null;
}

export interface UpdatePostgresTaskInput {
  title?: string;
  description?: string;
  owningTeamId?: string;
  priorityCode?: string;
  dueAt?: string | null;
  milestoneId?: string | null;
}

export interface AddPostgresTaskChecklistItemInput {
  text: string;
}

export interface CreatePostgresCommentInput { body: string }
export interface UpdatePostgresCommentInput { body: string }
export interface ConfigurePostgresTaskApprovalInput { approverProjectMembershipId: string | null }

/** P4 Task management commands with explicit Organization and Project scope. */
export class PostgresTaskService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  create(
    actor: PostgresProjectActor,
    projectId: string,
    input: CreatePostgresTaskInput,
  ): Promise<TaskEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireMutableProjectManager(manager, actor, projectId);
      await this.requireActiveOwningTeam(
        manager,
        actor.organizationId,
        projectId,
        input.owningTeamId,
      );
      await this.requireActiveStatus(
        manager,
        actor.organizationId,
        projectId,
        input.statusId,
      );
      const actorProjectMembership = await this.requireActiveProjectMembership(
        manager,
        actor,
        projectId,
      );
      if (input.milestoneId) await this.requireOpenMilestone(manager, actor.organizationId, projectId, input.milestoneId);
      const tasks = new PostgresTaskRepository(manager);
      const created = await tasks.save(
        tasks.create({
          organizationId: actor.organizationId,
          projectId,
          owningTeamId: input.owningTeamId,
          statusId: input.statusId,
          creatorProjectMembershipId: actorProjectMembership.id,
          milestoneId: input.milestoneId ?? null,
          title: requiredTitle(input.title),
          description: input.description?.trim() ?? '',
          priorityCode: requiredPriority(input.priorityCode),
          dueAt: parseDueAt(input.dueAt),
          manualProgress: 0,
          requiresApproval: false,
          approverProjectMembershipId: null,
          version: '0',
          archivedAt: null,
        }),
      );
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_CREATED', subjectType: 'TASK', subjectId: created.id });
      return created;
    });
  }

  update(
    actor: PostgresProjectActor,
    projectId: string,
    taskId: string,
    input: UpdatePostgresTaskInput,
  ): Promise<TaskEntity> {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException('At least one Task field is required');
    }
    return this.transactions.run(async (manager) => {
      const task = await this.requireMutableTask(
        manager,
        actor,
        projectId,
        taskId,
      );
      const actorProjectMembership = await this.requireActiveProjectMembership(
        manager,
        actor,
        projectId,
      );
      const isManager =
        actorProjectMembership.role === ProjectRole.PROJECT_MANAGER;
      const changesManagement =
        input.owningTeamId !== undefined ||
        input.priorityCode !== undefined ||
        input.dueAt !== undefined ||
        input.milestoneId !== undefined;
      if (changesManagement && !isManager) {
        throw new ForbiddenException(
          'An active Project Manager is required to update Task management fields',
        );
      }
      if (!isManager)
        await this.requireTaskExecutionAccess(
          manager,
          actor.organizationId,
          projectId,
          task,
          actorProjectMembership.id,
        );
      if (input.owningTeamId !== undefined) {
        await this.requireActiveOwningTeam(
          manager,
          actor.organizationId,
          projectId,
          input.owningTeamId,
        );
        await this.requireAssigneesQualifiedForTeam(
          manager,
          actor.organizationId,
          projectId,
          task.id,
          input.owningTeamId,
        );
        task.owningTeamId = input.owningTeamId;
      }
      if (input.title !== undefined) task.title = requiredTitle(input.title);
      if (input.description !== undefined)
        task.description = input.description.trim();
      if (input.priorityCode !== undefined)
        task.priorityCode = requiredPriority(input.priorityCode);
      if (input.dueAt !== undefined) task.dueAt = parseDueAt(input.dueAt);
      if (input.milestoneId !== undefined) {
        if (input.milestoneId) await this.requireOpenMilestone(manager, actor.organizationId, projectId, input.milestoneId);
        task.milestoneId = input.milestoneId;
      }
      const saved = await new PostgresTaskRepository(manager).save(task);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_UPDATED', subjectType: 'TASK', subjectId: task.id });
      return saved;
    });
  }

  archive(
    actor: PostgresProjectActor,
    projectId: string,
    taskId: string,
  ): Promise<TaskEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireMutableProjectManager(manager, actor, projectId);
      const task = await this.requireMutableTask(
        manager,
        actor,
        projectId,
        taskId,
      );
      if (task.archivedAt)
        throw new ConflictException('Task is already archived');
      task.archivedAt = new Date();
      const saved = await new PostgresTaskRepository(manager).save(task);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_ARCHIVED', subjectType: 'TASK', subjectId: task.id });
      return saved;
    });
  }

  assign(
    actor: PostgresProjectActor,
    projectId: string,
    taskId: string,
    projectMembershipId: string,
  ): Promise<TaskAssigneeEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireMutableProjectManager(manager, actor, projectId);
      const task = await this.requireMutableTask(
        manager,
        actor,
        projectId,
        taskId,
      );
      const assigneeMembership = await this.requireActiveProjectMembershipById(
        manager,
        actor.organizationId,
        projectId,
        projectMembershipId,
      );
      await this.requireActiveTeamMembership(
        manager,
        actor.organizationId,
        task.owningTeamId,
        assigneeMembership.organizationMembershipId,
      );
      const assignees = new PostgresTaskAssigneeRepository(manager);
      const existing =
        await assignees.findByTaskAndProjectMembershipForUpdate(
          actor.organizationId,
          projectId,
          task.id,
          projectMembershipId,
        );
      if (existing?.removedAt === null) {
        throw new ConflictException(
          'Project member is already assigned to Task',
        );
      }
      if (existing) {
        existing.removedAt = null;
        existing.assignedAt = new Date();
        existing.assignedByProjectMembershipId = (
          await this.requireActiveProjectMembership(manager, actor, projectId)
        ).id;
        return assignees.save(existing);
      }
      const actorProjectMembership = await this.requireActiveProjectMembership(
        manager,
        actor,
        projectId,
      );
      return assignees.save(
        assignees.create({
          organizationId: actor.organizationId,
          projectId,
          taskId: task.id,
          projectMembershipId,
          assignedByProjectMembershipId: actorProjectMembership.id,
          assignedAt: new Date(),
          removedAt: null,
        }),
      );
    });
  }

  unassign(
    actor: PostgresProjectActor,
    projectId: string,
    taskId: string,
    projectMembershipId: string,
  ): Promise<TaskAssigneeEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireMutableProjectManager(manager, actor, projectId);
      const task = await this.requireMutableTask(
        manager,
        actor,
        projectId,
        taskId,
      );
      const assignee = await new PostgresTaskAssigneeRepository(
        manager,
      ).findByTaskAndProjectMembershipForUpdate(
        actor.organizationId,
        projectId,
        task.id,
        projectMembershipId,
      );
      if (!assignee || assignee.removedAt) {
        throw new NotFoundException('Active Task assignee not found');
      }
      assignee.removedAt = new Date();
      return new PostgresTaskAssigneeRepository(manager).save(assignee);
    });
  }

  transitionStatus(
    actor: PostgresProjectActor,
    projectId: string,
    taskId: string,
    statusId: string,
  ): Promise<TaskEntity> {
    return this.transactions.run(async (manager) => {
      const task = await this.requireMutableTask(
        manager,
        actor,
        projectId,
        taskId,
      );
      const actorMembership = await this.requireActiveProjectMembership(
        manager,
        actor,
        projectId,
      );
      await this.requireTaskExecutionAccess(
        manager,
        actor.organizationId,
        projectId,
        task,
        actorMembership.id,
        actorMembership.role === ProjectRole.PROJECT_MANAGER,
      );
      const statuses = new PostgresProjectTaskStatusRepository(manager);
      const [current, target] = await Promise.all([
        statuses.findActiveByIdForUpdate(
          actor.organizationId,
          projectId,
          task.statusId,
        ),
        statuses.findActiveByIdForUpdate(
          actor.organizationId,
          projectId,
          statusId,
        ),
      ]);
      if (!current || !target)
        throw new NotFoundException('Active Project Task Status not found');
      if (
        !isAllowedStatusTransition(
          current.semanticCategory,
          target.semanticCategory,
        )
      ) {
        throw new ConflictException(
          `Task cannot transition from ${current.semanticCategory} to ${target.semanticCategory}`,
        );
      }
      if (
        target.semanticCategory === TaskStatusSemanticCategory.COMPLETED &&
        (await new PostgresTaskChecklistRepository(
          manager,
        ).countIncompleteForTask(actor.organizationId, projectId, task.id)) > 0
      ) {
        throw new ConflictException(
          'Task checklist must be completed before completing the Task',
        );
      }
      if (
        target.semanticCategory === TaskStatusSemanticCategory.COMPLETED &&
        task.requiresApproval &&
        !(await new PostgresApprovalRequestRepository(manager).hasApprovedForTask(
          actor.organizationId,
          projectId,
          task.id,
        ))
      ) {
        throw new ConflictException(
          'Task requires an approved approval request before completion',
        );
      }
      task.statusId = target.id;
      if (target.semanticCategory === TaskStatusSemanticCategory.COMPLETED)
        task.manualProgress = 100;
      const saved = await new PostgresTaskRepository(manager).save(task);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_STATUS_CHANGED', subjectType: 'TASK', subjectId: task.id, safeMetadata: { statusId: saved.statusId } });
      return saved;
    });
  }

  setManualProgress(
    actor: PostgresProjectActor,
    projectId: string,
    taskId: string,
    manualProgress: number,
  ): Promise<TaskEntity> {
    return this.transactions.run(async (manager) => {
      const task = await this.requireMutableTask(
        manager,
        actor,
        projectId,
        taskId,
      );
      const actorMembership = await this.requireActiveProjectMembership(
        manager,
        actor,
        projectId,
      );
      await this.requireTaskExecutionAccess(
        manager,
        actor.organizationId,
        projectId,
        task,
        actorMembership.id,
        actorMembership.role === ProjectRole.PROJECT_MANAGER,
      );
      await this.requireTaskNotCompleted(
        manager,
        actor.organizationId,
        projectId,
        task,
      );
      if (
        await new PostgresTaskChecklistRepository(manager).countActiveForTask(
          actor.organizationId,
          projectId,
          task.id,
        )
      ) {
        throw new ConflictException(
          'Checklist-derived progress cannot be changed manually',
        );
      }
      task.manualProgress = manualProgress;
      return new PostgresTaskRepository(manager).save(task);
    });
  }

  addChecklistItem(
    actor: PostgresProjectActor,
    projectId: string,
    taskId: string,
    input: AddPostgresTaskChecklistItemInput,
  ): Promise<TaskChecklistItemEntity> {
    return this.transactions.run(async (manager) => {
      const task = await this.requireMutableTask(
        manager,
        actor,
        projectId,
        taskId,
      );
      const actorMembership = await this.requireActiveProjectMembership(
        manager,
        actor,
        projectId,
      );
      await this.requireTaskExecutionAccess(
        manager,
        actor.organizationId,
        projectId,
        task,
        actorMembership.id,
        actorMembership.role === ProjectRole.PROJECT_MANAGER,
      );
      await this.requireTaskNotCompleted(
        manager,
        actor.organizationId,
        projectId,
        task,
      );
      const checklist = new PostgresTaskChecklistRepository(manager);
      const position = await checklist.countActiveForTask(
        actor.organizationId,
        projectId,
        task.id,
      );
      const created = await checklist.save(
        checklist.create({
          organizationId: actor.organizationId,
          projectId,
          taskId: task.id,
          text: requiredChecklistText(input.text),
          position,
          completedAt: null,
          completedByProjectMembershipId: null,
          removedAt: null,
        }),
      );
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_CHECKLIST_ITEM_ADDED', subjectType: 'TASK_CHECKLIST_ITEM', subjectId: created.id, safeMetadata: { taskId: task.id } });
      return created;
    });
  }

  setChecklistItemCompletion(
    actor: PostgresProjectActor,
    projectId: string,
    taskId: string,
    itemId: string,
    completed: boolean,
  ): Promise<TaskChecklistItemEntity> {
    return this.transactions.run(async (manager) => {
      const task = await this.requireMutableTask(
        manager,
        actor,
        projectId,
        taskId,
      );
      const actorMembership = await this.requireActiveProjectMembership(
        manager,
        actor,
        projectId,
      );
      await this.requireTaskExecutionAccess(
        manager,
        actor.organizationId,
        projectId,
        task,
        actorMembership.id,
        actorMembership.role === ProjectRole.PROJECT_MANAGER,
      );
      await this.requireTaskNotCompleted(
        manager,
        actor.organizationId,
        projectId,
        task,
      );
      const item = await new PostgresTaskChecklistRepository(
        manager,
      ).findByIdForUpdate(actor.organizationId, projectId, task.id, itemId);
      if (!item) throw new NotFoundException('Active Task checklist item not found');
      item.completedAt = completed ? new Date() : null;
      item.completedByProjectMembershipId = completed ? actorMembership.id : null;
      const saved = await new PostgresTaskChecklistRepository(manager).save(item);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: completed ? 'TASK_CHECKLIST_ITEM_COMPLETED' : 'TASK_CHECKLIST_ITEM_REOPENED', subjectType: 'TASK_CHECKLIST_ITEM', subjectId: item.id, safeMetadata: { taskId: task.id } });
      return saved;
    });
  }

  createComment(
    actor: PostgresProjectActor,
    projectId: string,
    taskId: string,
    input: CreatePostgresCommentInput,
  ): Promise<CommentEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireMutableTask(manager, actor, projectId, taskId);
      const author = await this.requireActiveProjectMembership(manager, actor, projectId);
      const comments = new PostgresCommentRepository(manager);
      const created = await comments.save(comments.create({
        organizationId: actor.organizationId, projectId, taskId,
        authorProjectMembershipId: author.id, body: requiredCommentBody(input.body),
        editedAt: null, deletedAt: null, deletedByMembershipId: null,
      }));
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_COMMENT_CREATED', subjectType: 'COMMENT', subjectId: created.id, safeMetadata: { taskId } });
      return created;
    });
  }

  editComment(actor: PostgresProjectActor, projectId: string, taskId: string, commentId: string, input: UpdatePostgresCommentInput): Promise<CommentEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireMutableTask(manager, actor, projectId, taskId);
      const membership = await this.requireActiveProjectMembership(manager, actor, projectId);
      const comment = await new PostgresCommentRepository(manager).findByIdForUpdate(actor.organizationId, projectId, taskId, commentId);
      if (!comment || comment.deletedAt) throw new NotFoundException('Active Task comment not found');
      this.requireCommentModeration(comment, membership.id, membership.role);
      comment.body = requiredCommentBody(input.body); comment.editedAt = new Date();
      const saved = await new PostgresCommentRepository(manager).save(comment);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_COMMENT_UPDATED', subjectType: 'COMMENT', subjectId: comment.id, safeMetadata: { taskId } });
      return saved;
    });
  }

  deleteComment(actor: PostgresProjectActor, projectId: string, taskId: string, commentId: string): Promise<CommentEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireMutableTask(manager, actor, projectId, taskId);
      const membership = await this.requireActiveProjectMembership(manager, actor, projectId);
      const comment = await new PostgresCommentRepository(manager).findByIdForUpdate(actor.organizationId, projectId, taskId, commentId);
      if (!comment || comment.deletedAt) throw new NotFoundException('Active Task comment not found');
      this.requireCommentModeration(comment, membership.id, membership.role);
      comment.deletedAt = new Date(); comment.deletedByMembershipId = actor.membershipId;
      const saved = await new PostgresCommentRepository(manager).save(comment);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_COMMENT_DELETED', subjectType: 'COMMENT', subjectId: comment.id, safeMetadata: { taskId } });
      return saved;
    });
  }

  listComments(actor: PostgresProjectActor, projectId: string, taskId: string): Promise<CommentEntity[]> {
    return this.transactions.run(async (manager) => {
      const member = await this.requireActiveProjectMembership(manager, actor, projectId);
      if (!member) throw new ForbiddenException('Active Project membership is required');
      const task = await new PostgresTaskRepository(manager).findById(actor.organizationId, projectId, taskId);
      if (!task) throw new NotFoundException('Task not found');
      return new PostgresCommentRepository(manager).listActiveForTask(actor.organizationId, projectId, taskId);
    });
  }

  configureApproval(actor: PostgresProjectActor, projectId: string, taskId: string, input: ConfigurePostgresTaskApprovalInput): Promise<TaskEntity> {
    return this.transactions.run(async (manager) => {
      await this.requireMutableProjectManager(manager, actor, projectId);
      const task = await this.requireMutableTask(manager, actor, projectId, taskId);
      const pending = await new PostgresApprovalRequestRepository(manager).findPendingForTaskForUpdate(actor.organizationId, projectId, task.id);
      if (pending) throw new ConflictException('Pending approval must be cancelled before changing approval configuration');
      if (!input.approverProjectMembershipId) {
        task.requiresApproval = false;
        task.approverProjectMembershipId = null;
        const saved = await new PostgresTaskRepository(manager).save(task);
        await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_APPROVAL_CONFIGURATION_CHANGED', targetType: 'TASK', targetId: task.id, afterData: { requiresApproval: false } });
        return saved;
      }
      await this.requireEligibleApprover(manager, actor.organizationId, projectId, task, input.approverProjectMembershipId);
      task.requiresApproval = true; task.approverProjectMembershipId = input.approverProjectMembershipId;
      const saved = await new PostgresTaskRepository(manager).save(task);
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_APPROVAL_CONFIGURATION_CHANGED', targetType: 'TASK', targetId: task.id, afterData: { requiresApproval: true, approverProjectMembershipId: saved.approverProjectMembershipId } });
      return saved;
    });
  }

  requestApproval(actor: PostgresProjectActor, projectId: string, taskId: string, reason?: string): Promise<ApprovalRequestEntity> {
    return this.transactions.run(async (manager) => {
      const task = await this.requireMutableTask(manager, actor, projectId, taskId);
      const requester = await this.requireActiveProjectMembership(manager, actor, projectId);
      await this.requireTaskExecutionAccess(manager, actor.organizationId, projectId, task, requester.id, requester.role === ProjectRole.PROJECT_MANAGER);
      if (!task.requiresApproval || !task.approverProjectMembershipId) throw new ConflictException('Task approval is not configured');
      await this.requireEligibleApprover(manager, actor.organizationId, projectId, task, task.approverProjectMembershipId);
      const approvals = new PostgresApprovalRequestRepository(manager);
      if (await approvals.findPendingForTaskForUpdate(actor.organizationId, projectId, task.id)) throw new ConflictException('Task already has a pending approval');
      const request = await approvals.save(approvals.create({ organizationId: actor.organizationId, projectId, taskId: task.id, requestNumber: await approvals.nextRequestNumber(actor.organizationId, projectId, task.id), requestedByMembershipId: actor.membershipId, approverProjectMembershipId: task.approverProjectMembershipId, state: ApprovalRequestState.PENDING, requestReason: reason?.trim() || null, resolutionReason: null, resolvedByMembershipId: null, requestedAt: new Date(), resolvedAt: null, idempotencyKey: null }));
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_APPROVAL_REQUESTED', subjectType: 'TASK_APPROVAL_REQUEST', subjectId: request.id, safeMetadata: { taskId: task.id } });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'TASK_APPROVAL_REQUESTED', targetType: 'TASK_APPROVAL_REQUEST', targetId: request.id, afterData: { taskId: task.id, state: request.state } });
      return request;
    });
  }

  resolveApproval(actor: PostgresProjectActor, projectId: string, taskId: string, action: 'approve' | 'reject' | 'cancel', reason?: string): Promise<ApprovalRequestEntity> {
    return this.transactions.run(async (manager) => {
      const task = await this.requireMutableTask(manager, actor, projectId, taskId);
      const member = await this.requireActiveProjectMembership(manager, actor, projectId);
      const request = await new PostgresApprovalRequestRepository(manager).findPendingForTaskForUpdate(actor.organizationId, projectId, task.id);
      if (!request) throw new ConflictException('No pending approval request');
      if (action === 'cancel') {
        if (request.requestedByMembershipId !== actor.membershipId && member.role !== ProjectRole.PROJECT_MANAGER) throw new ForbiddenException('Only the requester or an active Project Manager may cancel approval');
        if (!reason?.trim()) throw new BadRequestException('Approval cancellation reason is required');
        request.state = ApprovalRequestState.CANCELLED;
      } else {
        if (request.approverProjectMembershipId !== member.id) throw new ForbiddenException('Only the designated approver may resolve approval');
        await this.requireEligibleApprover(manager, actor.organizationId, projectId, task, member.id);
        request.state = action === 'approve' ? ApprovalRequestState.APPROVED : ApprovalRequestState.REJECTED;
      }
      request.resolutionReason = reason?.trim() || null; request.resolvedByMembershipId = actor.membershipId; request.resolvedAt = new Date();
      const saved = await new PostgresApprovalRequestRepository(manager).save(request);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: `TASK_APPROVAL_${action.toUpperCase()}D`, subjectType: 'TASK_APPROVAL_REQUEST', subjectId: request.id, safeMetadata: { taskId: task.id } });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: `TASK_APPROVAL_${action.toUpperCase()}`, targetType: 'TASK_APPROVAL_REQUEST', targetId: request.id, beforeData: { state: ApprovalRequestState.PENDING }, afterData: { taskId: task.id, state: saved.state } });
      return saved;
    });
  }

  private async requireMutableTask(
    manager: EntityManager,
    actor: PostgresProjectActor,
    projectId: string,
    taskId: string,
  ): Promise<TaskEntity> {
    await this.requireMutableProject(manager, actor.organizationId, projectId);
    const task = await new PostgresTaskRepository(manager).findByIdForUpdate(
      actor.organizationId,
      projectId,
      taskId,
    );
    if (!task) throw new NotFoundException('Task not found');
    if (task.archivedAt)
      throw new ConflictException('Archived tasks are read-only');
    return task;
  }

  private async requireTaskExecutionAccess(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
    task: TaskEntity,
    actorProjectMembershipId: string,
    isProjectManager = false,
  ): Promise<void> {
    if (isProjectManager) return;
    if (task.creatorProjectMembershipId === actorProjectMembershipId) return;
    const assignment = await new PostgresTaskAssigneeRepository(
      manager,
    ).findByTaskAndProjectMembershipForUpdate(
      organizationId,
      projectId,
      task.id,
      actorProjectMembershipId,
    );
    if (!assignment || assignment.removedAt) {
      throw new ForbiddenException(
        'Only the Task creator, an active assignee or an active Project Manager may execute this Task',
      );
    }
  }

  private requireCommentModeration(comment: CommentEntity, membershipId: string, role: ProjectRole): void {
    if (comment.authorProjectMembershipId === membershipId || role === ProjectRole.PROJECT_MANAGER) return;
    throw new ForbiddenException('Only the Comment author or an active Project Manager may moderate this Comment');
  }

  private async requireEligibleApprover(manager: EntityManager, organizationId: string, projectId: string, task: TaskEntity, projectMembershipId: string): Promise<void> {
    const member = await this.requireActiveProjectMembershipById(manager, organizationId, projectId, projectMembershipId);
    if (member.id === task.creatorProjectMembershipId) throw new ConflictException('Task creator cannot approve this Task');
    const assignment = await new PostgresTaskAssigneeRepository(manager).findByTaskAndProjectMembershipForUpdate(organizationId, projectId, task.id, member.id);
    if (assignment && !assignment.removedAt) throw new ConflictException('Active Task assignee cannot approve this Task');
  }

  private async requireTaskNotCompleted(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
    task: TaskEntity,
  ): Promise<void> {
    const status = await new PostgresProjectTaskStatusRepository(
      manager,
    ).findActiveByIdForUpdate(organizationId, projectId, task.statusId);
    if (status?.semanticCategory === TaskStatusSemanticCategory.COMPLETED) {
      throw new ConflictException(
        'Reopen the Task before changing its checklist',
      );
    }
  }

  private async requireMutableProjectManager(
    manager: EntityManager,
    actor: PostgresProjectActor,
    projectId: string,
  ): Promise<void> {
    await this.requireMutableProject(manager, actor.organizationId, projectId);
    const membership = await this.requireActiveProjectMembership(
      manager,
      actor,
      projectId,
    );
    if (membership.role !== ProjectRole.PROJECT_MANAGER) {
      throw new ForbiddenException('An active Project Manager is required');
    }
  }

  private async requireOpenMilestone(manager: EntityManager, organizationId: string, projectId: string, milestoneId: string): Promise<void> {
    const setting = await new PostgresProjectModuleSettingRepository(manager).findByProjectAndCodeForUpdate(organizationId, projectId, ProjectModuleCode.MILESTONES);
    if (!setting?.enabled) throw new ConflictException('Project module is disabled');
    const milestone = await new PostgresMilestoneRepository(manager).findByIdForUpdate(organizationId, projectId, milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.archivedAt || milestone.statusCode !== MilestoneStatusCode.OPEN) throw new ConflictException('Only an open Milestone may receive Tasks');
  }

  private async requireMutableProject(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    const project = await new PostgresProjectRepository(
      manager,
    ).findByIdForUpdate(organizationId, projectId);
    if (!project) throw new NotFoundException('Project not found');
    if (
      project.state === ProjectState.COMPLETED ||
      project.state === ProjectState.ARCHIVED
    ) {
      throw new ConflictException(
        'Completed and archived projects are read-only',
      );
    }
  }

  private requireActiveProjectMembership(
    manager: EntityManager,
    actor: PostgresProjectActor,
    projectId: string,
  ) {
    return new PostgresProjectMembershipRepository(manager)
      .findActiveByProjectAndOrganizationMembershipForUpdate(
        actor.organizationId,
        projectId,
        actor.membershipId,
      )
      .then((membership) => {
        if (!membership)
          throw new ForbiddenException('Active Project membership is required');
        return membership;
      });
  }

  private async requireActiveOwningTeam(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
    teamId: string,
  ): Promise<void> {
    const relation = await new PostgresProjectTeamRepository(
      manager,
    ).findByProjectAndTeamForUpdate(organizationId, projectId, teamId);
    if (!relation || relation.removedAt) {
      throw new NotFoundException('Active Participating Team not found');
    }
  }

  private async requireActiveProjectMembershipById(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
    projectMembershipId: string,
  ) {
    const membership = await new PostgresProjectMembershipRepository(
      manager,
    ).findActiveByIdForUpdate(organizationId, projectId, projectMembershipId);
    if (!membership) {
      throw new NotFoundException('Active Project member not found');
    }
    return membership;
  }

  private async requireActiveTeamMembership(
    manager: EntityManager,
    organizationId: string,
    teamId: string,
    organizationMembershipId: string,
  ): Promise<void> {
    const membership = await new PostgresTeamMemberRepository(
      manager,
    ).findActiveByTeamAndMembershipForUpdate(
      organizationId,
      teamId,
      organizationMembershipId,
    );
    if (!membership) {
      throw new ConflictException(
        'Project member must belong to the Task owning Team',
      );
    }
  }

  private async requireAssigneesQualifiedForTeam(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
    taskId: string,
    owningTeamId: string,
  ): Promise<void> {
    const assignees = await new PostgresTaskAssigneeRepository(
      manager,
    ).listActiveForTaskForUpdate(organizationId, projectId, taskId);
    for (const assignee of assignees) {
      const membership = await this.requireActiveProjectMembershipById(
        manager,
        organizationId,
        projectId,
        assignee.projectMembershipId,
      );
      await this.requireActiveTeamMembership(
        manager,
        organizationId,
        owningTeamId,
        membership.organizationMembershipId,
      );
    }
  }

  private async requireActiveStatus(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
    statusId: string,
  ): Promise<void> {
    const status = await new PostgresProjectTaskStatusRepository(
      manager,
    ).findActiveByIdForUpdate(organizationId, projectId, statusId);
    if (!status)
      throw new NotFoundException('Active Project Task Status not found');
  }
}

function requiredTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new BadRequestException('Task title is required');
  return title;
}

function requiredPriority(value: string): string {
  const priority = value.trim();
  if (!priority) throw new BadRequestException('Task priority is required');
  return priority;
}

function requiredChecklistText(value: string): string {
  const text = value.trim();
  if (!text) throw new BadRequestException('Checklist item text is required');
  return text;
}

function requiredCommentBody(value: string): string {
  const body = value.trim();
  if (!body) throw new BadRequestException('Comment body is required');
  return body;
}

function isAllowedStatusTransition(
  from: TaskStatusSemanticCategory,
  to: TaskStatusSemanticCategory,
): boolean {
  if (from === to) return true;
  switch (from) {
    case TaskStatusSemanticCategory.NOT_STARTED:
      return to === TaskStatusSemanticCategory.IN_PROGRESS;
    case TaskStatusSemanticCategory.IN_PROGRESS:
      return (
        to === TaskStatusSemanticCategory.NOT_STARTED ||
        to === TaskStatusSemanticCategory.REVIEW ||
        to === TaskStatusSemanticCategory.COMPLETED ||
        to === TaskStatusSemanticCategory.CANCELLED
      );
    case TaskStatusSemanticCategory.REVIEW:
      return (
        to === TaskStatusSemanticCategory.IN_PROGRESS ||
        to === TaskStatusSemanticCategory.COMPLETED ||
        to === TaskStatusSemanticCategory.CANCELLED
      );
    case TaskStatusSemanticCategory.COMPLETED:
    case TaskStatusSemanticCategory.CANCELLED:
      return to === TaskStatusSemanticCategory.IN_PROGRESS;
  }
}

function parseDueAt(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException('Task due date must be a valid ISO date');
  return date;
}
