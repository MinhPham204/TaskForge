import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import { createP12WorkflowFixture } from './fixtures/p12-workflow.fixture';
import { PostgresInvitationMembershipService } from '../src/modules/onboarding/application/invitation-membership.service';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  UserEntity,
  TeamMemberEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import {
  ProjectMembershipEntity,
  ProjectRole,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresTaskService } from '../src/modules/task/application/task.service';
import { PostgresTeamService } from '../src/modules/projects/application/team.service';
import { PostgresProjectParticipantService } from '../src/modules/projects/application/project-participant.service';

type Candidate = { projectMembershipId: string; name: string };
type TaskView = {
  assigneeProjectMembershipIds: string[];
  owningTeamId: string;
};
type ErrorView = { code: string };

describe('P12-06 assignment eligibility and authority', () => {
  let app: INestApplication;
  let f: Awaited<ReturnType<typeof createP12WorkflowFixture>>;
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
    f = await createP12WorkflowFixture(app);
  }, 60000);
  afterAll(async () => {
    await app?.close();
  });
  const server = () => app.getHttpServer() as Server;
  const base = () => `/api/projects/${f.scenarios.DRAFT.project.id}/tasks`;
  const path = (kind: 'manual' | 'completed' = 'manual') =>
    `${base()}/${f.scenarios.DRAFT[kind].id}`;
  const candidates = () =>
    request(server())
      .get(`${base()}/assignment-candidates`)
      .query({ teamId: f.workspace.generalTeamId });
  const actor = () => ({
    organizationId: f.workspace.organizationId,
    membershipId: f.workspace.membershipId,
  });
  const ids = async () => {
    const response = await request(server())
      .get(path())
      .set(await f.headers('pm'))
      .expect(200);
    return (response.body as TaskView).assigneeProjectMembershipIds;
  };
  it('serves scoped candidates with UUID validation and Project visibility', async () => {
    const read = await candidates()
      .set(await f.headers('pm'))
      .expect(200);
    expect(
      (read.body as Candidate[]).map(
        (member: { projectMembershipId: string }) => member.projectMembershipId,
      ),
    ).toContain(f.actors.contributor.projectMembershipId);
    expect(
      (read.body as Candidate[]).every(
        (member: { name: string }) => typeof member.name === 'string',
      ),
    ).toBe(true);
    await candidates().expect(401);
    await candidates().set(f.otherHeaders).expect(404);
    await candidates()
      .set(await f.headers('readAll'))
      .expect(200);
    await request(server())
      .get(`${base()}/assignment-candidates`)
      .query({ teamId: 'bad' })
      .set(await f.headers('pm'))
      .expect(400);
    await request(server())
      .get(`${base()}/assignment-candidates`)
      .query({ teamId: randomUUID() })
      .set(await f.headers('pm'))
      .expect(200)
      .expect(({ body }) => expect(body).toEqual([]));
  });
  it.each([
    OrganizationMembershipState.SUSPENDED,
    OrganizationMembershipState.REVOKED,
  ])(
    'rejects stale target %s after the real membership service command',
    async (state) => {
      const target = f.actors.contributor,
        service = app.get<PostgresInvitationMembershipService>(
          PostgresInvitationMembershipService,
        );
      if (state === OrganizationMembershipState.SUSPENDED)
        await service.suspendMembership(
          f.actors.pm.user.id,
          f.workspace.organizationId,
          target.user.id,
        );
      else
        await service.revokeMembership(
          f.actors.pm.user.id,
          f.workspace.organizationId,
          target.user.id,
        );
      try {
        const before = await ids();
        await request(server())
          .post(`${path()}/assignees`)
          .set(await f.headers('pm'))
          .send({ projectMembershipId: target.projectMembershipId })
          .expect(409)
          .expect(({ body }) =>
            expect((body as ErrorView).code).toBe('TASK_MEMBER_INELIGIBLE'),
          );
        expect(await ids()).toEqual(before);
        const read = await candidates()
          .set(await f.headers('pm'))
          .expect(200);
        expect(
          (read.body as Candidate[]).map(
            (member: { projectMembershipId: string }) =>
              member.projectMembershipId,
          ),
        ).not.toContain(target.projectMembershipId);
        await expect(
          app
            .get<PostgresTaskService>(PostgresTaskService)
            .assign(
              actor(),
              f.scenarios.DRAFT.project.id,
              f.scenarios.DRAFT.manual.id,
              target.projectMembershipId,
            ),
        ).rejects.toThrow('active Organization');
      } finally {
        await f.db
          .getRepository(OrganizationMembershipEntity)
          .update(target.membership.id, {
            state: OrganizationMembershipState.ACTIVE,
          });
      }
    },
  );
  it('rejects disabled User targets and filters them from candidates', async () => {
    const target = f.actors.contributor;
    await f.db
      .getRepository(UserEntity)
      .update(target.user.id, { disabledAt: new Date() });
    try {
      await request(server())
        .post(`${path()}/assignees`)
        .set(await f.headers('pm'))
        .send({ projectMembershipId: target.projectMembershipId })
        .expect(409);
      const read = await candidates()
        .set(await f.headers('pm'))
        .expect(200);
      expect(
        (read.body as Candidate[]).map(
          (member: { projectMembershipId: string }) =>
            member.projectMembershipId,
        ),
      ).not.toContain(target.projectMembershipId);
    } finally {
      await f.db
        .getRepository(UserEntity)
        .update(target.user.id, { disabledAt: null });
    }
  });
  it.each(['project', 'team'] as const)(
    'rejects removed target %s relations without persisting an assignment',
    async (kind) => {
      const target = f.actors.contributor;
      const restore =
        kind === 'project'
          ? () =>
              f.db
                .getRepository(ProjectMembershipEntity)
                .update(target.projectMembershipId, { removedAt: null })
          : () =>
              f.db.getRepository(TeamMemberEntity).update(
                {
                  organizationId: f.workspace.organizationId,
                  teamId: f.workspace.generalTeamId,
                  organizationMembershipId: target.membership.id,
                },
                { removedAt: null },
              );
      if (kind === 'project')
        await f.db
          .getRepository(ProjectMembershipEntity)
          .update(target.projectMembershipId, { removedAt: new Date() });
      else
        await f.db.getRepository(TeamMemberEntity).update(
          {
            organizationId: f.workspace.organizationId,
            teamId: f.workspace.generalTeamId,
            organizationMembershipId: target.membership.id,
          },
          { removedAt: new Date() },
        );
      try {
        await request(server())
          .post(`${path()}/assignees`)
          .set(await f.headers('pm'))
          .send({ projectMembershipId: target.projectMembershipId })
          .expect(kind === 'project' ? 404 : 409);
        expect(await ids()).not.toContain(target.projectMembershipId);
        const read = await candidates()
          .set(await f.headers('pm'))
          .expect(200);
        expect(
          (read.body as Candidate[]).map(
            (member: { projectMembershipId: string }) =>
              member.projectMembershipId,
          ),
        ).not.toContain(target.projectMembershipId);
      } finally {
        await restore();
      }
    },
  );
  it('requires PM authority even for Contributor creator or read-all actor, rejects foreign/stale IDs', async () => {
    for (const label of [
      'creator',
      'assignee',
      'contributor',
      'readAll',
    ] as const) {
      await request(server())
        .post(`${path()}/assignees`)
        .set(await f.headers(label))
        .send({ projectMembershipId: f.actors.contributor.projectMembershipId })
        .expect(403);
    }
    await request(server())
      .post(`${path()}/assignees`)
      .set(await f.headers('pm'))
      .send({ projectMembershipId: randomUUID() })
      .expect(404);
    const foreign = await f.db
      .getRepository(ProjectMembershipEntity)
      .findOneByOrFail({
        projectId: f.scenarios.ACTIVE.project.id,
        organizationMembershipId: f.actors.contributor.membership.id,
      });
    await request(server())
      .post(`${path()}/assignees`)
      .set(await f.headers('pm'))
      .send({ projectMembershipId: foreign.id })
      .expect(404);
    await f.db.getRepository(ProjectMembershipEntity).update(
      {
        projectId: f.scenarios.DRAFT.project.id,
        organizationMembershipId: f.workspace.membershipId,
      },
      { role: ProjectRole.CONTRIBUTOR },
    );
    try {
      await request(server())
        .post(`${path()}/assignees`)
        .set(await f.headers('pm'))
        .send({ projectMembershipId: f.actors.contributor.projectMembershipId })
        .expect(403);
    } finally {
      await f.db.getRepository(ProjectMembershipEntity).update(
        {
          projectId: f.scenarios.DRAFT.project.id,
          organizationMembershipId: f.workspace.membershipId,
        },
        { role: ProjectRole.PROJECT_MANAGER },
      );
    }
  });
  it('rechecks inactive/disabled/removed actors inside service commands and HTTP', async () => {
    const target = f.actors.creator;
    const projectMembers = f.db.getRepository(ProjectMembershipEntity);
    const memberships = f.db.getRepository(OrganizationMembershipEntity);
    const users = f.db.getRepository(UserEntity);
    const tasks = app.get<PostgresTaskService>(PostgresTaskService);
    const lifecycle = app.get<PostgresInvitationMembershipService>(
      PostgresInvitationMembershipService,
    );
    const managerActor = {
      organizationId: f.workspace.organizationId,
      membershipId: target.membership.id,
    };
    const assign = () =>
      tasks.assign(
        managerActor,
        f.scenarios.DRAFT.project.id,
        f.scenarios.DRAFT.manual.id,
        f.actors.contributor.projectMembershipId,
      );
    await projectMembers.update(target.projectMembershipId, {
      role: ProjectRole.PROJECT_MANAGER,
    });
    try {
      await lifecycle.suspendMembership(
        f.actors.pm.user.id,
        f.workspace.organizationId,
        target.user.id,
      );
      await expect(assign()).rejects.toThrow('enabled account');
      await request(server())
        .post(`${path()}/assignees`)
        .set(await f.headers('creator'))
        .send({ projectMembershipId: f.actors.contributor.projectMembershipId })
        .expect(403);
      await memberships.update(target.membership.id, {
        state: OrganizationMembershipState.ACTIVE,
      });
      await users.update(target.user.id, { disabledAt: new Date() });
      await expect(assign()).rejects.toThrow('enabled account');
      await request(server())
        .post(`${path()}/assignees`)
        .set(await f.headers('creator'))
        .send({ projectMembershipId: f.actors.contributor.projectMembershipId })
        .expect((response) => expect([401, 403]).toContain(response.status));
      await users.update(target.user.id, { disabledAt: null });
      await projectMembers.update(target.projectMembershipId, {
        removedAt: new Date(),
      });
      await expect(assign()).rejects.toThrow('Active Project membership');
      await request(server())
        .post(`${path()}/assignees`)
        .set(await f.headers('creator'))
        .send({ projectMembershipId: f.actors.contributor.projectMembershipId })
        .expect(403);
    } finally {
      await users.update(target.user.id, { disabledAt: null });
      await memberships.update(target.membership.id, {
        state: OrganizationMembershipState.ACTIVE,
      });
      await projectMembers.update(target.projectMembershipId, {
        role: ProjectRole.CONTRIBUTOR,
        removedAt: null,
      });
    }
  });
  it('preserves many assignees, explicit remove and Completed Task assignment in mutable Projects', async () => {
    const target = f.actors.contributor.projectMembershipId,
      original = f.actors.assignee.projectMembershipId;
    await request(server())
      .post(`${path()}/assignees`)
      .set(await f.headers('pm'))
      .send({ projectMembershipId: target })
      .expect(201);
    expect(await ids()).toEqual(expect.arrayContaining([target, original]));
    await request(server())
      .delete(`${path()}/assignees/${target}`)
      .set(await f.headers('pm'))
      .expect(200);
    expect(await ids()).toEqual([original]);
    await request(server())
      .post(`${path('completed')}/assignees`)
      .set(await f.headers('pm'))
      .send({ projectMembershipId: target })
      .expect(201);
    await request(server())
      .delete(`${path('completed')}/assignees/${target}`)
      .set(await f.headers('pm'))
      .expect(200);
    await request(server())
      .post(
        `/api/projects/${f.scenarios.COMPLETED.project.id}/tasks/${f.scenarios.COMPLETED.completed.id}/assignees`,
      )
      .set(await f.headers('pm'))
      .send({ projectMembershipId: target })
      .expect(409);
  });
  it('blocks an incompatible owning-Team change without automatic unassignment', async () => {
    const team = await app
      .get<PostgresTeamService>(PostgresTeamService)
      .create(actor(), { name: 'P12 isolated owning Team' });
    await app
      .get<PostgresProjectParticipantService>(PostgresProjectParticipantService)
      .addTeam(actor(), f.scenarios.DRAFT.project.id, team.id);
    await app
      .get<PostgresTeamService>(PostgresTeamService)
      .addMember(actor(), team.id, f.actors.contributor.membership.id);
    const before = await ids();
    await request(server())
      .patch(path())
      .set(await f.headers('pm'))
      .send({ owningTeamId: team.id })
      .expect(409)
      .expect(({ body }) =>
        expect((body as ErrorView).code).toBe('TASK_ASSIGNEE_TEAM_REQUIRED'),
      );
    expect(await ids()).toEqual(before);
    const read = await request(server())
      .get(path())
      .set(await f.headers('pm'))
      .expect(200);
    expect((read.body as TaskView).owningTeamId).toBe(
      f.workspace.generalTeamId,
    );
    const eligible = await request(server())
      .get(`${base()}/assignment-candidates`)
      .query({ teamId: team.id })
      .set(await f.headers('pm'))
      .expect(200);
    expect(
      (eligible.body as Candidate[]).map(
        (member: { projectMembershipId: string }) => member.projectMembershipId,
      ),
    ).toEqual([f.actors.contributor.projectMembershipId]);
  });
  it('drives candidate selection, multiple assignment and assignee editing from the actual frontend MyTasks consumer', async () => {
    await app.listen(0, '127.0.0.1');
    const pm = await f.headers('pm');
    const assignee = await f.headers('assignee');
    const baseURL = await app.getUrl();
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [
          join(
            __dirname,
            '../../frontend/scripts/p12-assignment-integration.mjs',
          ),
        ],
        { timeout: 60000 },
        (error, stdout, stderr) => {
          if (error)
            reject(new Error(`Frontend assignment probe failed: ${stderr}`));
          else resolve(stdout);
        },
      );
      child.stdin!.end(
        JSON.stringify({
          baseURL,
          projectId: f.scenarios.DRAFT.project.id,
          taskId: f.scenarios.DRAFT.manual.id,
          teamId: f.workspace.generalTeamId,
          organizationId: f.workspace.organizationId,
          pmAccessToken: pm.Authorization.slice(7),
          pmUserId: f.actors.pm.user.id,
          assigneeAccessToken: assignee.Authorization.slice(7),
          assigneeUserId: f.actors.assignee.user.id,
          secondAssigneeId: f.actors.contributor.projectMembershipId,
        }),
      );
    });
    expect(output).toContain(
      'actual frontend assignment/MyTasks editor HTTP acceptance passed',
    );
  }, 90000);
});
