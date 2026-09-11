import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  OrganizationMembershipEntity,
  TeamEntity,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import {
  ProjectEntity,
  ProjectMembershipEntity,
  ProjectRole,
  ProjectState,
  ProjectTaskStatusEntity,
  ProjectTeamEntity,
  TaskStatusSemanticCategory,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import {
  ApprovalRequestEntity,
  ApprovalRequestState,
  CommentEntity,
  TaskAssigneeEntity,
  TaskChecklistItemEntity,
  TaskEntity,
} from '../src/modules/task/persistence/typeorm/task.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Task schema integration', () => {
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
      TRUNCATE TABLE comments, task_approval_requests, task_checklist_items,
        task_assignees, tasks, project_module_settings, project_task_statuses,
        project_memberships, project_teams, team_members,
        organization_invitations, organization_memberships, teams,
        organizations, users RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => dataSource.destroy());

  it('enforces Task same-project relations and configuration checks', async () => {
    const first = await createTaskFixture('first');
    const second = await createTaskFixture('second');
    const tasks = dataSource.getRepository(TaskEntity);

    const task = await tasks.save(taskValues(first));
    await expect(
      tasks.insert({
        ...taskValues(first),
        owningTeamId: second.teamId,
      }),
    ).rejects.toThrow();
    await expect(
      tasks.insert({
        ...taskValues(first),
        manualProgress: 101,
      }),
    ).rejects.toThrow();
    await expect(
      tasks.insert({
        ...taskValues(first),
        requiresApproval: true,
        approverProjectMembershipId: null,
      }),
    ).rejects.toThrow();

    await expect(
      dataSource.getRepository(TaskAssigneeEntity).insert({
        taskId: task.id,
        projectMembershipId: second.projectMembershipId,
        organizationId: first.organizationId,
        projectId: first.projectId,
        assignedByProjectMembershipId: first.projectMembershipId,
        assignedAt: new Date(),
        removedAt: null,
      }),
    ).rejects.toThrow();
    await expect(
      dataSource.getRepository(CommentEntity).insert({
        organizationId: first.organizationId,
        projectId: first.projectId,
        taskId: task.id,
        authorProjectMembershipId: second.projectMembershipId,
        body: 'Cross-project author',
        editedAt: null,
        deletedAt: null,
        deletedByMembershipId: null,
      }),
    ).rejects.toThrow();
  });

  it('enforces checklist and immutable approval-cycle constraints', async () => {
    const fixture = await createTaskFixture('approval');
    const task = await dataSource.getRepository(TaskEntity).save({
      ...taskValues(fixture),
      requiresApproval: true,
      approverProjectMembershipId: fixture.projectMembershipId,
    });
    const checklist = dataSource.getRepository(TaskChecklistItemEntity);
    await checklist.insert({
      organizationId: fixture.organizationId,
      projectId: fixture.projectId,
      taskId: task.id,
      text: 'One',
      position: 0,
      completedAt: null,
      completedByProjectMembershipId: null,
      removedAt: null,
    });
    await expect(
      checklist.insert({
        organizationId: fixture.organizationId,
        projectId: fixture.projectId,
        taskId: task.id,
        text: 'Duplicate',
        position: 0,
        completedAt: null,
        completedByProjectMembershipId: null,
        removedAt: null,
      }),
    ).rejects.toThrow();
    await expect(
      checklist.insert({
        organizationId: fixture.organizationId,
        projectId: fixture.projectId,
        taskId: task.id,
        text: 'Invalid pair',
        position: 1,
        completedAt: new Date(),
        completedByProjectMembershipId: null,
        removedAt: null,
      }),
    ).rejects.toThrow();

    const approvals = dataSource.getRepository(ApprovalRequestEntity);
    const pending = approvalValues(fixture, task.id, 1);
    await approvals.insert(pending);
    await expect(
      approvals.insert(approvalValues(fixture, task.id, 2)),
    ).rejects.toThrow();
    await expect(
      approvals.insert({
        ...approvalValues(fixture, task.id, 3),
        state: ApprovalRequestState.CANCELLED,
        resolvedByMembershipId: fixture.organizationMembershipId,
        resolvedAt: new Date(),
        resolutionReason: ' ',
      }),
    ).rejects.toThrow();
  });

  async function createTaskFixture(prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: 'test-only-password-hash',
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
    const workspace = await onboarding.createOrganization(user.id, {
      name: `${prefix} workspace`,
    });
    const team = await dataSource.getRepository(TeamEntity).findOneByOrFail({
      id: workspace.generalTeamId,
    });
    const project = await dataSource.getRepository(ProjectEntity).save({
      organizationId: workspace.organizationId,
      name: `${prefix} project`,
      description: '',
      state: ProjectState.DRAFT,
      startDate: null,
      dueDate: null,
      createdByMembershipId: workspace.membershipId,
      completedAt: null,
      archivedAt: null,
      version: '0',
    });
    await dataSource.getRepository(ProjectTeamEntity).insert({
      organizationId: workspace.organizationId,
      projectId: project.id,
      teamId: team.id,
      addedByMembershipId: workspace.membershipId,
      addedAt: new Date(),
      removedAt: null,
    });
    const projectMembership = await dataSource
      .getRepository(ProjectMembershipEntity)
      .save({
        organizationId: workspace.organizationId,
        projectId: project.id,
        organizationMembershipId: workspace.membershipId,
        role: ProjectRole.PROJECT_MANAGER,
        addedAt: new Date(),
        removedAt: null,
      });
    const status = await dataSource
      .getRepository(ProjectTaskStatusEntity)
      .save({
        organizationId: workspace.organizationId,
        projectId: project.id,
        name: 'To do',
        semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
        position: 0,
        archivedAt: null,
        version: '0',
      });
    const membership = await dataSource
      .getRepository(OrganizationMembershipEntity)
      .findOneByOrFail({ id: workspace.membershipId });

    return {
      organizationId: workspace.organizationId,
      organizationMembershipId: membership.id,
      projectId: project.id,
      projectMembershipId: projectMembership.id,
      statusId: status.id,
      teamId: team.id,
    };
  }

  function taskValues(fixture: Awaited<ReturnType<typeof createTaskFixture>>) {
    return {
      organizationId: fixture.organizationId,
      projectId: fixture.projectId,
      owningTeamId: fixture.teamId,
      statusId: fixture.statusId,
      creatorProjectMembershipId: fixture.projectMembershipId,
      milestoneId: null,
      title: 'Schema Task',
      description: '',
      priorityCode: 'MEDIUM',
      dueAt: null,
      manualProgress: 0,
      requiresApproval: false,
      approverProjectMembershipId: null,
      version: '0',
      archivedAt: null,
    };
  }

  function approvalValues(
    fixture: Awaited<ReturnType<typeof createTaskFixture>>,
    taskId: string,
    requestNumber: number,
  ) {
    return {
      organizationId: fixture.organizationId,
      projectId: fixture.projectId,
      taskId,
      requestNumber,
      requestedByMembershipId: fixture.organizationMembershipId,
      approverProjectMembershipId: fixture.projectMembershipId,
      state: ApprovalRequestState.PENDING,
      requestReason: null,
      resolutionReason: null,
      resolvedByMembershipId: null,
      requestedAt: new Date(),
      resolvedAt: null,
      idempotencyKey: null,
    };
  }
});
