import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import {
  ProjectModuleSettingEntity,
  ProjectState,
  ProjectTaskStatusEntity,
  ProjectTeamEntity,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Project lifecycle integration', () => {
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    dataSource = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    projects = module.get(PostgresProjectService);
  });

  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(
      `TRUNCATE TABLE project_module_settings, project_task_statuses, project_memberships, project_teams, team_members, organization_invitations, organization_memberships, teams, organizations, users RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => dataSource.destroy());

  it('creates the solo Project setup atomically and applies the frozen lifecycle', async () => {
    const workspace = await createWorkspace();
    const actor = {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
    const project = await projects.create(actor, { name: '  Portfolio  ' });
    expect(project.state).toBe(ProjectState.DRAFT);
    await expect(
      dataSource
        .getRepository(ProjectTeamEntity)
        .countBy({ projectId: project.id, teamId: workspace.generalTeamId }),
    ).resolves.toBe(1);
    await expect(
      dataSource
        .getRepository(ProjectTaskStatusEntity)
        .countBy({ projectId: project.id, archivedAt: null }),
    ).resolves.toBe(4);
    await expect(
      dataSource
        .getRepository(ProjectModuleSettingEntity)
        .findBy({ projectId: project.id }),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ enabled: true })]),
    );
    expect(
      await dataSource
        .getRepository(ProjectModuleSettingEntity)
        .countBy({ projectId: project.id, enabled: true }),
    ).toBe(4);

    await projects.transition(actor, project.id, 'activate');
    await projects.transition(actor, project.id, 'complete');
    await projects.transition(actor, project.id, 'archive');
    const restored = await projects.transition(actor, project.id, 'restore');
    expect(restored.state).toBe(ProjectState.COMPLETED);
  });

  it('rolls back the complete Project setup when a default setting insert fails', async () => {
    const workspace = await createWorkspace();
    const functionName = 'p3_03_reject_project_module_setting';
    const triggerName = 'p3_03_reject_project_module_setting_trigger';
    await dataSource.query(
      `CREATE FUNCTION ${functionName}() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'P3-03 forced module-setting failure'; END; $$ LANGUAGE plpgsql`,
    );
    await dataSource.query(
      `CREATE TRIGGER ${triggerName} BEFORE INSERT ON project_module_settings FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
    );
    await expect(
      projects.create(
        {
          organizationId: workspace.organizationId,
          membershipId: workspace.membershipId,
        },
        { name: 'Rollback project' },
      ),
    ).rejects.toThrow('P3-03 forced module-setting failure');
    await expect(
      dataSource.query(
        `SELECT count(*)::int AS count FROM projects WHERE organization_id = $1`,
        [workspace.organizationId],
      ),
    ).resolves.toEqual([{ count: 0 }]);
    await dataSource.query(
      `DROP TRIGGER ${triggerName} ON project_module_settings`,
    );
    await dataSource.query(`DROP FUNCTION ${functionName}()`);
  });

  async function createWorkspace() {
    const user = await dataSource
      .getRepository(UserEntity)
      .save({
        email: `project-${sequence}@example.test`,
        name: 'Project owner',
        passwordHash: 'test-only-password-hash',
        profileImageUrl: null,
        emailVerifiedAt: new Date(),
        refreshTokenHash: null,
        disabledAt: null,
      });
    return onboarding.createOrganization(user.id, {
      name: `Project workspace ${sequence}`,
    });
  }
});
