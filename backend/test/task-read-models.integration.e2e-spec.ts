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
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresProjectParticipantService } from '../src/modules/projects/application/project-participant.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import { PostgresTeamService } from '../src/modules/projects/application/team.service';
import {
  ProjectRole,
  ProjectTaskStatusEntity,
  TaskStatusSemanticCategory,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Task read models integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let participants: PostgresProjectParticipantService;
  let teams: PostgresTeamService;
  let jwt: JwtService;
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
    onboarding = module.get(PostgresOrganizationOnboardingService);
    projects = module.get(PostgresProjectService);
    participants = module.get(PostgresProjectParticipantService);
    teams = module.get(PostgresTeamService);
    jwt = module.get(JwtService);
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

  afterAll(async () => app.close());

  it('serves filtered List, Board, detail, Overview, report and CSV from one scoped query model', async () => {
    const workspace = await createWorkspace('read-model');
    const actor = actorFor(workspace);
    const project = await projects.create(actor, { name: 'Read model project' });
    const statuses = await statusesFor(project.id);
    const token = await accessToken(workspace.userId, workspace.email);

    const alpha = await createTask(workspace, token, project.id, {
      statusId: statuses.notStarted.id,
      title: 'Alpha launch plan',
      description: 'Customer rollout',
      priorityCode: 'HIGH',
      dueAt: '2026-09-01T00:00:00.000Z',
    });
    await createTask(workspace, token, project.id, {
      statusId: statuses.inProgress.id,
      title: 'Beta operations',
      description: 'Internal work',
      priorityCode: 'LOW',
      dueAt: '2027-09-01T00:00:00.000Z',
    });
    await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/tasks/${alpha.id}/checklist-items`)
      .set(authHeaders(workspace, token))
      .send({ text: 'Verify report' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/tasks/${alpha.id}/comments`)
      .set(authHeaders(workspace, token))
      .send({ body: 'Read model comment' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks`)
      .query({ search: 'customer', priorityCode: 'HIGH' })
      .set(authHeaders(workspace, token))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            id: alpha.id,
            statusName: statuses.notStarted.name,
            effectiveProgress: 0,
          }),
        );
      });

    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks/board`)
      .set(authHeaders(workspace, token))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(4);
        expect(
          body.find(
            (column: { semanticCategory: string }) =>
              column.semanticCategory === 'NOT_STARTED',
          ).tasks,
        ).toHaveLength(1);
      });

    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks/${alpha.id}`)
      .set(authHeaders(workspace, token))
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(alpha.id);
        expect(body.checklist).toHaveLength(1);
        expect(body.comments).toHaveLength(1);
        expect(body.approvals).toEqual([]);
      });

    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks/overview`)
      .set(authHeaders(workspace, token))
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBe(2);
        expect(body.overdue).toBe(1);
      });

    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks/report`)
      .set(authHeaders(workspace, token))
      .expect(200)
      .expect(({ body }) => {
        expect(body.summary.total).toBe(2);
        expect(body.tasks).toHaveLength(2);
        expect(body.workload).toEqual([]);
      });

    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks/export`)
      .query({ search: 'Alpha' })
      .set(authHeaders(workspace, token))
      .expect('Content-Type', /text\/csv/)
      .expect('Content-Disposition', 'attachment; filename="tasks.csv"')
      .expect(200)
      .expect(({ text }) => {
        expect(text).toContain('id,title,status');
        expect(text).toContain('Alpha launch plan');
        expect(text).not.toContain('Beta operations');
      });
  });

  it('serves My Tasks and the approver queue only for the active actor', async () => {
    const workspace = await createWorkspace('personal');
    const actor = actorFor(workspace);
    const project = await projects.create(actor, { name: 'Personal views' });
    const statuses = await statusesFor(project.id);
    const ownerToken = await accessToken(workspace.userId, workspace.email);
    const assignee = await createMember(workspace.organizationId, 'assignee');
    const approver = await createMember(workspace.organizationId, 'approver');
    await teams.addMember(actor, workspace.generalTeamId, assignee.membership.id);
    await teams.addMember(actor, workspace.generalTeamId, approver.membership.id);
    const assigneeProjectMembership = await participants.addMember(
      actor,
      project.id,
      assignee.membership.id,
      ProjectRole.CONTRIBUTOR,
    );
    const approverProjectMembership = await participants.addMember(
      actor,
      project.id,
      approver.membership.id,
      ProjectRole.CONTRIBUTOR,
    );
    const task = await createTask(workspace, ownerToken, project.id, {
      statusId: statuses.notStarted.id,
      title: 'Assigned approval task',
      priorityCode: 'HIGH',
    });
    await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/tasks/${task.id}/assignees`)
      .set(authHeaders(workspace, ownerToken))
      .send({ projectMembershipId: assigneeProjectMembership.id })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${task.id}/approval`)
      .set(authHeaders(workspace, ownerToken))
      .send({ approverProjectMembershipId: approverProjectMembership.id })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/tasks/${task.id}/approval-requests`)
      .set(authHeaders(workspace, ownerToken))
      .send({ reason: 'Ready to review' })
      .expect(201);

    const assigneeToken = await accessToken(assignee.user.id, assignee.user.email);
    await request(app.getHttpServer())
      .get('/api/tasks/my')
      .set(authHeaders(workspace, assigneeToken))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe(task.id);
      });
    await request(app.getHttpServer())
      .get('/api/tasks/approval-queue')
      .set(authHeaders(workspace, assigneeToken))
      .expect(200)
      .expect([]);

    const approverToken = await accessToken(approver.user.id, approver.user.email);
    await request(app.getHttpServer())
      .get('/api/tasks/approval-queue')
      .set(authHeaders(workspace, approverToken))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            taskId: task.id,
            projectId: project.id,
            requestReason: 'Ready to review',
          }),
        );
      });
  });

  it('applies the same Project visibility policy to detail, list, search and report', async () => {
    const workspace = await createWorkspace('visibility');
    const actor = actorFor(workspace);
    const project = await projects.create(actor, { name: 'Scoped reads' });
    const statuses = await statusesFor(project.id);
    const ownerToken = await accessToken(workspace.userId, workspace.email);
    const task = await createTask(workspace, ownerToken, project.id, {
      statusId: statuses.notStarted.id,
      title: 'Tenant secret',
      priorityCode: 'HIGH',
    });
    const outsider = await createMember(workspace.organizationId, 'outsider');
    const outsiderToken = await accessToken(outsider.user.id, outsider.user.email);

    for (const path of [
      `/api/projects/${project.id}/tasks`,
      `/api/projects/${project.id}/tasks?search=secret`,
      `/api/projects/${project.id}/tasks/${task.id}`,
      `/api/projects/${project.id}/tasks/report`,
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .set(authHeaders(workspace, outsiderToken))
        .expect(403);
    }

    const other = await createWorkspace('other-tenant');
    const otherToken = await accessToken(other.userId, other.email);
    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks/${task.id}`)
      .set(authHeaders(other, otherToken))
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks/report`)
      .set(authHeaders(workspace, ownerToken))
      .expect(200)
      .expect(({ body }) => expect(body.summary.total).toBe(1));
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

  async function createTask(
    workspace: Awaited<ReturnType<typeof createWorkspace>>,
    token: string,
    projectId: string,
    payload: Record<string, unknown>,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeaders(workspace, token))
      .send({ owningTeamId: workspace.generalTeamId, ...payload })
      .expect(201);
    return response.body as { id: string };
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
    };
  }

  function actorFor(workspace: { organizationId: string; membershipId: string }) {
    return {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
  }

  function authHeaders(
    workspace: { organizationId: string },
    token: string,
  ) {
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-id': workspace.organizationId,
    };
  }

  function accessToken(userId: string, email: string) {
    return jwt.signAsync(
      { sub: userId, email },
      { secret: 'local-test-access-secret' },
    );
  }
});
