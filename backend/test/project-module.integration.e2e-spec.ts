import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { PostgresProjectModuleService } from '../src/modules/projects/application/project-module.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import {
  ProjectModuleCode,
  ProjectModuleSettingEntity,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
describe('PostgreSQL Project module integration', () => {
  let db: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let modules: PostgresProjectModuleService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    db = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    projects = module.get(PostgresProjectService);
    modules = module.get(PostgresProjectModuleService);
  });
  beforeEach(() =>
    db.query(
      `TRUNCATE TABLE project_module_settings, project_task_statuses, project_memberships, project_teams, team_members, organization_invitations, organization_memberships, teams, organizations, users RESTART IDENTITY CASCADE`,
    ),
  );
  afterAll(() => db.destroy());
  it('persists disable, gates mutation, and re-enables without deleting setting', async () => {
    const user = await db
      .getRepository(UserEntity)
      .save({
        email: 'module@example.test',
        name: 'Module',
        passwordHash: 'hash',
        profileImageUrl: null,
        emailVerifiedAt: new Date(),
        refreshTokenHash: null,
        disabledAt: null,
      });
    const workspace = await onboarding.createOrganization(user.id, {
      name: 'Modules',
    });
    const actor = {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
    const project = await projects.create(actor, { name: 'Project' });
    await modules.setEnabled(actor, project.id, ProjectModuleCode.FILES, false);
    await expect(
      db
        .getRepository(ProjectModuleSettingEntity)
        .countBy({ projectId: project.id }),
    ).resolves.toBe(4);
    await expect(
      db.transaction((manager) =>
        modules.requireEnabled(
          manager,
          actor.organizationId,
          project.id,
          ProjectModuleCode.FILES,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await modules.setEnabled(actor, project.id, ProjectModuleCode.FILES, true);
    await expect(
      db.transaction((manager) =>
        modules.requireEnabled(
          manager,
          actor.organizationId,
          project.id,
          ProjectModuleCode.FILES,
        ),
      ),
    ).resolves.toBeUndefined();
  });
});
