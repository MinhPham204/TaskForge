import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
} from '../../onboarding/persistence/typeorm/onboarding.entities';
import type { PostgresProjectActor } from '../../projects/application/project.service';

export type PostgresSearchResultKind = 'PROJECT' | 'TASK' | 'TEAM';

export interface PostgresSearchResult {
  kind: PostgresSearchResultKind;
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  updatedAt: Date;
}

/**
 * Tenant-scoped command-palette projection. It intentionally returns only
 * resources whose current visibility is proven in this query; clients must
 * still use the owning resource endpoint as the mutation authority.
 */
export class PostgresGlobalSearchService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  search(
    actor: PostgresProjectActor,
    input: { query: string; limit?: number },
  ): Promise<{
    query: string;
    results: PostgresSearchResult[];
    quickCreate: {
      canCreateProject: boolean;
      canCreateTeam: boolean;
      taskProjectIds: string[];
    };
  }> {
    const query = input.query.trim();
    if (!query) throw new BadRequestException('Search query is required');
    const limit = input.limit ?? 8;

    return this.transactions.read(async (manager) => {
      const membership = await manager.getRepository(OrganizationMembershipEntity).findOneBy({
        id: actor.membershipId,
        organizationId: actor.organizationId,
        state: OrganizationMembershipState.ACTIVE,
      });
      if (!membership) {
        throw new ForbiddenException('Active organization membership is required');
      }
      const canManageOrganization = [
        OrganizationRole.OWNER,
        OrganizationRole.ADMIN,
      ].includes(membership.role);
      const pattern = `%${query}%`;
      const visibleProjectSql = canManageOrganization
        ? `SELECT project.id
             FROM projects project
            WHERE project.organization_id = $1 AND project.archived_at IS NULL`
        : `SELECT project.id
             FROM projects project
             JOIN project_memberships project_membership
               ON project_membership.organization_id = project.organization_id
              AND project_membership.project_id = project.id
              AND project_membership.organization_membership_id = $2
              AND project_membership.removed_at IS NULL
            WHERE project.organization_id = $1 AND project.archived_at IS NULL`;

      const [projects, tasks, teams, taskProjectIds] = await Promise.all([
        this.searchProjects(manager, visibleProjectSql, pattern, limit, actor),
        this.searchTasks(manager, visibleProjectSql, pattern, limit, actor),
        this.searchTeams(manager, pattern, limit, actor.organizationId),
        this.listTaskCreationProjects(manager, actor),
      ]);

      return {
        query,
        results: [...projects, ...tasks, ...teams],
        quickCreate: {
          canCreateProject: canManageOrganization,
          canCreateTeam: canManageOrganization,
          taskProjectIds,
        },
      };
    });
  }

  private searchProjects(
    manager: EntityManager,
    visibleProjectSql: string,
    pattern: string,
    limit: number,
    actor: PostgresProjectActor,
  ): Promise<PostgresSearchResult[]> {
    return manager.query<PostgresSearchResult[]>(
      `SELECT 'PROJECT' AS kind, project.id, project.id AS "projectId", project.name AS title,
              NULLIF(project.description, '') AS description, project.updated_at AS "updatedAt"
         FROM projects project
        WHERE project.id IN (${visibleProjectSql})
          AND (project.name ILIKE $3 OR project.description ILIKE $3)
        ORDER BY project.updated_at DESC, project.created_at DESC
        LIMIT $4`,
      [actor.organizationId, actor.membershipId, pattern, limit],
    );
  }

  private searchTasks(
    manager: EntityManager,
    visibleProjectSql: string,
    pattern: string,
    limit: number,
    actor: PostgresProjectActor,
  ): Promise<PostgresSearchResult[]> {
    return manager.query<PostgresSearchResult[]>(
      `SELECT 'TASK' AS kind, task.id, task.project_id AS "projectId", task.title,
              NULLIF(task.description, '') AS description, task.updated_at AS "updatedAt"
         FROM tasks task
        WHERE task.organization_id = $1 AND task.archived_at IS NULL
          AND task.project_id IN (${visibleProjectSql})
          AND (task.title ILIKE $3 OR task.description ILIKE $3)
        ORDER BY task.updated_at DESC, task.created_at DESC
        LIMIT $4`,
      [actor.organizationId, actor.membershipId, pattern, limit],
    );
  }

  private searchTeams(
    manager: EntityManager,
    pattern: string,
    limit: number,
    organizationId: string,
  ): Promise<PostgresSearchResult[]> {
    return manager.query<PostgresSearchResult[]>(
      `SELECT 'TEAM' AS kind, team.id, NULL::uuid AS "projectId", team.name AS title,
              NULLIF(team.description, '') AS description, team.updated_at AS "updatedAt"
         FROM teams team
        WHERE team.organization_id = $1 AND team.archived_at IS NULL
          AND (team.name ILIKE $2 OR team.description ILIKE $2)
        ORDER BY team.updated_at DESC, team.created_at DESC
        LIMIT $3`,
      [organizationId, pattern, limit],
    );
  }

  private async listTaskCreationProjects(
    manager: EntityManager,
    actor: PostgresProjectActor,
  ): Promise<string[]> {
    const rows = await manager.query<Array<{ projectId: string }>>(
      `SELECT project_membership.project_id AS "projectId"
         FROM project_memberships project_membership
         JOIN projects project
           ON project.organization_id = project_membership.organization_id
          AND project.id = project_membership.project_id
        WHERE project_membership.organization_id = $1
          AND project_membership.organization_membership_id = $2
          AND project_membership.role = 'PROJECT_MANAGER'
          AND project_membership.removed_at IS NULL
          AND project.archived_at IS NULL
        ORDER BY project_membership.added_at ASC`,
      [actor.organizationId, actor.membershipId],
    );
    return rows.map((row) => row.projectId);
  }
}
