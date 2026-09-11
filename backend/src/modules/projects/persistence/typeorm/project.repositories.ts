import { IsNull } from 'typeorm';
import type { DeepPartial, EntityManager } from 'typeorm';
import {
  ProjectEntity,
  ProjectMembershipEntity,
  ProjectModuleCode,
  ProjectModuleSettingEntity,
  ProjectTaskStatusEntity,
  ProjectTeamEntity,
} from './project.entities';
import { TeamMemberEntity } from '../../../onboarding/persistence/typeorm/onboarding.entities';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  TeamEntity,
  UserEntity,
} from '../../../onboarding/persistence/typeorm/onboarding.entities';
import type { OrganizationRole } from '../../../onboarding/persistence/typeorm/onboarding.entities';

/** Manager-scoped repositories for the P3 project transaction boundary. */
export class PostgresProjectRepository {
  constructor(private readonly manager: EntityManager) {}

  findById(organizationId: string, id: string): Promise<ProjectEntity | null> {
    return this.manager.getRepository(ProjectEntity).findOneBy({
      id,
      organizationId,
    });
  }

  findByIdForUpdate(
    organizationId: string,
    id: string,
  ): Promise<ProjectEntity | null> {
    return this.manager
      .getRepository(ProjectEntity)
      .createQueryBuilder('project')
      .setLock('pessimistic_write')
      .where('project.id = :id', { id })
      .andWhere('project.organization_id = :organizationId', {
        organizationId,
      })
      .getOne();
  }

