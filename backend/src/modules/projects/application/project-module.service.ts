import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import {
  ProjectModuleCode,
  ProjectRole,
  ProjectState,
  type ProjectModuleSettingEntity,
} from '../persistence/typeorm/project.entities';
import {
  PostgresProjectMembershipRepository,
  PostgresProjectModuleSettingRepository,
  PostgresProjectRepository,
} from '../persistence/typeorm/project.repositories';
import type { PostgresProjectActor } from './project.service';
export class PostgresProjectModuleService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}
  setEnabled(
    actor: PostgresProjectActor,
    projectId: string,
    moduleCode: ProjectModuleCode,
    enabled: boolean,
  ): Promise<ProjectModuleSettingEntity> {
    return this.transactions.run(async (manager) => {
      await this.manager(manager, actor, projectId);
      const settings = new PostgresProjectModuleSettingRepository(manager);
      const setting = await settings.findByProjectAndCodeForUpdate(
        actor.organizationId,
        projectId,
        moduleCode,
      );
      if (!setting)
        throw new NotFoundException('Project module setting not found');
      setting.enabled = enabled;
      return settings.save(setting);
    });
  }
  async requireEnabled(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
    moduleCode: ProjectModuleCode,
  ): Promise<void> {
    const setting = await new PostgresProjectModuleSettingRepository(
      manager,
    ).findByProjectAndCodeForUpdate(organizationId, projectId, moduleCode);
    if (!setting || !setting.enabled)
      throw new ConflictException('Project module is disabled');
  }
  private async manager(
    manager: EntityManager,
    actor: PostgresProjectActor,
    projectId: string,
  ) {
    const project = await new PostgresProjectRepository(
      manager,
    ).findByIdForUpdate(actor.organizationId, projectId);
    if (!project) throw new NotFoundException('Project not found');
    if (project.state === ProjectState.ARCHIVED)
      throw new ConflictException('Archived projects are read-only');
    const membership = await new PostgresProjectMembershipRepository(
      manager,
    ).findActiveByProjectAndOrganizationMembershipForUpdate(
      actor.organizationId,
      projectId,
      actor.membershipId,
    );
    if (!membership || membership.role !== ProjectRole.PROJECT_MANAGER)
      throw new ForbiddenException('An active Project Manager is required');
  }
}
