import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import type { PostgresProjectActor } from './project.service';
import { ProjectModuleCode, ProjectRole, ProjectState } from '../persistence/typeorm/project.entities';
import { PostgresProjectMembershipRepository, PostgresProjectModuleSettingRepository, PostgresProjectRepository } from '../persistence/typeorm/project.repositories';
import { MilestoneEntity, MilestoneStatusCode } from '../persistence/typeorm/optional-module.entities';
import { PostgresMilestoneRepository } from '../persistence/typeorm/optional-module.repositories';
import { writePostgresActivity } from '../../collaboration/application/activity.writer';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';

export interface MilestoneInput { name: string; description?: string; dueDate: string; }

export class PostgresMilestoneService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  create(actor: PostgresProjectActor, projectId: string, input: MilestoneInput) {
    return this.transactions.run(async (manager) => {
      await this.requireManagerAndEnabled(manager, actor, projectId);
      const repo = new PostgresMilestoneRepository(manager);
      const saved = await repo.save(repo.create({ organizationId: actor.organizationId, projectId, name: requiredName(input.name), description: input.description?.trim() ?? '', dueDate: requiredDate(input.dueDate), statusCode: MilestoneStatusCode.OPEN, closedAt: null, archivedAt: null }));
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'MILESTONE_CREATED', subjectType: 'MILESTONE', subjectId: saved.id });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'MILESTONE_CREATED', targetType: 'MILESTONE', targetId: saved.id, afterData: { name: saved.name, dueDate: saved.dueDate } });
      return saved;
    });
  }

  update(actor: PostgresProjectActor, projectId: string, milestoneId: string, input: Partial<MilestoneInput>) {
    if (Object.values(input).every((value) => value === undefined)) throw new BadRequestException('At least one Milestone field is required');
    return this.transactions.run(async (manager) => {
      await this.requireManagerAndEnabled(manager, actor, projectId);
      const milestone = await this.requireMilestone(manager, actor.organizationId, projectId, milestoneId);
      if (milestone.statusCode === MilestoneStatusCode.CLOSED) throw new ConflictException('Reopen a closed Milestone before editing it');
      if (input.name !== undefined) milestone.name = requiredName(input.name);
      if (input.description !== undefined) milestone.description = input.description.trim();
      if (input.dueDate !== undefined) milestone.dueDate = requiredDate(input.dueDate);
      const saved = await new PostgresMilestoneRepository(manager).save(milestone);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'MILESTONE_UPDATED', subjectType: 'MILESTONE', subjectId: saved.id });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'MILESTONE_UPDATED', targetType: 'MILESTONE', targetId: saved.id, afterData: { name: saved.name, dueDate: saved.dueDate } });
      return saved;
    });
  }

  close(actor: PostgresProjectActor, projectId: string, milestoneId: string) { return this.setClosed(actor, projectId, milestoneId, true); }
  reopen(actor: PostgresProjectActor, projectId: string, milestoneId: string) { return this.setClosed(actor, projectId, milestoneId, false); }

  list(actor: PostgresProjectActor, projectId: string) {
    return this.transactions.run(async (manager) => {
      await this.requireProjectMember(manager, actor, projectId);
      const rows = await manager.getRepository(MilestoneEntity).find({ where: { organizationId: actor.organizationId, projectId }, order: { dueDate: 'ASC' } });
      return Promise.all(rows.map(async (milestone) => ({ ...milestone, progress: await this.progress(manager, actor.organizationId, projectId, milestone.id) })));
    });
  }

  private async setClosed(actor: PostgresProjectActor, projectId: string, milestoneId: string, closed: boolean) {
    return this.transactions.run(async (manager) => {
      await this.requireManagerAndEnabled(manager, actor, projectId);
      const milestone = await this.requireMilestone(manager, actor.organizationId, projectId, milestoneId);
      if ((milestone.statusCode === MilestoneStatusCode.CLOSED) === closed) throw new ConflictException(closed ? 'Milestone is already closed' : 'Milestone is already open');
      milestone.statusCode = closed ? MilestoneStatusCode.CLOSED : MilestoneStatusCode.OPEN;
      milestone.closedAt = closed ? new Date() : null;
      const saved = await new PostgresMilestoneRepository(manager).save(milestone);
      const actionCode = closed ? 'MILESTONE_CLOSED' : 'MILESTONE_REOPENED';
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode, subjectType: 'MILESTONE', subjectId: saved.id });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode, targetType: 'MILESTONE', targetId: saved.id, afterData: { statusCode: saved.statusCode } });
      return saved;
    });
  }

  private async progress(manager: EntityManager, organizationId: string, projectId: string, milestoneId: string) {
    const [row] = await manager.query(`SELECT count(*)::int AS "taskCount", coalesce(round(avg(manual_progress)), 0)::int AS "percent" FROM tasks WHERE organization_id = $1 AND project_id = $2 AND milestone_id = $3 AND archived_at IS NULL`, [organizationId, projectId, milestoneId]);
    return { taskCount: row.taskCount, percent: row.percent };
  }
  private async requireMilestone(manager: EntityManager, organizationId: string, projectId: string, id: string) { const milestone = await new PostgresMilestoneRepository(manager).findByIdForUpdate(organizationId, projectId, id); if (!milestone) throw new NotFoundException('Milestone not found'); return milestone; }
  private async requireProjectMember(manager: EntityManager, actor: PostgresProjectActor, projectId: string) { const project = await new PostgresProjectRepository(manager).findByIdForUpdate(actor.organizationId, projectId); if (!project) throw new NotFoundException('Project not found'); const membership = await new PostgresProjectMembershipRepository(manager).findActiveByProjectAndOrganizationMembershipForUpdate(actor.organizationId, projectId, actor.membershipId); if (!membership) throw new ForbiddenException('Active Project membership is required'); return { project, membership }; }
  private async requireManagerAndEnabled(manager: EntityManager, actor: PostgresProjectActor, projectId: string) { const { project, membership } = await this.requireProjectMember(manager, actor, projectId); if (project.state === ProjectState.COMPLETED || project.state === ProjectState.ARCHIVED) throw new ConflictException('Completed and archived projects are read-only'); if (membership.role !== ProjectRole.PROJECT_MANAGER) throw new ForbiddenException('An active Project Manager is required'); const setting = await new PostgresProjectModuleSettingRepository(manager).findByProjectAndCodeForUpdate(actor.organizationId, projectId, ProjectModuleCode.MILESTONES); if (!setting?.enabled) throw new ConflictException('Project module is disabled'); }
}

function requiredName(value: string) { const normalized = value?.trim(); if (!normalized) throw new BadRequestException('Milestone name is required'); return normalized; }
function requiredDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Milestone dueDate must be a date'); return value; }
