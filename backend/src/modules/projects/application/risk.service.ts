import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import type { PostgresProjectActor } from './project.service';
import { ProjectModuleCode, ProjectRole, ProjectState } from '../persistence/typeorm/project.entities';
import { PostgresProjectMembershipRepository, PostgresProjectModuleSettingRepository, PostgresProjectRepository } from '../persistence/typeorm/project.repositories';
import { RiskEntity, RiskScaleCode, RiskState } from '../persistence/typeorm/optional-module.entities';
import { PostgresRiskRepository, PostgresRiskTaskLinkRepository } from '../persistence/typeorm/optional-module.repositories';
import { PostgresTaskRepository } from '../../task/persistence/typeorm/task.repositories';
import { OrganizationMembershipEntity } from '../../onboarding/persistence/typeorm/onboarding.entities';
import { writePostgresActivity } from '../../collaboration/application/activity.writer';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';
import { PostgresNotificationService } from '../../collaboration/application/notification.service';

export interface RiskInput {
  title: string;
  description?: string;
  likelihoodCode: RiskScaleCode;
  impactCode: RiskScaleCode;
  ownerProjectMembershipId: string;
  mitigation?: string;
  state?: RiskState;
}

export class PostgresRiskService {
  constructor(
    private readonly transactions: PostgresTransactionRunner,
    private readonly notifications?: PostgresNotificationService,
  ) {}

  list(actor: PostgresProjectActor, projectId: string) {
    return this.transactions.run(async (manager) => {
      await this.requireProjectMember(manager, actor, projectId);
      return manager.getRepository(RiskEntity).find({
        where: { organizationId: actor.organizationId, projectId, archivedAt: IsNull() },
        order: { createdAt: 'DESC' },
      });
    });
  }

