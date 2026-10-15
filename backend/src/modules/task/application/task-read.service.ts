import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { withErrorCode } from '../../../common/http/coded-error';
import {
  activeTaskIdentity,
  ACTIVE_TASK_IDENTITY,
} from '../domain/task-membership';
import { taskCapabilities, type TaskCapabilities } from '../domain/task-policy';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import { PostgresOrganizationMembershipRepository } from '../../onboarding/persistence/typeorm/onboarding.repositories';
import { PostgresOrganizationPermissionService } from '../../onboarding/application/organization-permission.service';
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
  milestoneId: string | null;
  capabilities: TaskCapabilities;
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
  requestedByMembershipId: string;
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

  list(
    actor: PostgresProjectActor,
    projectId: string,
    query: PostgresTaskQuery,
  ) {
    return this.transactions.read(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      return this.queryTasks(manager, actor, projectId, query);
    });
  }

  assignmentCandidates(
    actor: PostgresProjectActor,
    projectId: string,
    teamId: string,
  ) {
    return this.transactions.read(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      return manager.query<
        Array<{
          projectMembershipId: string;
          organizationMembershipId: string;
          userId: string;
          name: string;
          role: string;
        }>
      >(
        `SELECT pm.id AS "projectMembershipId", pm.organization_membership_id AS "organizationMembershipId",
                u.id AS "userId", u.name, pm.role
           FROM project_memberships pm
           JOIN organization_memberships om ON om.organization_id = pm.organization_id AND om.id = pm.organization_membership_id
           JOIN users u ON u.id = om.user_id
           JOIN team_members tm ON tm.organization_id = pm.organization_id AND tm.organization_membership_id = om.id AND tm.team_id = $3 AND tm.removed_at IS NULL
           JOIN teams t ON t.organization_id = tm.organization_id AND t.id = tm.team_id AND t.archived_at IS NULL
           JOIN project_teams pt ON pt.organization_id = pm.organization_id AND pt.project_id = pm.project_id AND pt.team_id = tm.team_id AND pt.removed_at IS NULL
          WHERE pm.organization_id = $1 AND pm.project_id = $2 AND pm.removed_at IS NULL AND ${ACTIVE_TASK_IDENTITY}
          ORDER BY u.name, pm.id`,
        [actor.organizationId, projectId, teamId],
      );
    });
  }

  board(
    actor: PostgresProjectActor,
    projectId: string,
    query: PostgresTaskQuery,
  ) {
    return this.transactions.read(async (manager) => {
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
      const tasks = await this.queryTasks(manager, actor, projectId, query);
      return statuses.map((status) => ({
        ...status,
        tasks: tasks.filter((task) => task.statusId === status.id),
      }));
    });
  }

  detail(actor: PostgresProjectActor, projectId: string, taskId: string) {
    return this.transactions.read(async (manager) => {
      await this.requireVisibleProject(manager, actor, projectId);
      const tasks = await this.queryTasks(
        manager,
        actor,
        projectId,
        {},
        taskId,
      );
      const task = tasks[0];
      if (!task)
        throw withErrorCode(
          new NotFoundException('Task not found'),
          'RESOURCE_NOT_FOUND',
        );
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
                requested_by_membership_id AS "requestedByMembershipId",
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
    return this.transactions.read(async (manager) => {
      await this.requireActiveOrganizationMembership(manager, actor);
      return this.queryTasks(manager, actor, undefined, query, undefined, true);
    });
  }

  approvalQueue(actor: PostgresProjectActor) {
    return this.transactions.read(async (manager) => {
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

  overview(
    actor: PostgresProjectActor,
    projectId: string,
    query: PostgresTaskQuery,
  ) {
    return this.list(actor, projectId, query).then((tasks) =>
      this.summarize(tasks),
    );
  }

  report(
    actor: PostgresProjectActor,
    projectId: string,
    query: PostgresTaskQuery,
  ) {
    return this.list(actor, projectId, query).then((tasks) => ({
      summary: this.summarize(tasks),
      workload: this.workload(tasks),
      tasks,
    }));
  }

  exportCsv(
    actor: PostgresProjectActor,
    projectId: string,
    query: PostgresTaskQuery,
  ) {
    return this.list(actor, projectId, query).then((tasks) => {
      const header = [
        'id',
        'title',
        'status',
        'semanticCategory',
        'team',
        'priority',
        'dueAt',
        'effectiveProgress',
      ];
      const lines = tasks.map((task) =>
        [
          task.id,
          task.title,
          task.statusName,
          task.semanticCategory,
          task.owningTeamName,
          task.priorityCode,
          task.dueAt?.toISOString() ?? '',
          task.effectiveProgress,
        ]
          .map(csvCell)
          .join(','),
      );
      return [header.join(','), ...lines].join('\n');
    });
  }

  private async queryTasks(
    manager: EntityManager,
    actor: PostgresProjectActor,
    projectId: string | undefined,
    query: PostgresTaskQuery,
    taskId?: string,
    onlyAssignedToActor = false,
  ): Promise<TaskReadRow[]> {
    const values: unknown[] = [actor.organizationId, actor.membershipId];
    const where = ['t.organization_id = $1', 't.archived_at IS NULL'];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      where.push(clause.replace('?', `$${values.length}`));
    };
    if (projectId) add('t.project_id = ?', projectId);
    if (onlyAssignedToActor)
      where.push(
        `EXISTS (SELECT 1 FROM task_assignees mine WHERE mine.organization_id = t.organization_id AND mine.project_id = t.project_id AND mine.task_id = t.id AND mine.removed_at IS NULL AND mine.project_membership_id = actor_member.id)`,
      );
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
    if (query.assigneeProjectMembershipId && !onlyAssignedToActor) {
      add(
        `EXISTS (SELECT 1 FROM task_assignees filter_assignee
                    WHERE filter_assignee.organization_id = t.organization_id
                      AND filter_assignee.project_id = t.project_id
                      AND filter_assignee.task_id = t.id
                      AND filter_assignee.removed_at IS NULL
                      AND filter_assignee.project_membership_id = ?)`,
        query.assigneeProjectMembershipId,
      );
    }
    const rows = await manager.query<
      Array<
        Omit<TaskReadRow, 'capabilities'> & {
          _projectState: string;
          _actorId: string | null;
          _actorRole: string | null;
          _checklistCount: number;
          _pendingApproval: boolean;
        }
      >
    >(
      `SELECT t.id, t.project_id AS "projectId", t.owning_team_id AS "owningTeamId",
              team.name AS "owningTeamName", t.status_id AS "statusId", status.name AS "statusName",
              status.semantic_category AS "semanticCategory",
              t.creator_project_membership_id AS "creatorProjectMembershipId",
              t.title, t.description, t.priority_code AS "priorityCode", t.due_at AS "dueAt",
              t.milestone_id AS "milestoneId", t.manual_progress AS "manualProgress", t.requires_approval AS "requiresApproval",
              t.approver_project_membership_id AS "approverProjectMembershipId",
              t.created_at AS "createdAt", t.updated_at AS "updatedAt",
              project.state AS "_projectState", actor_member.id AS "_actorId", actor_member.role AS "_actorRole",
              COUNT(DISTINCT checklist.id)::int AS "_checklistCount",
              EXISTS (SELECT 1 FROM task_approval_requests pending WHERE pending.organization_id = t.organization_id AND pending.project_id = t.project_id AND pending.task_id = t.id AND pending.state = 'PENDING') AS "_pendingApproval",
              CASE WHEN status.semantic_category = 'COMPLETED' THEN 100
                   WHEN COUNT(checklist.id) > 0 THEN FLOOR(100.0 * COUNT(checklist.id) FILTER (WHERE checklist.completed_at IS NOT NULL) / COUNT(checklist.id))::int
                   ELSE t.manual_progress END AS "effectiveProgress",
              COALESCE(array_agg(DISTINCT assignee.project_membership_id)
                FILTER (WHERE assignee.project_membership_id IS NOT NULL), '{}') AS "assigneeProjectMembershipIds"
         FROM tasks t
         JOIN projects project ON project.organization_id = t.organization_id AND project.id = t.project_id
         LEFT JOIN project_memberships actor_member ON actor_member.organization_id = t.organization_id AND actor_member.project_id = t.project_id AND actor_member.organization_membership_id = $2 AND actor_member.removed_at IS NULL
         JOIN project_task_statuses status ON status.organization_id = t.organization_id AND status.project_id = t.project_id AND status.id = t.status_id
         JOIN teams team ON team.organization_id = t.organization_id AND team.id = t.owning_team_id
         LEFT JOIN task_assignees assignee ON assignee.organization_id = t.organization_id AND assignee.project_id = t.project_id AND assignee.task_id = t.id AND assignee.removed_at IS NULL
         LEFT JOIN task_checklist_items checklist ON checklist.organization_id = t.organization_id AND checklist.project_id = t.project_id AND checklist.task_id = t.id AND checklist.removed_at IS NULL
        WHERE ${where.join(' AND ')}
        GROUP BY t.id, team.name, status.name, status.semantic_category, project.state, actor_member.id, actor_member.role
        ORDER BY t.updated_at DESC, t.created_at DESC, t.id ASC`,
      values,
    );
    return rows.map(
      ({
        _projectState,
        _actorId,
        _actorRole,
        _checklistCount,
        _pendingApproval,
        ...row
      }) => ({
        ...row,
        manualProgress: Number(row.manualProgress),
        effectiveProgress: Number(row.effectiveProgress),
        capabilities: taskCapabilities({
          projectState: _projectState,
          archivedAt: null,
          actorProjectMembershipId: _actorId,
          actorProjectRole: _actorRole,
          creatorProjectMembershipId: row.creatorProjectMembershipId,
          assigneeProjectMembershipIds: row.assigneeProjectMembershipIds,
          semanticCategory: row.semanticCategory,
          checklistItemCount: Number(_checklistCount),
          hasPendingApproval: _pendingApproval,
        }),
      }),
    );
  }

  private summarize(tasks: TaskReadRow[]) {
    const now = Date.now();
    return {
      total: tasks.length,
      completed: tasks.filter((task) => task.semanticCategory === 'COMPLETED')
        .length,
      cancelled: tasks.filter((task) => task.semanticCategory === 'CANCELLED')
        .length,
      overdue: tasks.filter(
        (task) =>
          task.dueAt &&
          task.dueAt.getTime() < now &&
          !['COMPLETED', 'CANCELLED'].includes(task.semanticCategory),
      ).length,
      averageProgress: tasks.length
        ? Math.round(
            tasks.reduce((sum, task) => sum + task.effectiveProgress, 0) /
              tasks.length,
          )
        : 0,
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

  private async requireActiveOrganizationMembership(
    manager: EntityManager,
    actor: PostgresProjectActor,
  ) {
    const membership = await new PostgresOrganizationMembershipRepository(
      manager,
    ).findActiveById(actor.organizationId, actor.membershipId);
    if (
      !membership ||
      !(await activeTaskIdentity(
        manager,
        actor.organizationId,
        actor.membershipId,
      ))
    )
      throw withErrorCode(
        new ForbiddenException('Active organization membership is required'),
        'TENANT_MEMBERSHIP_REQUIRED',
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
      throw withErrorCode(
        new NotFoundException('Project not found'),
        'RESOURCE_NOT_FOUND',
      );
    const organizationMembership =
      await this.requireActiveOrganizationMembership(manager, actor);
    const capabilities = await new PostgresOrganizationPermissionService(
      manager,
    ).resolve(organizationMembership.userId, actor.organizationId);
    if (capabilities.permissions.includes('org.projects.read_all')) return;
    const projectMembership = await new PostgresProjectMembershipRepository(
      manager,
    ).findActiveByProjectAndOrganizationMembership(
      actor.organizationId,
      projectId,
      actor.membershipId,
    );
    if (!projectMembership)
      throw withErrorCode(
        new ForbiddenException('Active Project membership is required'),
        'PROJECT_MEMBERSHIP_REQUIRED',
      );
  }
}

function csvCell(value: string | number): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}
