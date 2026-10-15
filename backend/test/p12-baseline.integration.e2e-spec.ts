import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { TaskEntity } from '../src/modules/task/persistence/typeorm/task.entities';
import { createP12WorkflowFixture } from './fixtures/p12-workflow.fixture';
import { PostgresInvitationMembershipService } from '../src/modules/onboarding/application/invitation-membership.service';

// Characterization of 2026-10-09 behavior, including known defects.
// Not part of critical regression: convert defect assertions in their owning P12 task.
describe('P12-01 current behavior baseline (not fixed acceptance)', () => {
  let app: INestApplication;
  let fixture: Awaited<ReturnType<typeof createP12WorkflowFixture>>;
  let storageRoot: string;
  const oldRoot = process.env.STORAGE_LOCAL_ROOT;
  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'taskforge-p12-'));
    process.env.STORAGE_LOCAL_ROOT = storageRoot;
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
    fixture = await createP12WorkflowFixture(app);
  }, 60000);
  afterAll(async () => {
    await app?.close();
    if (oldRoot === undefined) delete process.env.STORAGE_LOCAL_ROOT;
    else process.env.STORAGE_LOCAL_ROOT = oldRoot;
    // Only this suite's mkdtemp directory, never backend/uploads or a configured root.
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });
  const path = (
    scenario = 'DRAFT',
    kind: 'manual' | 'checklist' | 'approval' | 'completed' = 'manual',
  ) => {
    const s = fixture.scenarios[scenario];
    return `/api/projects/${s.project.id}/tasks/${s[kind].id}`;
  };
  it('persists and serves progress 45 and milestone on detail/Board (P12-02 fixed contract)', async () => {
    const s = fixture.scenarios.DRAFT;
    const persisted = await fixture.db
      .getRepository(TaskEntity)
      .findOneByOrFail({ id: s.manual.id });
    expect(persisted.manualProgress).toBe(45);
    expect(persisted.milestoneId).toBe(s.milestoneId);
    const detail = await request(app.getHttpServer())
      .get(path())
      .set(await fixture.headers('creator'))
      .expect(200);
    expect(detail.body.effectiveProgress).toBe(45);
    expect(detail.body.milestoneId).toBe(s.milestoneId);
    const board = await request(app.getHttpServer())
      .get(`/api/projects/${s.project.id}/tasks/board`)
      .set(await fixture.headers('pm'))
      .expect(200);
    const card = board.body
      .flatMap((c: { tasks: unknown[] }) => c.tasks)
      .find((t: { id: string }) => t.id === s.manual.id);
    expect(card.effectiveProgress).toBe(45);
    expect(card).not.toHaveProperty('progress');
    expect(card.milestoneId).toBe(s.milestoneId);
  });
  it('accepts creator content patch, denies management and unrelated execution; read-all is read only', async () => {
    await request(app.getHttpServer())
      .patch(path())
      .set(await fixture.headers('creator'))
      .send({ title: 'Saved content', description: '' })
      .expect(200);
    const read = await request(app.getHttpServer())
      .get(path())
      .set(await fixture.headers('readAll'))
      .expect(200);
    expect(read.body.title).toBe('Saved content');
    expect(read.body.description).toBe('');
    for (const label of ['creator', 'contributor', 'readAll'] as const) {
      await request(app.getHttpServer())
        .patch(path())
        .set(await fixture.headers(label))
        .send({ priorityCode: 'HIGH' })
        .expect(403);
    }
    await request(app.getHttpServer())
      .patch(`${path()}/manual-progress`)
      .set(await fixture.headers('contributor'))
      .send({ manualProgress: 20 })
      .expect(403);
    await request(app.getHttpServer())
      .get(path())
      .set(fixture.otherHeaders)
      .expect(404);
    await request(app.getHttpServer()).get(path()).expect(401);
  });
  it('allows active assignee execution but only PM can assign, including completed Tasks', async () => {
    const payload = {
      projectMembershipId: fixture.actors.assignee.projectMembershipId,
    };
    await request(app.getHttpServer())
      .post(`${path()}/assignees`)
      .set(await fixture.headers('creator'))
      .send(payload)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${path()}/assignees`)
      .set(await fixture.headers('pm'))
      .send(payload)
      .expect(409); // Fixture already has this active assignee; duplicate remains rejected.
    await request(app.getHttpServer())
      .patch(`${path()}/manual-progress`)
      .set(await fixture.headers('assignee'))
      .send({ manualProgress: 46 })
      .expect(200);
    await request(app.getHttpServer())
      .post(`${path('DRAFT', 'completed')}/assignees`)
      .set(await fixture.headers('pm'))
      .send(payload)
      .expect(201);
  });
  it.each([
    OrganizationMembershipState.SUSPENDED,
    OrganizationMembershipState.REVOKED,
  ])('rejects stale target Org state %s (P12-06 fixed)', async (state) => {
    const target = fixture.actors.contributor;
    const memberships = app.get(PostgresInvitationMembershipService);
    const command =
      state === OrganizationMembershipState.SUSPENDED
        ? memberships.suspendMembership.bind(memberships)
        : memberships.revokeMembership.bind(memberships);
    await command(
      fixture.actors.pm.user.id,
      fixture.workspace.organizationId,
      target.user.id,
    );
    try {
      await request(app.getHttpServer())
        .post(`${path()}/assignees`)
        .set(await fixture.headers('pm'))
        .send({ projectMembershipId: target.projectMembershipId })
        .expect(409)
          .expect(({ body }) => expect((body as { code: string }).code).toBe('TASK_MEMBER_INELIGIBLE'));
    } finally {
      await fixture.db
        .getRepository(OrganizationMembershipEntity)
        .update(target.membership.id, {
          state: OrganizationMembershipState.ACTIVE,
        });
    }
  });
  it('rejects disabled target User (P12-06 fixed)', async () => {
    const target = fixture.actors.contributor;
    await fixture.db
      .getRepository(UserEntity)
      .update(target.user.id, { disabledAt: new Date() });
    try {
      await request(app.getHttpServer())
        .post(`${path()}/assignees`)
        .set(await fixture.headers('pm'))
        .send({ projectMembershipId: target.projectMembershipId })
        .expect(409)
        .expect(({ body }) => expect((body as { code: string }).code).toBe('TASK_MEMBER_INELIGIBLE'));
    } finally {
      await fixture.db
        .getRepository(UserEntity)
        .update(target.user.id, { disabledAt: null });
    }
  });
  it('returns checklist 33; manual override, incomplete completion and unapproved completion return 409', async () => {
    const headers = await fixture.headers('creator');
    const read = await request(app.getHttpServer())
      .get(path('DRAFT', 'checklist'))
      .set(headers)
      .expect(200);
    expect(read.body.effectiveProgress).toBe(33);
    await request(app.getHttpServer())
      .patch(`${path('DRAFT', 'checklist')}/manual-progress`)
      .set(headers)
      .send({ manualProgress: 45 })
      .expect(409);
    const statusId = fixture.scenarios.DRAFT.statuses.find(
      (s) => s.semanticCategory === 'COMPLETED',
    )!.id;
    for (const kind of ['checklist', 'approval'] as const) {
      await request(app.getHttpServer())
        .patch(`${path('DRAFT', kind)}/status`)
        .set(headers)
        .send({ statusId })
        .expect(409);
    }
  });
  it.each(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'])(
    'captures Task vs file mutation behavior for Project %s',
    async (state) => {
      const headers = await fixture.headers('creator');
      await request(app.getHttpServer())
        .patch(path(state))
        .set(headers)
        .send({ title: 'Lifecycle probe' })
        .expect(['DRAFT', 'ACTIVE'].includes(state) ? 200 : 409);
      // P12-02 shared capability/mutation prerequisite: terminal Projects are read only.
      if (['COMPLETED', 'ARCHIVED'].includes(state)) {
        await request(app.getHttpServer())
          .post(`${path(state, 'completed')}/attachments`)
          .set(headers)
          .attach('file', Buffer.from('p12 harmless text'), {
            filename: 'baseline.txt',
            contentType: 'text/plain',
          })
          .expect(409)
          .expect(({ body }) => expect(body.code).toBe('PROJECT_READ_ONLY'));
        return;
      }
      const upload = await request(app.getHttpServer())
        .post(`${path(state, 'completed')}/attachments`)
        .set(headers)
        .attach('file', Buffer.from('p12 harmless text'), {
          filename: 'baseline.txt',
          contentType: 'text/plain',
        })
        .expect(201);
      const url = `${path(state, 'completed')}/attachments`;
      await request(app.getHttpServer())
        .get(url)
        .set(await fixture.headers('readAll'))
        .expect(200);
      const download = await request(app.getHttpServer())
        .get(`${url}/${upload.body.id}/download`)
        .set(await fixture.headers('readAll'))
        .expect(200);
      expect(download.text).toBe('p12 harmless text');
      await request(app.getHttpServer())
        .delete(`${url}/${upload.body.id}`)
        .set(await fixture.headers('readAll'))
        .expect(403);
      await request(app.getHttpServer())
        .delete(`${url}/${upload.body.id}`)
        .set(await fixture.headers('contributor'))
        .expect(200);
      await request(app.getHttpServer())
        .get(`${url}/${upload.body.id}/download`)
        .set(headers)
        .expect(404);
    },
  );
  it('missing reset route returns 404 (signup OTP excluded by user)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'p12-new@example.test' })
      .expect(404);
  });
  it('captures sanitized denial responses without identities or auth headers', async () => {
    const server = app.getHttpServer();
    const completedStatus = fixture.scenarios.DRAFT.statuses.find(
      (s) => s.semanticCategory === 'COMPLETED',
    )!.id;
    const notStarted = fixture.scenarios.DRAFT.statuses.find(
      (s) => s.semanticCategory === 'NOT_STARTED',
    )!.id;
    const cases = [
      ['missing_session', await request(server).get(path()), 401],
      [
        'wrong_active_tenant',
        await request(server)
          .get(path())
          .set({
            ...fixture.otherHeaders,
            'x-organization-id': fixture.workspace.organizationId,
          }),
        403,
      ],
      [
        'no_project_membership',
        await request(server)
          .patch(`${path()}/status`)
          .set(await fixture.headers('readAll'))
          .send({ statusId: completedStatus }),
        403,
      ],
      [
        'no_execution_relation',
        await request(server)
          .patch(`${path()}/status`)
          .set(await fixture.headers('contributor'))
          .send({ statusId: completedStatus }),
        403,
      ],
      [
        'management_requires_pm',
        await request(server)
          .patch(path())
          .set(await fixture.headers('creator'))
          .send({ priorityCode: 'HIGH' }),
        403,
      ],
      [
        'invalid_transition',
        await request(server)
          .patch(`${path('DRAFT', 'completed')}/status`)
          .set(await fixture.headers('creator'))
          .send({ statusId: notStarted }),
        409,
      ],
      [
        'checklist_blocks_completion',
        await request(server)
          .patch(`${path('DRAFT', 'checklist')}/status`)
          .set(await fixture.headers('creator'))
          .send({ statusId: completedStatus }),
        409,
      ],
      [
        'approval_blocks_completion',
        await request(server)
          .patch(`${path('DRAFT', 'approval')}/status`)
          .set(await fixture.headers('creator'))
          .send({ statusId: completedStatus }),
        409,
      ],
      [
        'closed_project',
        await request(server)
          .patch(path('COMPLETED'))
          .set(await fixture.headers('creator'))
          .send({ title: 'denied' }),
        409,
      ],
      [
        'dto_validation',
        await request(server)
          .patch(`${path()}/manual-progress`)
          .set(await fixture.headers('creator'))
          .send({ manualProgress: 101 }),
        400,
      ],
    ] as const;
    for (const [name, response, expected] of cases) {
      expect(response.status).toBe(expected);
      console.info(
        JSON.stringify({
          case: name,
          status: response.status,
          message: response.body.message,
          code: response.body.code ?? null,
        }),
      );
    }
  });
});