  async create(actor: PostgresProjectActor, projectId: string, input: RiskInput) {
    const result = await this.transactions.run(async (manager) => {
      await this.requireManagerAndEnabled(manager, actor, projectId);
      const owner = await this.requireActiveOwner(manager, actor.organizationId, projectId, input.ownerProjectMembershipId);
      const risks = new PostgresRiskRepository(manager);
      const risk = await risks.save(risks.create({
        organizationId: actor.organizationId,
        projectId,
        title: requiredText(input.title, 'Risk title'),
        description: input.description?.trim() ?? '',
        likelihoodCode: input.likelihoodCode,
        impactCode: input.impactCode,
        ownerProjectMembershipId: input.ownerProjectMembershipId,
        mitigation: input.mitigation?.trim() ?? '',
        state: input.state ?? RiskState.OPEN,
        archivedAt: null,
      }));
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'RISK_CREATED', subjectType: 'RISK', subjectId: risk.id });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'RISK_CREATED', targetType: 'RISK', targetId: risk.id, afterData: { title: risk.title, state: risk.state } });
      return { risk, ownerUserId: await this.ownerUserId(manager, actor.organizationId, owner.organizationMembershipId) };
    });
    await this.notifyOwner(actor.organizationId, projectId, result.ownerUserId, result.risk, 'RISK_CREATED');
    return result.risk;
  }

  async update(actor: PostgresProjectActor, projectId: string, riskId: string, input: Partial<RiskInput>) {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException('At least one Risk field is required');
    }
    const result = await this.transactions.run(async (manager) => {
      await this.requireManagerAndEnabled(manager, actor, projectId);
      const risk = await this.findRisk(manager, actor.organizationId, projectId, riskId);
      let owner = await this.requireActiveOwner(manager, actor.organizationId, projectId, risk.ownerProjectMembershipId);
      if (input.ownerProjectMembershipId !== undefined) {
        owner = await this.requireActiveOwner(manager, actor.organizationId, projectId, input.ownerProjectMembershipId);
        risk.ownerProjectMembershipId = input.ownerProjectMembershipId;
      }
      if (input.title !== undefined) risk.title = requiredText(input.title, 'Risk title');
      if (input.description !== undefined) risk.description = input.description.trim();
      if (input.likelihoodCode !== undefined) risk.likelihoodCode = input.likelihoodCode;
      if (input.impactCode !== undefined) risk.impactCode = input.impactCode;
      if (input.mitigation !== undefined) risk.mitigation = input.mitigation.trim();
      if (input.state !== undefined) risk.state = input.state;
      const saved = await new PostgresRiskRepository(manager).save(risk);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'RISK_UPDATED', subjectType: 'RISK', subjectId: saved.id, safeMetadata: { state: saved.state } });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'RISK_UPDATED', targetType: 'RISK', targetId: saved.id, afterData: { state: saved.state } });
      return { risk: saved, ownerUserId: await this.ownerUserId(manager, actor.organizationId, owner.organizationMembershipId) };
    });
    await this.notifyOwner(actor.organizationId, projectId, result.ownerUserId, result.risk, 'RISK_UPDATED');
    return result.risk;
  }

  archive(actor: PostgresProjectActor, projectId: string, riskId: string) {
    return this.transactions.run(async (manager) => {
      await this.requireManagerAndEnabled(manager, actor, projectId);
      const risk = await this.findRisk(manager, actor.organizationId, projectId, riskId);
      risk.archivedAt = new Date();
      const saved = await new PostgresRiskRepository(manager).save(risk);
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'RISK_ARCHIVED', subjectType: 'RISK', subjectId: saved.id });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'RISK_ARCHIVED', targetType: 'RISK', targetId: saved.id });
      return saved;
    });
  }

  linkTask(actor: PostgresProjectActor, projectId: string, riskId: string, taskId: string) {
    return this.transactions.run(async (manager) => {
      await this.requireManagerAndEnabled(manager, actor, projectId);
      await this.findRisk(manager, actor.organizationId, projectId, riskId);
      const task = await new PostgresTaskRepository(manager).findByIdForUpdate(actor.organizationId, projectId, taskId);
      if (!task) throw new NotFoundException('Task not found');
      const links = new PostgresRiskTaskLinkRepository(manager);
      const saved = await links.save(links.create({ organizationId: actor.organizationId, projectId, riskId, taskId }));
      await writePostgresActivity(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'RISK_TASK_LINKED', subjectType: 'RISK', subjectId: riskId, safeMetadata: { taskId } });
      await writePostgresAudit(manager, { organizationId: actor.organizationId, projectId, actorMembershipId: actor.membershipId, actionCode: 'RISK_TASK_LINKED', targetType: 'RISK', targetId: riskId, afterData: { taskId } });
      return saved;
    });
  }

  private async findRisk(manager: EntityManager, organizationId: string, projectId: string, riskId: string) {
    const risk = await new PostgresRiskRepository(manager).findByIdForUpdate(organizationId, projectId, riskId);
    if (!risk || risk.archivedAt) throw new NotFoundException('Risk not found');
    return risk;
  }

  private async requireActiveOwner(manager: EntityManager, organizationId: string, projectId: string, organizationMembershipId: string) {
    const owner = await new PostgresProjectMembershipRepository(manager).findActiveByIdForUpdate(organizationId, projectId, organizationMembershipId);
    if (!owner) throw new ConflictException('Risk owner must be an active Project Member');
    return owner;
  }

  private async ownerUserId(manager: EntityManager, organizationId: string, organizationMembershipId: string) {
    const membership = await manager.getRepository(OrganizationMembershipEntity).findOneBy({ id: organizationMembershipId, organizationId });
    if (!membership) throw new ConflictException('Risk owner must have an active organization membership');
    return membership.userId;
  }

  private async notifyOwner(organizationId: string, projectId: string, ownerUserId: string, risk: RiskEntity, typeCode: string) {
    if (!this.notifications) return;
    await this.notifications.createForRecipient(organizationId, {
      recipientUserId: ownerUserId,
      projectId,
      typeCode,
      resourceType: 'RISK',
      resourceId: risk.id,
      safePayload: { title: risk.title, state: risk.state },
      deduplicationKey: `risk:${risk.id}:${typeCode}:${risk.updatedAt.toISOString()}`,
    }).catch(() => undefined);
  }

  private async requireProjectMember(manager: EntityManager, actor: PostgresProjectActor, projectId: string) {
    const project = await new PostgresProjectRepository(manager).findByIdForUpdate(actor.organizationId, projectId);
    if (!project) throw new NotFoundException('Project not found');
    const member = await new PostgresProjectMembershipRepository(manager).findActiveByProjectAndOrganizationMembershipForUpdate(actor.organizationId, projectId, actor.membershipId);
    if (!member) throw new ForbiddenException('Active Project membership is required');
    return { project, member };
  }

  private async requireManagerAndEnabled(manager: EntityManager, actor: PostgresProjectActor, projectId: string) {
    const { project, member } = await this.requireProjectMember(manager, actor, projectId);
    if (project.state === ProjectState.COMPLETED || project.state === ProjectState.ARCHIVED) throw new ConflictException('Completed and archived projects are read-only');
    if (member.role !== ProjectRole.PROJECT_MANAGER) throw new ForbiddenException('An active Project Manager is required');
    const setting = await new PostgresProjectModuleSettingRepository(manager).findByProjectAndCodeForUpdate(actor.organizationId, projectId, ProjectModuleCode.RISKS);
    if (!setting?.enabled) throw new ConflictException('Project module is disabled');
  }
}

function requiredText(value: string, field: string) {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException(`${field} is required`);
  return normalized;
}
