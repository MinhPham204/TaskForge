import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
  TeamMemberEntity,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresProjectParticipantService } from '../src/modules/projects/application/project-participant.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import {
  ProjectRole,
  ProjectTaskStatusEntity,
  TaskStatusSemanticCategory,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL personal Dashboard read contract', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let participants: PostgresProjectParticipantService;
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = module.get(DataSource);
    jwt = module.get(JwtService);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    projects = module.get(PostgresProjectService);
    participants = module.get(PostgresProjectParticipantService);
  });

  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(`
      TRUNCATE TABLE comments, task_approval_requests, task_checklist_items,
        task_assignees, tasks, milestones, project_module_settings,
        project_task_statuses, project_memberships, project_teams, team_members,
        organization_invitations, organization_memberships, teams,
        organizations, users RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns only active-tenant, visible work while separating cancelled from completed metrics', async () => {
    const workspace = await createWorkspace('dashboard');
    const owner = actorFor(workspace);
    const visibleProject = await projects.create(owner, {
      name: 'Visible dashboard project',
    });
    const hiddenProject = await projects.create(owner, {
      name: 'Hidden dashboard project',
    });
    const member = await createMember(workspace.organizationId, 'member');
    await dataSource.getRepository(TeamMemberEntity).save({
      organizationId: workspace.organizationId,
      teamId: workspace.generalTeamId,
      organizationMembershipId: member.membership.id,
      joinedAt: new Date(),
      removedAt: null,
    });
    const memberProjectMembership = await participants.addMember(
      owner,
      visibleProject.id,
      member.membership.id,
      ProjectRole.CONTRIBUTOR,
    );
    const ownerToken = await accessToken(workspace.userId, workspace.email);
    await request(app.getHttpServer())
      .post(`/api/projects/${visibleProject.id}/statuses`)
      .set(authHeaders(workspace.organizationId, ownerToken))
      .send({
        name: 'Cancelled',
        semanticCategory: TaskStatusSemanticCategory.CANCELLED,
      })
      .expect(201);
    const statuses = await statusesFor(visibleProject.id);
    const dates = dashboardDates();

    const overdue = await createTask(workspace, ownerToken, visibleProject.id, {
      statusId: statuses.notStarted.id,
      title: 'Visible overdue task',
      priorityCode: 'HIGH',
      dueAt: dates.overdue,
    });
    const today = await createTask(workspace, ownerToken, visibleProject.id, {
      statusId: statuses.inProgress.id,
      title: 'Visible today task',
      priorityCode: 'MEDIUM',
      dueAt: dates.today,
    });
    const upcoming = await createTask(workspace, ownerToken, visibleProject.id, {
      statusId: statuses.notStarted.id,
      title: 'Visible upcoming task',
      priorityCode: 'LOW',
      dueAt: dates.upcoming,
    });
    const cancelled = await createTask(workspace, ownerToken, visibleProject.id, {
      statusId: statuses.cancelled.id,
      title: 'Visible cancelled task',
      priorityCode: 'LOW',
      dueAt: dates.upcoming,
    });
    const approvalTask = await createTask(
      workspace,
      ownerToken,
      visibleProject.id,
      {
        statusId: statuses.notStarted.id,
        title: 'Visible approval-only task',
        priorityCode: 'MEDIUM',
      },
    );
    for (const task of [overdue, today, upcoming, cancelled]) {
      await request(app.getHttpServer())
        .post(`/api/projects/${visibleProject.id}/tasks/${task.id}/assignees`)
        .set(authHeaders(workspace.organizationId, ownerToken))
        .send({ projectMembershipId: memberProjectMembership.id })
        .expect(201);
    }

    await request(app.getHttpServer())
      .patch(`/api/projects/${visibleProject.id}/tasks/${approvalTask.id}/approval`)
      .set(authHeaders(workspace.organizationId, ownerToken))
      .send({ approverProjectMembershipId: memberProjectMembership.id })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/projects/${visibleProject.id}/tasks/${approvalTask.id}/approval-requests`)
      .set(authHeaders(workspace.organizationId, ownerToken))
      .send({ reason: 'Ready for member review' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/projects/${visibleProject.id}/milestones`)
      .set(authHeaders(workspace.organizationId, ownerToken))
      .send({ name: 'Visible milestone', dueDate: dates.milestone })
      .expect(201);
    const hiddenNotStarted = await dataSource
      .getRepository(ProjectTaskStatusEntity)
      .findOneByOrFail({
        projectId: hiddenProject.id,
        semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
      });
    await createTask(workspace, ownerToken, hiddenProject.id, {
      statusId: hiddenNotStarted.id,
      title: 'Hidden tenant member task',
      priorityCode: 'HIGH',
      dueAt: dates.upcoming,
    });
    await request(app.getHttpServer())
      .post(`/api/projects/${hiddenProject.id}/milestones`)
      .set(authHeaders(workspace.organizationId, ownerToken))
      .send({ name: 'Hidden milestone', dueDate: dates.milestone })
      .expect(201);

    const memberToken = await accessToken(member.user.id, member.user.email);
    await request(app.getHttpServer())
      .get('/api/dashboard')
      .set(authHeaders(workspace.organizationId, memberToken))
      .expect(200)
      .expect(({ body }) => {
        expect(body.focus).toMatchObject({
          total: 4,
          active: 3,
          cancelled: 1,
          completed: 0,
          overdue: 1,
          dueToday: 1,
          upcoming: 1,
        });
        expect(body.pendingApprovals).toEqual([
          expect.objectContaining({ taskId: approvalTask.id, projectId: visibleProject.id }),
        ]);
        expect(body.recentProjects).toEqual([
          expect.objectContaining({ id: visibleProject.id }),
        ]);
        expect(body.calendarItems).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: 'TASK', id: overdue.id }),
            expect.objectContaining({ type: 'MILESTONE', title: 'Visible milestone' }),
          ]),
        );
        expect(body.calendarItems).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ title: 'Hidden tenant member task' }),
            expect.objectContaining({ title: 'Hidden milestone' }),
          ]),
        );
      });

    const otherWorkspace = await onboarding.createOrganization(member.user.id, {
      name: `Other dashboard workspace ${sequence}`,
    });
    await request(app.getHttpServer())
      .get('/api/dashboard')
      .set(authHeaders(otherWorkspace.organizationId, memberToken))
      .expect(200)
      .expect(({ body }) => {
        expect(body.focus.total).toBe(0);
        expect(body.assignedTasks).toEqual([]);
        expect(body.pendingApprovals).toEqual([]);
        expect(body.recentProjects).toEqual([]);
        expect(body.calendarItems).toEqual([]);
      });
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
    const membership = await dataSource
      .getRepository(OrganizationMembershipEntity)
      .save({
        organizationId,
        userId: user.id,
        role: OrganizationRole.MEMBER,
        state: OrganizationMembershipState.ACTIVE,
        joinedAt: new Date(),
        stateChangedAt: new Date(),
      });
    return { user, membership };
  }

  async function statusesFor(projectId: string) {
    const statuses = await dataSource
      .getRepository(ProjectTaskStatusEntity)
      .findBy({ projectId });
    const find = (semanticCategory: TaskStatusSemanticCategory) => {
      const status = statuses.find(
        (candidate) => candidate.semanticCategory === semanticCategory,
      );
      if (!status) throw new Error(`Missing ${semanticCategory} status`);
      return status;
    };
    return {
      notStarted: find(TaskStatusSemanticCategory.NOT_STARTED),
      inProgress: find(TaskStatusSemanticCategory.IN_PROGRESS),
      cancelled: find(TaskStatusSemanticCategory.CANCELLED),
    };
  }

  function createTask(
    workspace: Awaited<ReturnType<typeof createWorkspace>>,
    token: string,
    projectId: string,
    payload: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeaders(workspace.organizationId, token))
      .send({ owningTeamId: workspace.generalTeamId, ...payload })
      .expect(201)
      .then((response) => response.body as { id: string });
  }

  function dashboardDates() {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const withDays = (days: number) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + days);
      date.setUTCHours(12, 0, 0, 0);
      return date.toISOString();
    };
    const endOfToday = new Date(start);
    endOfToday.setUTCDate(endOfToday.getUTCDate() + 1);
    endOfToday.setUTCMilliseconds(endOfToday.getUTCMilliseconds() - 1);
    return {
      overdue: withDays(-1),
      today: endOfToday.toISOString(),
      upcoming: withDays(1),
      milestone: withDays(2).slice(0, 10),
    };
  }

  function actorFor(workspace: { organizationId: string; membershipId: string }) {
    return {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
  }

  function authHeaders(organizationId: string, token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-id': organizationId,
    };
  }

  function accessToken(userId: string, email: string) {
    return jwt.signAsync(
      { sub: userId, email },
      { secret: 'local-test-access-secret' },
    );
  }
});
