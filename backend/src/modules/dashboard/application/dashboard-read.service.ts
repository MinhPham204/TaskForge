import { ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import {
  OrganizationMembershipState,
} from '../../onboarding/persistence/typeorm/onboarding.entities';
import type { PostgresProjectActor } from '../../projects/application/project.service';
import { PostgresOrganizationPermissionService } from '../../onboarding/application/organization-permission.service';

export interface DashboardTaskRow {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  priorityCode: string;
  dueAt: Date | null;
  statusName: string;
  semanticCategory: string;
  effectiveProgress: number;
  updatedAt: Date;
}

export interface DashboardApprovalRow {
  id: string;
  taskId: string;
  projectId: string;
  projectName: string;
  title: string;
  priorityCode: string;
  dueAt: Date | null;
  requestedAt: Date;
}

export interface DashboardProjectRow {
  id: string;
  name: string;
  state: string;
  dueDate: string | null;
  updatedAt: Date;
}

/**
 * Tenant-scoped personal Dashboard projection. This intentionally owns only
 * read composition; Task, Project and Milestone mutations remain in their
 * existing domain services.
 */
export class PostgresDashboardReadService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  read(actor: PostgresProjectActor) {
    return this.transactions.read(async (manager) => {
      const membership = await this.requireActiveOrganizationMembership(
        manager,
        actor,
      );
      const capabilities = await new PostgresOrganizationPermissionService(manager).resolve(membership.userId, actor.organizationId);
      const isOrganizationAdministrator = capabilities.permissions.includes('org.projects.read_all');
      const visibleProjects = await this.visibleProjects(
        manager,
        actor,
        isOrganizationAdministrator,
      );
      const visibleProjectIds = visibleProjects.map((project) => project.id);

      const [assignedTasks, pendingApprovals, calendarTasks, milestones] =
        await Promise.all([
          this.assignedTasks(manager, actor),
          this.pendingApprovals(manager, actor, visibleProjectIds),
          this.calendarTasks(manager, actor.organizationId, visibleProjectIds),
          this.calendarMilestones(
            manager,
            actor.organizationId,
            visibleProjectIds,
          ),
        ]);

      return {
        generatedAt: new Date(),
        focus: summarizeAssignedTasks(assignedTasks),
        assignedTasks,
        pendingApprovals,
        recentProjects: visibleProjects.slice(0, 6),
        calendarItems: [...calendarTasks, ...milestones].sort(compareCalendar),
      };
    });
  }

  private async requireActiveOrganizationMembership(
    manager: EntityManager,
    actor: PostgresProjectActor,
  ): Promise<{ userId: string }> {
    const membership = await manager.query<
      Array<{ userId: string }>
    >(
      `SELECT user_id AS "userId"
         FROM organization_memberships
        WHERE organization_id = $1 AND id = $2 AND state = $3`,
      [
        actor.organizationId,
        actor.membershipId,
        OrganizationMembershipState.ACTIVE,
      ],
    );
    if (!membership[0]) {
      throw new ForbiddenException('Active organization membership is required');
    }
    return membership[0];
  }

  private visibleProjects(
    manager: EntityManager,
    actor: PostgresProjectActor,
    isOrganizationAdministrator: boolean,
  ): Promise<DashboardProjectRow[]> {
    return manager.query<DashboardProjectRow[]>(
      `SELECT p.id, p.name, p.state, p.due_date AS "dueDate", p.updated_at AS "updatedAt"
         FROM projects p
        WHERE p.organization_id = $1
          AND p.archived_at IS NULL
          AND ($3::boolean OR EXISTS (
            SELECT 1
              FROM project_memberships pm
             WHERE pm.organization_id = p.organization_id
               AND pm.project_id = p.id
               AND pm.organization_membership_id = $2
               AND pm.removed_at IS NULL
          ))
        ORDER BY p.updated_at DESC, p.created_at DESC`,
      [actor.organizationId, actor.membershipId, isOrganizationAdministrator],
    );
  }

  private assignedTasks(
    manager: EntityManager,
    actor: PostgresProjectActor,
  ): Promise<DashboardTaskRow[]> {
    return manager.query<DashboardTaskRow[]>(
      `SELECT t.id, t.project_id AS "projectId", p.name AS "projectName", t.title,
              t.priority_code AS "priorityCode", t.due_at AS "dueAt",
              status.name AS "statusName", status.semantic_category AS "semanticCategory",
              CASE WHEN status.semantic_category = 'COMPLETED' THEN 100
                   WHEN COUNT(checklist.id) > 0 THEN FLOOR(100.0 * COUNT(checklist.id) FILTER (WHERE checklist.completed_at IS NOT NULL) / COUNT(checklist.id))::int
                   ELSE t.manual_progress END AS "effectiveProgress",
              t.updated_at AS "updatedAt"
         FROM task_assignees assignee
         JOIN project_memberships pm
           ON pm.organization_id = assignee.organization_id
          AND pm.project_id = assignee.project_id
          AND pm.id = assignee.project_membership_id
          AND pm.removed_at IS NULL
         JOIN tasks t
           ON t.organization_id = assignee.organization_id
          AND t.project_id = assignee.project_id
          AND t.id = assignee.task_id
         JOIN projects p ON p.organization_id = t.organization_id AND p.id = t.project_id
         JOIN project_task_statuses status
           ON status.organization_id = t.organization_id AND status.project_id = t.project_id AND status.id = t.status_id
         LEFT JOIN task_checklist_items checklist
           ON checklist.organization_id = t.organization_id AND checklist.project_id = t.project_id AND checklist.task_id = t.id AND checklist.removed_at IS NULL
        WHERE assignee.organization_id = $1
          AND pm.organization_membership_id = $2
          AND assignee.removed_at IS NULL
          AND t.archived_at IS NULL
          AND p.archived_at IS NULL
        GROUP BY t.id, p.name, status.name, status.semantic_category
        ORDER BY t.due_at ASC NULLS LAST, t.updated_at DESC`,
      [actor.organizationId, actor.membershipId],
    );
  }

  private pendingApprovals(
    manager: EntityManager,
    actor: PostgresProjectActor,
    visibleProjectIds: string[],
  ): Promise<DashboardApprovalRow[]> {
    if (!visibleProjectIds.length) return Promise.resolve([]);
    return manager.query<DashboardApprovalRow[]>(
      `SELECT ar.id, ar.task_id AS "taskId", ar.project_id AS "projectId",
              p.name AS "projectName", t.title, t.priority_code AS "priorityCode",
              t.due_at AS "dueAt", ar.requested_at AS "requestedAt"
         FROM task_approval_requests ar
         JOIN project_memberships pm
           ON pm.organization_id = ar.organization_id AND pm.project_id = ar.project_id AND pm.id = ar.approver_project_membership_id
         JOIN tasks t ON t.organization_id = ar.organization_id AND t.project_id = ar.project_id AND t.id = ar.task_id
         JOIN projects p ON p.organization_id = ar.organization_id AND p.id = ar.project_id
        WHERE ar.organization_id = $1
          AND pm.organization_membership_id = $2
          AND pm.removed_at IS NULL
          AND ar.project_id = ANY($3::uuid[])
          AND ar.state = 'PENDING'
          AND t.archived_at IS NULL
          AND p.archived_at IS NULL
        ORDER BY ar.requested_at ASC`,
      [actor.organizationId, actor.membershipId, visibleProjectIds],
    );
  }

  private calendarTasks(
    manager: EntityManager,
    organizationId: string,
    visibleProjectIds: string[],
  ) {
    if (!visibleProjectIds.length) return Promise.resolve([]);
    return manager.query<
      Array<{
        type: 'TASK';
        id: string;
        projectId: string;
        projectName: string;
        title: string;
        date: Date;
        semanticCategory: string;
      }>
    >(
      `SELECT 'TASK' AS type, t.id, t.project_id AS "projectId", p.name AS "projectName",
              t.title, t.due_at AS date, status.semantic_category AS "semanticCategory"
         FROM tasks t
         JOIN projects p ON p.organization_id = t.organization_id AND p.id = t.project_id
         JOIN project_task_statuses status ON status.organization_id = t.organization_id AND status.project_id = t.project_id AND status.id = t.status_id
        WHERE t.organization_id = $1
          AND t.project_id = ANY($2::uuid[])
          AND t.archived_at IS NULL
          AND p.archived_at IS NULL
          AND t.due_at IS NOT NULL
        ORDER BY t.due_at ASC`,
      [organizationId, visibleProjectIds],
    );
  }

  private calendarMilestones(
    manager: EntityManager,
    organizationId: string,
    visibleProjectIds: string[],
  ) {
    if (!visibleProjectIds.length) return Promise.resolve([]);
    return manager.query<
      Array<{
        type: 'MILESTONE';
        id: string;
        projectId: string;
        projectName: string;
        title: string;
        date: string;
        statusCode: string;
      }>
    >(
      `SELECT 'MILESTONE' AS type, m.id, m.project_id AS "projectId", p.name AS "projectName",
              m.name AS title, m.due_date AS date, m.status_code AS "statusCode"
         FROM milestones m
         JOIN projects p ON p.organization_id = m.organization_id AND p.id = m.project_id
        WHERE m.organization_id = $1
          AND m.project_id = ANY($2::uuid[])
          AND m.archived_at IS NULL
          AND p.archived_at IS NULL
        ORDER BY m.due_date ASC`,
      [organizationId, visibleProjectIds],
    );
  }
}

function summarizeAssignedTasks(tasks: DashboardTaskRow[]) {
  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
  const activeTasks = tasks.filter(
    (task) =>
      task.semanticCategory !== 'COMPLETED' &&
      task.semanticCategory !== 'CANCELLED',
  );
  return {
    total: tasks.length,
    active: activeTasks.length,
    completed: tasks.filter(
      (task) => task.semanticCategory === 'COMPLETED',
    ).length,
    cancelled: tasks.filter(
      (task) => task.semanticCategory === 'CANCELLED',
    ).length,
    overdue: activeTasks.filter((task) => task.dueAt && task.dueAt < now)
      .length,
    dueToday: activeTasks.filter(
      (task) =>
        task.dueAt && task.dueAt >= startOfToday && task.dueAt < startOfTomorrow,
    ).length,
    upcoming: activeTasks.filter((task) => task.dueAt && task.dueAt >= startOfTomorrow)
      .length,
  };
}

function compareCalendar(
  left: { date: Date | string },
  right: { date: Date | string },
) {
  return new Date(left.date).getTime() - new Date(right.date).getTime();
}