  listByOrganization(organizationId: string): Promise<ProjectEntity[]> {
    return this.manager.getRepository(ProjectEntity).find({
      where: { organizationId },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  listByOrganizationForMembership(
    organizationId: string,
    organizationMembershipId: string,
  ) {
    return this.manager
      .getRepository(ProjectEntity)
      .createQueryBuilder('project')
      .leftJoin(
        ProjectMembershipEntity,
        'membership',
        'membership.organization_id = project.organization_id AND membership.project_id = project.id AND membership.organization_membership_id = :organizationMembershipId AND membership.removed_at IS NULL',
        { organizationMembershipId },
      )
      .select('project')
      .addSelect('membership.role', 'actorProjectRole')
      .where('project.organization_id = :organizationId', { organizationId })
      .orderBy('project.updated_at', 'DESC')
      .addOrderBy('project.created_at', 'DESC')
      .getRawAndEntities();
  }

  listVisibleByOrganizationMembership(
    organizationId: string,
    organizationMembershipId: string,
  ) {
    return this.manager
      .getRepository(ProjectEntity)
      .createQueryBuilder('project')
      .innerJoin(
        ProjectMembershipEntity,
        'membership',
        'membership.organization_id = project.organization_id AND membership.project_id = project.id',
      )
      .select('project')
      .addSelect('membership.role', 'actorProjectRole')
      .where('project.organization_id = :organizationId', { organizationId })
      .andWhere(
        'membership.organization_membership_id = :organizationMembershipId',
        {
          organizationMembershipId,
        },
      )
      .andWhere('membership.removed_at IS NULL')
      .orderBy('project.updated_at', 'DESC')
      .addOrderBy('project.created_at', 'DESC')
      .getRawAndEntities();
  }

  create(values: DeepPartial<ProjectEntity>): ProjectEntity {
    return this.manager.getRepository(ProjectEntity).create(values);
  }

  save(project: ProjectEntity): Promise<ProjectEntity> {
    return this.manager.getRepository(ProjectEntity).save(project);
  }
}

export class PostgresProjectTeamRepository {
  constructor(private readonly manager: EntityManager) {}

  findByProjectAndTeamForUpdate(
    organizationId: string,
    projectId: string,
    teamId: string,
  ): Promise<ProjectTeamEntity | null> {
    return this.manager
      .getRepository(ProjectTeamEntity)
      .createQueryBuilder('projectTeam')
      .setLock('pessimistic_write')
      .where('projectTeam.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('projectTeam.project_id = :projectId', { projectId })
      .andWhere('projectTeam.team_id = :teamId', { teamId })
      .getOne();
  }

  async hasQualifyingTeamForMembership(
    organizationId: string,
    projectId: string,
    organizationMembershipId: string,
    excludedTeamId?: string,
  ): Promise<boolean> {
    const query = this.manager
      .getRepository(ProjectTeamEntity)
      .createQueryBuilder('projectTeam')
      .innerJoin(
        TeamMemberEntity,
        'teamMember',
        'teamMember.organization_id = projectTeam.organization_id AND teamMember.team_id = projectTeam.team_id',
      )
      .where('projectTeam.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('projectTeam.project_id = :projectId', { projectId })
      .andWhere('projectTeam.removed_at IS NULL')
      .andWhere(
        'teamMember.organization_membership_id = :organizationMembershipId',
        { organizationMembershipId },
      )
      .andWhere('teamMember.removed_at IS NULL');
    if (excludedTeamId)
      query.andWhere('projectTeam.team_id != :excludedTeamId', {
        excludedTeamId,
      });
    return query.getExists();
  }

  async countActiveForProjectForUpdate(
    organizationId: string,
    projectId: string,
  ): Promise<number> {
    const rows = await this.manager
      .getRepository(ProjectTeamEntity)
      .createQueryBuilder('projectTeam')
      .setLock('pessimistic_write')
      .where('projectTeam.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('projectTeam.project_id = :projectId', { projectId })
      .andWhere('projectTeam.removed_at IS NULL')
      .getMany();
    return rows.length;
  }

  listActiveForProject(organizationId: string, projectId: string) {
    return this.manager
      .getRepository(ProjectTeamEntity)
      .createQueryBuilder('projectTeam')
      .innerJoin(
        TeamEntity,
        'team',
        'team.id = projectTeam.team_id AND team.organization_id = projectTeam.organization_id',
      )
      .select('team.id', 'id')
      .addSelect('team.name', 'name')
      .addSelect('team.description', 'description')
      .addSelect('team.logo_url', 'logoUrl')
      .addSelect('projectTeam.added_at', 'addedAt')
      .where('projectTeam.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('projectTeam.project_id = :projectId', { projectId })
      .andWhere('projectTeam.removed_at IS NULL')
      .andWhere('team.archived_at IS NULL')
      .orderBy('projectTeam.added_at', 'ASC')
      .getRawMany<{
        id: string;
        name: string;
        description: string;
        logoUrl: string | null;
        addedAt: Date;
      }>();
  }

  create(values: DeepPartial<ProjectTeamEntity>): ProjectTeamEntity {
    return this.manager.getRepository(ProjectTeamEntity).create(values);
  }

  save(projectTeam: ProjectTeamEntity): Promise<ProjectTeamEntity> {
    return this.manager.getRepository(ProjectTeamEntity).save(projectTeam);
  }
}

export class PostgresProjectMembershipRepository {
  constructor(private readonly manager: EntityManager) {}

  findActiveByProjectAndOrganizationMembershipForUpdate(
    organizationId: string,
    projectId: string,
    organizationMembershipId: string,
  ): Promise<ProjectMembershipEntity | null> {
    return this.manager
      .getRepository(ProjectMembershipEntity)
      .createQueryBuilder('membership')
      .setLock('pessimistic_write')
      .where('membership.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('membership.project_id = :projectId', { projectId })
      .andWhere(
        'membership.organization_membership_id = :organizationMembershipId',
        { organizationMembershipId },
      )
      .andWhere('membership.removed_at IS NULL')
      .getOne();
  }

  findByProjectAndOrganizationMembershipForUpdate(
    organizationId: string,
    projectId: string,
    organizationMembershipId: string,
  ): Promise<ProjectMembershipEntity | null> {
    return this.manager
      .getRepository(ProjectMembershipEntity)
      .createQueryBuilder('membership')
      .setLock('pessimistic_write')
      .where('membership.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('membership.project_id = :projectId', { projectId })
      .andWhere(
        'membership.organization_membership_id = :organizationMembershipId',
        { organizationMembershipId },
      )
      .getOne();
  }

  findActiveByIdForUpdate(
    organizationId: string,
    projectId: string,
    id: string,
  ): Promise<ProjectMembershipEntity | null> {
    return this.manager
      .getRepository(ProjectMembershipEntity)
      .createQueryBuilder('membership')
      .setLock('pessimistic_write')
      .where('membership.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('membership.project_id = :projectId', { projectId })
      .andWhere('membership.id = :id', { id })
      .andWhere('membership.removed_at IS NULL')
      .getOne();
  }

  async listActiveForProjectForUpdate(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectMembershipEntity[]> {
    return this.manager
      .getRepository(ProjectMembershipEntity)
      .createQueryBuilder('membership')
      .setLock('pessimistic_write')
      .where('membership.organization_id = :organizationId', { organizationId })
      .andWhere('membership.project_id = :projectId', { projectId })
      .andWhere('membership.removed_at IS NULL')
      .getMany();
  }

  listActiveForProject(organizationId: string, projectId: string) {
    return this.manager
      .getRepository(ProjectMembershipEntity)
      .createQueryBuilder('projectMembership')
      .innerJoin(
        OrganizationMembershipEntity,
        'membership',
        'membership.id = projectMembership.organization_membership_id AND membership.organization_id = projectMembership.organization_id',
      )
      .innerJoin(UserEntity, 'user', 'user.id = membership.user_id')
      .select('projectMembership.id', 'projectMembershipId')
      .addSelect('membership.id', 'organizationMembershipId')
      .addSelect('projectMembership.role', 'role')
      .addSelect('membership.role', 'organizationRole')
      .addSelect('projectMembership.added_at', 'addedAt')
      .addSelect('user.id', 'userId')
      .addSelect('user.name', 'userName')
      .addSelect('user.email', 'userEmail')
      .addSelect('user.profile_image_url', 'userProfileImageUrl')
      .where('projectMembership.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('projectMembership.project_id = :projectId', { projectId })
      .andWhere('projectMembership.removed_at IS NULL')
      .andWhere('membership.state = :state', {
        state: OrganizationMembershipState.ACTIVE,
      })
      .orderBy('projectMembership.added_at', 'ASC')
      .getRawMany<{
        projectMembershipId: string;
        organizationMembershipId: string;
        role: string;
        organizationRole: OrganizationRole;
        addedAt: Date;
        userId: string;
        userName: string;
        userEmail: string;
        userProfileImageUrl: string | null;
      }>();
  }

  create(
    values: DeepPartial<ProjectMembershipEntity>,
  ): ProjectMembershipEntity {
    return this.manager.getRepository(ProjectMembershipEntity).create(values);
  }

  save(membership: ProjectMembershipEntity): Promise<ProjectMembershipEntity> {
    return this.manager.getRepository(ProjectMembershipEntity).save(membership);
  }
}

export class PostgresProjectTaskStatusRepository {
  constructor(private readonly manager: EntityManager) {}

  findActiveByIdForUpdate(
    organizationId: string,
    projectId: string,
    id: string,
  ): Promise<ProjectTaskStatusEntity | null> {
    return this.manager
      .getRepository(ProjectTaskStatusEntity)
      .createQueryBuilder('status')
      .setLock('pessimistic_write')
      .where('status.organization_id = :organizationId', { organizationId })
      .andWhere('status.project_id = :projectId', { projectId })
      .andWhere('status.id = :id', { id })
      .andWhere('status.archived_at IS NULL')
      .getOne();
  }

  listActiveForProjectForUpdate(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectTaskStatusEntity[]> {
    return this.manager
      .getRepository(ProjectTaskStatusEntity)
      .createQueryBuilder('status')
      .setLock('pessimistic_write')
      .where('status.organization_id = :organizationId', { organizationId })
      .andWhere('status.project_id = :projectId', { projectId })
      .andWhere('status.archived_at IS NULL')
      .orderBy('status.position', 'ASC')
      .getMany();
  }

  listActiveForProject(organizationId: string, projectId: string) {
    return this.manager.getRepository(ProjectTaskStatusEntity).find({
      where: { organizationId, projectId, archivedAt: IsNull() },
      order: { position: 'ASC' },
    });
  }

  create(
    values: DeepPartial<ProjectTaskStatusEntity>,
  ): ProjectTaskStatusEntity {
    return this.manager.getRepository(ProjectTaskStatusEntity).create(values);
  }

  save(status: ProjectTaskStatusEntity): Promise<ProjectTaskStatusEntity> {
    return this.manager.getRepository(ProjectTaskStatusEntity).save(status);
  }
}

export class PostgresProjectModuleSettingRepository {
  constructor(private readonly manager: EntityManager) {}

  findByProjectAndCodeForUpdate(
    organizationId: string,
    projectId: string,
    moduleCode: ProjectModuleCode,
  ): Promise<ProjectModuleSettingEntity | null> {
    return this.manager
      .getRepository(ProjectModuleSettingEntity)
      .createQueryBuilder('setting')
      .setLock('pessimistic_write')
      .where('setting.organization_id = :organizationId', { organizationId })
      .andWhere('setting.project_id = :projectId', { projectId })
      .andWhere('setting.module_code = :moduleCode', { moduleCode })
      .getOne();
  }

  listForProject(organizationId: string, projectId: string) {
    return this.manager.getRepository(ProjectModuleSettingEntity).find({
      where: { organizationId, projectId },
      order: { moduleCode: 'ASC' },
    });
  }

  create(
    values: DeepPartial<ProjectModuleSettingEntity>,
  ): ProjectModuleSettingEntity {
    return this.manager
      .getRepository(ProjectModuleSettingEntity)
      .create(values);
  }

  save(
    setting: ProjectModuleSettingEntity,
  ): Promise<ProjectModuleSettingEntity> {
    return this.manager.getRepository(ProjectModuleSettingEntity).save(setting);
  }
}
