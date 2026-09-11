import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresProjectParticipantService } from '../src/modules/projects/application/project-participant.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import { PostgresTeamService } from '../src/modules/projects/application/team.service';
import {
  ProjectEntity,
  ProjectRole,
  ProjectTaskStatusEntity,
  TaskStatusSemanticCategory,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresTaskService } from '../src/modules/task/application/task.service';
import { TaskEntity } from '../src/modules/task/persistence/typeorm/task.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Project Task dependency integration', () => {
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let participants: PostgresProjectParticipantService;
  let teams: PostgresTeamService;
  let tasks: PostgresTaskService;
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    dataSource = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    projects = module.get(PostgresProjectService);
    participants = module.get(PostgresProjectParticipantService);
    teams = module.get(PostgresTeamService);
    tasks = module.get(PostgresTaskService);
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

  it('rejects Participating Team removal while it owns an active Task, without soft-removing the relation', async () => {
    const workspace = await createWorkspace('team-dependency');
    const actor = actorFor(workspace);
    const project = await projects.create(actor, { name: 'Team dependency' });
    const delivery = await teams.create(actor, { name: 'Delivery' });
    await participants.addTeam(actor, project.id, delivery.id);
    const todo = await statusFor(project.id, TaskStatusSemanticCategory.NOT_STARTED);
    const task = await tasks.create(actor, project.id, {
      owningTeamId: delivery.id,
      statusId: todo.id,
      title: 'Delivery-owned task',
      priorityCode: 'MEDIUM',
    });

    await expect(
      participants.removeTeam(actor, project.id, delivery.id),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      dataSource.query(
        `SELECT removed_at FROM project_teams WHERE project_id = $1 AND team_id = $2`,
        [project.id, delivery.id],
      ),
    ).resolves.toEqual([{ removed_at: null }]);

    await tasks.archive(actor, project.id, task.id);
    await expect(
      participants.removeTeam(actor, project.id, delivery.id),
    ).resolves.toEqual(expect.objectContaining({ removedAt: expect.any(Date) }));
  });

  it('rejects Project Member removal while an active Task assignment exists, without orphaning it', async () => {
    const workspace = await createWorkspace('assignment-dependency');
    const actor = actorFor(workspace);
    const project = await projects.create(actor, { name: 'Assignment dependency' });
    const member = await createMember(workspace.organizationId, 'assignee');
    await teams.addMember(actor, workspace.generalTeamId, member.id);
    const projectMember = await participants.addMember(
      actor,
      project.id,
      member.id,
      ProjectRole.CONTRIBUTOR,
    );
    const todo = await statusFor(project.id, TaskStatusSemanticCategory.NOT_STARTED);
    const task = await tasks.create(actor, project.id, {
      owningTeamId: workspace.generalTeamId,
      statusId: todo.id,
      title: 'Assigned task',
      priorityCode: 'HIGH',
    });
    await tasks.assign(actor, project.id, task.id, projectMember.id);

    await expect(
      participants.removeMember(actor, project.id, member.id),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      dataSource.query(
        `SELECT removed_at FROM project_memberships WHERE id = $1`,
        [projectMember.id],
      ),
    ).resolves.toEqual([{ removed_at: null }]);
    await expect(
      dataSource.query(
        `SELECT removed_at FROM task_assignees WHERE task_id = $1 AND project_membership_id = $2`,
        [task.id, projectMember.id],
      ),
    ).resolves.toEqual([{ removed_at: null }]);

    await tasks.unassign(actor, project.id, task.id, projectMember.id);
    await expect(
      participants.removeMember(actor, project.id, member.id),
    ).resolves.toEqual(expect.objectContaining({ removedAt: expect.any(Date) }));
  });

  it('allows completion only after all active Tasks are terminal and serializes completion against Task creation', async () => {
    const workspace = await createWorkspace('completion-dependency');
    const actor = actorFor(workspace);
    const project = await projects.create(actor, { name: 'Completion dependency' });
    await projects.transition(actor, project.id, 'activate');
    const todo = await statusFor(project.id, TaskStatusSemanticCategory.NOT_STARTED);
    const inProgress = await statusFor(
      project.id,
      TaskStatusSemanticCategory.IN_PROGRESS,
    );
    const done = await statusFor(project.id, TaskStatusSemanticCategory.COMPLETED);
    const activeTask = await tasks.create(actor, project.id, {
      owningTeamId: workspace.generalTeamId,
      statusId: todo.id,
      title: 'Must finish first',
      priorityCode: 'LOW',
    });

    await expect(
      projects.transition(actor, project.id, 'complete'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      dataSource.getRepository(ProjectEntity).findOneByOrFail({ id: project.id }),
    ).resolves.toEqual(expect.objectContaining({ state: 'ACTIVE' }));

    await tasks.transitionStatus(actor, project.id, activeTask.id, inProgress.id);
    await tasks.transitionStatus(actor, project.id, activeTask.id, done.id);
    await expect(
      projects.transition(actor, project.id, 'complete'),
    ).resolves.toEqual(expect.objectContaining({ state: 'COMPLETED' }));

    const racedProject = await projects.create(actor, { name: 'Completion race' });
    await projects.transition(actor, racedProject.id, 'activate');
    const racedTodo = await statusFor(
      racedProject.id,
      TaskStatusSemanticCategory.NOT_STARTED,
    );
    const outcomes = await Promise.allSettled([
      tasks.create(actor, racedProject.id, {
        owningTeamId: workspace.generalTeamId,
        statusId: racedTodo.id,
        title: 'Racing task',
        priorityCode: 'LOW',
      }),
      projects.transition(actor, racedProject.id, 'complete'),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const racedState = await dataSource
      .getRepository(ProjectEntity)
      .findOneByOrFail({ id: racedProject.id });
    const activeTaskCount = await dataSource.getRepository(TaskEntity).countBy({
      projectId: racedProject.id,
      archivedAt: null,
    });
    if (racedState.state === 'COMPLETED') {
      expect(activeTaskCount).toBe(0);
    } else {
      expect(racedState.state).toBe('ACTIVE');
      expect(activeTaskCount).toBe(1);
    }
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
    const workspace = await onboarding.createOrganization(user.id, {
      name: `${prefix} workspace`,
    });
    return { ...workspace, userId: user.id, email: user.email };
  }

  async function createMember(organizationId: string, prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: 'test-only-password-hash',
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
    return dataSource.getRepository(OrganizationMembershipEntity).save({
      organizationId,
      userId: user.id,
      role: OrganizationRole.MEMBER,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date(),
      stateChangedAt: new Date(),
    });
  }

  async function statusFor(
    projectId: string,
    semanticCategory: TaskStatusSemanticCategory,
  ) {
    return dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId,
      semanticCategory,
    });
  }

  function actorFor(workspace: { organizationId: string; membershipId: string }) {
    return {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
  }
});
