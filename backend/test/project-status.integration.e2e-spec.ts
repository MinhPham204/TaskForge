import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import { PostgresProjectStatusService } from '../src/modules/projects/application/project-status.service';
import {
  ProjectTaskStatusEntity,
  TaskStatusSemanticCategory,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Project status integration', () => {
  let db: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let statuses: PostgresProjectStatusService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    db = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    projects = module.get(PostgresProjectService);
    statuses = module.get(PostgresProjectStatusService);
  });
  beforeEach(() =>
    db.query(
      `TRUNCATE TABLE project_module_settings, project_task_statuses, project_memberships, project_teams, team_members, organization_invitations, organization_memberships, teams, organizations, users RESTART IDENTITY CASCADE`,
    ),
  );
  afterAll(() => db.destroy());
  it('reorders without duplicate active positions and preserves required semantic categories', async () => {
    const user = await db.getRepository(UserEntity).save({
      email: 'status@example.test',
      name: 'Status',
      passwordHash: 'hash',
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
    const workspace = await onboarding.createOrganization(user.id, {
      name: 'Status workspace',
    });
    const actor = {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
    const project = await projects.create(actor, { name: 'Statuses' });
    const extra = await statuses.create(
      actor,
      project.id,
      'Blocked',
      TaskStatusSemanticCategory.IN_PROGRESS,
    );
    await statuses.rename(actor, project.id, extra.id, 'Waiting');
    await statuses.reorder(actor, project.id, extra.id, 0);
    const active = await db.getRepository(ProjectTaskStatusEntity).find({
      where: { projectId: project.id, archivedAt: null },
      order: { position: 'ASC' },
    });
    expect(active.map((status) => status.position)).toEqual([0, 1, 2, 3, 4]);
    expect(active[0].name).toBe('Waiting');
    const required = active.find(
      (status) =>
        status.semanticCategory === TaskStatusSemanticCategory.NOT_STARTED,
    )!;
    await expect(
      statuses.archive(actor, project.id, required.id),
    ).rejects.toBeInstanceOf(ConflictException);
    await statuses.archive(actor, project.id, extra.id);
    expect(
      (
        await db.getRepository(ProjectTaskStatusEntity).find({
          where: { projectId: project.id },
        })
      ).filter((status) => status.archivedAt === null).length,
    ).toBe(4);
  });
});
