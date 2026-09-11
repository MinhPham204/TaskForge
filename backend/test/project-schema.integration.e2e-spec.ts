import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  TeamEntity,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import {
  ProjectEntity,
  ProjectMembershipEntity,
  ProjectModuleCode,
  ProjectModuleSettingEntity,
  ProjectRole,
  ProjectState,
  ProjectTaskStatusEntity,
  ProjectTeamEntity,
  TaskStatusSemanticCategory,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL project schema integration', () => {
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    dataSource = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
  });

  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(`
      TRUNCATE TABLE project_module_settings, project_task_statuses,
        project_memberships, project_teams, team_members,
        organization_invitations, organization_memberships, teams,
        organizations, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => dataSource.destroy());

  it('enforces participating-team and project-member same-tenant composite foreign keys', async () => {
    const first = await createWorkspace('first');
    const second = await createWorkspace('second');
    const project = await createProject(
      first.organizationId,
      first.membershipId,
    );
    const firstTeam = await dataSource
      .getRepository(TeamEntity)
      .findOneByOrFail({
        id: first.generalTeamId,
      });

    await dataSource.getRepository(ProjectTeamEntity).insert({
      projectId: project.id,
      teamId: firstTeam.id,
      organizationId: first.organizationId,
      addedByMembershipId: first.membershipId,
      addedAt: new Date(),
      removedAt: null,
    });
    await expect(
      dataSource.getRepository(ProjectTeamEntity).insert({
        projectId: project.id,
        teamId: second.generalTeamId,
        organizationId: first.organizationId,
        addedByMembershipId: first.membershipId,
        addedAt: new Date(),
        removedAt: null,
      }),
    ).rejects.toThrow();
    await expect(
      dataSource.getRepository(ProjectMembershipEntity).insert({
        organizationId: first.organizationId,
        projectId: project.id,
        organizationMembershipId: second.membershipId,
        role: ProjectRole.CONTRIBUTOR,
        addedAt: new Date(),
        removedAt: null,
      }),
    ).rejects.toThrow();
  });

  it('enforces one logical project member and active status positions', async () => {
    const workspace = await createWorkspace('constraints');
    const project = await createProject(
      workspace.organizationId,
      workspace.membershipId,
    );
    const memberships = dataSource.getRepository(ProjectMembershipEntity);
    await memberships.insert({
      organizationId: workspace.organizationId,
      projectId: project.id,
      organizationMembershipId: workspace.membershipId,
      role: ProjectRole.PROJECT_MANAGER,
      addedAt: new Date(),
      removedAt: null,
    });
    await expect(
      memberships.insert({
        organizationId: workspace.organizationId,
        projectId: project.id,
        organizationMembershipId: workspace.membershipId,
        role: ProjectRole.CONTRIBUTOR,
        addedAt: new Date(),
        removedAt: null,
      }),
    ).rejects.toThrow();

    const statuses = dataSource.getRepository(ProjectTaskStatusEntity);
    await statuses.insert({
      organizationId: workspace.organizationId,
      projectId: project.id,
      name: 'To do',
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
      position: 0,
      archivedAt: null,
    });
    await expect(
      statuses.insert({
        organizationId: workspace.organizationId,
        projectId: project.id,
        name: 'Invalid duplicate',
        semanticCategory: TaskStatusSemanticCategory.IN_PROGRESS,
        position: 0,
        archivedAt: null,
      }),
    ).rejects.toThrow();

    const another = await createWorkspace('module-setting');
    const anotherProject = await createProject(
      another.organizationId,
      another.membershipId,
    );
    await expect(
      dataSource.getRepository(ProjectModuleSettingEntity).insert({
        organizationId: workspace.organizationId,
        projectId: anotherProject.id,
        moduleCode: ProjectModuleCode.FILES,
        enabled: true,
      }),
    ).rejects.toThrow();
    await expect(
      statuses.insert({
        organizationId: workspace.organizationId,
        projectId: project.id,
        name: 'Invalid position',
        semanticCategory: TaskStatusSemanticCategory.REVIEW,
        position: -1,
        archivedAt: null,
      }),
    ).rejects.toThrow();
  });

  async function createWorkspace(prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: 'test-only-password-hash',
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
    return onboarding.createOrganization(user.id, {
      name: `${prefix} workspace`,
    });
  }

  function createProject(organizationId: string, membershipId: string) {
    return dataSource.getRepository(ProjectEntity).save({
      organizationId,
      name: 'Schema project',
      description: '',
      state: ProjectState.DRAFT,
      startDate: null,
      dueDate: null,
      createdByMembershipId: membershipId,
      completedAt: null,
      archivedAt: null,
      version: '0',
    });
  }
});
