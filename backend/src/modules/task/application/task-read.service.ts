import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import { OrganizationRole } from '../../onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOrganizationMembershipRepository } from '../../onboarding/persistence/typeorm/onboarding.repositories';
import {
  PostgresProjectMembershipRepository,
  PostgresProjectRepository,
} from '../../projects/persistence/typeorm/project.repositories';
import type { PostgresProjectActor } from '../../projects/application/project.service';

export interface PostgresTaskQuery {
  search?: string;
  statusId?: string;
  teamId?: string;
  assigneeProjectMembershipId?: string;
  priorityCode?: string;
  dueFrom?: string;
  dueTo?: string;
}

export interface TaskReadRow {
  id: string;
  projectId: string;
  owningTeamId: string;
  owningTeamName: string;
  statusId: string;
  statusName: string;
  semanticCategory: string;
  creatorProjectMembershipId: string;
  title: string;
  description: string;
  priorityCode: string;
  dueAt: Date | null;
  manualProgress: number;
  effectiveProgress: number;
  requiresApproval: boolean;
  approverProjectMembershipId: string | null;
  assigneeProjectMembershipIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChecklistReadRow {
  id: string;
  text: string;
  position: number;
  completedAt: Date | null;
  completedByProjectMembershipId: string | null;
}

export interface CommentReadRow {
  id: string;
  authorProjectMembershipId: string;
  body: string;
  editedAt: Date | null;
  createdAt: Date;
}

export interface ApprovalReadRow {
  id: string;
  requestNumber: number;
  state: string;
  approverProjectMembershipId: string;
  requestedAt: Date;
  resolvedAt: Date | null;
  requestReason: string | null;
  resolutionReason: string | null;
}

export interface ApprovalQueueReadRow {
  id: string;
  taskId: string;
  projectId: string;
  requestNumber: number;
  requestReason: string | null;
  requestedAt: Date;
  title: string;
  priorityCode: string;
  dueAt: Date | null;
}

@Injectable()
export class PostgresTaskReadService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  list(actor: PostgresProjectActor, projectId: string, query: PostgresTaskQuery) {
    return this.transactions.run(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      return this.queryTasks(manager, actor.organizationId, projectId, query);
    });
  }

  board(actor: PostgresProjectActor, projectId: string, query: PostgresTaskQuery) {
    return this.transactions.run(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      const statuses = await manager.query<
        Array<{
          id: string;
          name: string;
          semanticCategory: string;
          position: number;
        }>
      >(
        `SELECT id, name, semantic_category AS "semanticCategory", position
           FROM project_task_statuses
          WHERE organization_id = $1 AND project_id = $2 AND archived_at IS NULL
          ORDER BY position ASC`,
        [actor.organizationId, projectId],
      );
      const tasks = await this.queryTasks(
        manager,
        actor.organizationId,
        projectId,
        query,
      );
      return statuses.map((status) => ({
        ...status,
        tasks: tasks.filter((task) => task.statusId === status.id),
      }));
    });
  }

  detail(actor: PostgresProjectActor, projectId: string, taskId: string) {
    return this.transactions.run(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      const tasks = await this.queryTasks(manager, actor.organizationId, projectId, {}, taskId);
      const task = tasks[0];
      if (!task) throw new NotFoundException('Task not found');
      const checklist = await manager.query<ChecklistReadRow[]>(
        `SELECT id, text, position, completed_at AS "completedAt",
                completed_by_project_membership_id AS "completedByProjectMembershipId"
           FROM task_checklist_items
          WHERE organization_id = $1 AND project_id = $2 AND task_id = $3 AND removed_at IS NULL
          ORDER BY position ASC`,
        [actor.organizationId, projectId, taskId],
      );
      const comments = await manager.query<CommentReadRow[]>(
        `SELECT id, author_project_membership_id AS "authorProjectMembershipId", body,
                edited_at AS "editedAt", created_at AS "createdAt"
           FROM comments
          WHERE organization_id = $1 AND project_id = $2 AND task_id = $3 AND deleted_at IS NULL
          ORDER BY created_at ASC`,
        [actor.organizationId, projectId, taskId],
      );
      const approvals = await manager.query<ApprovalReadRow[]>(
        `SELECT id, request_number AS "requestNumber", state,
                approver_project_membership_id AS "approverProjectMembershipId",
                requested_at AS "requestedAt", resolved_at AS "resolvedAt",
                request_reason AS "requestReason", resolution_reason AS "resolutionReason"
           FROM task_approval_requests
          WHERE organization_id = $1 AND project_id = $2 AND task_id = $3
          ORDER BY request_number DESC`,
        [actor.organizationId, projectId, taskId],
      );
      return { ...task, checklist, comments, approvals };
    });
  }

  myTasks(actor: PostgresProjectActor, query: PostgresTaskQuery) {
    return this.transactions.run(async (manager) => {
      await this.requireActiveOrganizationMembership(manager, actor);
      const memberships = await manager.query<Array<{ projectId: string; id: string }>>(
        `SELECT project_id AS "projectId", id
           FROM project_memberships
          WHERE organization_id = $1 AND organization_membership_id = $2 AND removed_at IS NULL`,
        [actor.organizationId, actor.membershipId],
      );
      const result: TaskReadRow[] = [];
      for (const membership of memberships) {
        result.push(
          ...(await this.queryTasks(manager, actor.organizationId, membership.projectId, {
            ...query,
            assigneeProjectMembershipId: membership.id,
          })),
        );
      }
      return result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    });
  }

  approvalQueue(actor: PostgresProjectActor) {
    return this.transactions.run(async (manager) => {
      await this.requireActiveOrganizationMembership(manager, actor);
      return manager.query<ApprovalQueueReadRow[]>(
        `SELECT ar.id, ar.task_id AS "taskId", ar.project_id AS "projectId",
                ar.request_number AS "requestNumber", ar.request_reason AS "requestReason",
                ar.requested_at AS "requestedAt", t.title, t.priority_code AS "priorityCode",
                t.due_at AS "dueAt"
           FROM task_approval_requests ar
           JOIN project_memberships pm
             ON pm.organization_id = ar.organization_id
            AND pm.project_id = ar.project_id
            AND pm.id = ar.approver_project_membership_id
           JOIN tasks t
             ON t.organization_id = ar.organization_id AND t.project_id = ar.project_id AND t.id = ar.task_id
          WHERE ar.organization_id = $1 AND pm.organization_membership_id = $2
            AND pm.removed_at IS NULL AND ar.state = 'PENDING' AND t.archived_at IS NULL
          ORDER BY ar.requested_at ASC`,
        [actor.organizationId, actor.membershipId],
      );
    });
  }

  overview(actor: PostgresProjectActor, projectId: string, query: PostgresTaskQuery) {
    return this.list(actor, projectId, query).then((tasks) => this.summarize(tasks));
  }

  report(actor: PostgresProjectActor, projectId: string, query: PostgresTaskQuery) {
    return this.list(actor, projectId, query).then((tasks) => ({
      summary: this.summarize(tasks),
      workload: this.workload(tasks),
      tasks,
    }));
  }

  exportCsv(actor: PostgresProjectActor, projectId: string, query: PostgresTaskQuery) {
    return this.list(actor, projectId, query).then((tasks) => {
      const header = ['id', 'title', 'status', 'semanticCategory', 'team', 'priority', 'dueAt', 'effectiveProgress'];
      const lines = tasks.map((task) => [
        task.id,
        task.title,
        task.statusName,
        task.semanticCategory,
        task.owningTeamName,
        task.priorityCode,
        task.dueAt?.toISOString() ?? '',
        task.effectiveProgress,
      ].map(csvCell).join(','));
      return [header.join(','), ...lines].join('\n');
    });
  }

  private async queryTasks(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
    query: PostgresTaskQuery,
    taskId?: string,
  ): Promise<TaskReadRow[]> {
    const values: unknown[] = [organizationId, projectId];
    const where = ['t.organization_id = $1', 't.project_id = $2', 't.archived_at IS NULL'];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      where.push(clause.replace('?', `$${values.length}`));
    };
    if (taskId) add('t.id = ?', taskId);
    if (query.search?.trim()) {
      values.push(`%${query.search.trim()}%`);
      where.push(
        `(t.title ILIKE $${values.length} OR t.description ILIKE $${values.length})`,
      );
    }
    if (query.statusId) add('t.status_id = ?', query.statusId);
    if (query.teamId) add('t.owning_team_id = ?', query.teamId);
    if (query.priorityCode) add('t.priority_code = ?', query.priorityCode);
    if (query.dueFrom) add('t.due_at >= ?', query.dueFrom);
    if (query.dueTo) add('t.due_at <= ?', query.dueTo);
    if (query.assigneeProjectMembershipId) {
      add(`EXISTS (SELECT 1 FROM task_assignees filter_assignee
                    WHERE filter_assignee.organization_id = t.organization_id
                      AND filter_assignee.project_id = t.project_id
                      AND filter_assignee.task_id = t.id
                      AND filter_assignee.removed_at IS NULL
                      AND filter_assignee.project_membership_id = ?)`, query.assigneeProjectMembershipId);
    }
    const rows = await manager.query<TaskReadRow[]>(
      `SELECT t.id, t.project_id AS "projectId", t.owning_team_id AS "owningTeamId",
              team.name AS "owningTeamName", t.status_id AS "statusId", status.name AS "statusName",
              status.semantic_category AS "semanticCategory",
              t.creator_project_membership_id AS "creatorProjectMembershipId",
              t.title, t.description, t.priority_code AS "priorityCode", t.due_at AS "dueAt",
              t.manual_progress AS "manualProgress", t.requires_approval AS "requiresApproval",
              t.approver_project_membership_id AS "approverProjectMembershipId",
              t.created_at AS "createdAt", t.updated_at AS "updatedAt",
              CASE WHEN status.semantic_category = 'COMPLETED' THEN 100
                   WHEN COUNT(checklist.id) > 0 THEN FLOOR(100.0 * COUNT(checklist.id) FILTER (WHERE checklist.completed_at IS NOT NULL) / COUNT(checklist.id))::int
                   ELSE t.manual_progress END AS "effectiveProgress",
              COALESCE(array_agg(DISTINCT assignee.project_membership_id)
                FILTER (WHERE assignee.project_membership_id IS NOT NULL), '{}') AS "assigneeProjectMembershipIds"
         FROM tasks t
         JOIN project_task_statuses status ON status.organization_id = t.organization_id AND status.project_id = t.project_id AND status.id = t.status_id
         JOIN teams team ON team.organization_id = t.organization_id AND team.id = t.owning_team_id
         LEFT JOIN task_assignees assignee ON assignee.organization_id = t.organization_id AND assignee.project_id = t.project_id AND assignee.task_id = t.id AND assignee.removed_at IS NULL
         LEFT JOIN task_checklist_items checklist ON checklist.organization_id = t.organization_id AND checklist.project_id = t.project_id AND checklist.task_id = t.id AND checklist.removed_at IS NULL
        WHERE ${where.join(' AND ')}
        GROUP BY t.id, team.name, status.name, status.semantic_category
        ORDER BY t.updated_at DESC, t.created_at DESC`,
      values,
    );
    return rows.map((row) => ({ ...row, manualProgress: Number(row.manualProgress), effectiveProgress: Number(row.effectiveProgress) }));
  }

  private summarize(tasks: TaskReadRow[]) {
    const now = Date.now();
    return {
      total: tasks.length,
      completed: tasks.filter((task) => task.semanticCategory === 'COMPLETED').length,
      cancelled: tasks.filter((task) => task.semanticCategory === 'CANCELLED').length,
      overdue: tasks.filter((task) => task.dueAt && task.dueAt.getTime() < now && !['COMPLETED', 'CANCELLED'].includes(task.semanticCategory)).length,
      averageProgress: tasks.length ? Math.round(tasks.reduce((sum, task) => sum + task.effectiveProgress, 0) / tasks.length) : 0,
    };
  }

  private workload(tasks: TaskReadRow[]) {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (['COMPLETED', 'CANCELLED'].includes(task.semanticCategory)) continue;
      for (const id of task.assigneeProjectMembershipIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(
      ([projectMembershipId, activeTaskCount]) => ({
        projectMembershipId,
        activeTaskCount,
      }),
    );
  }

  private async requireActiveOrganizationMembership(manager: EntityManager, actor: PostgresProjectActor) {
    const membership = await new PostgresOrganizationMembershipRepository(manager).findActiveByIdForUpdate(actor.organizationId, actor.membershipId);
    if (!membership) throw new ForbiddenException('Active organization membership is required');
    return membership;
  }

  private async requireVisibleProject(manager: EntityManager, actor: PostgresProjectActor, projectId: string) {
    const project = await new PostgresProjectRepository(manager).findById(actor.organizationId, projectId);
    if (!project) throw new NotFoundException('Project not found');
    const organizationMembership = await this.requireActiveOrganizationMembership(manager, actor);
    if ([OrganizationRole.OWNER, OrganizationRole.ADMIN].includes(organizationMembership.role)) return;
    const projectMembership = await new PostgresProjectMembershipRepository(manager).findActiveByProjectAndOrganizationMembershipForUpdate(actor.organizationId, projectId, actor.membershipId);
    if (!projectMembership) throw new ForbiddenException('Active Project membership is required');
  }
}

function csvCell(value: string | number): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}
