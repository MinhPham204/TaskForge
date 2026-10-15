import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import { ProjectMembershipEntity } from '../src/modules/projects/persistence/typeorm/project.entities';
import { createP12WorkflowFixture } from './fixtures/p12-workflow.fixture';

describe('P12-02 Task read/policy/error HTTP contracts', () => {
  let app: INestApplication;
  let f: Awaited<ReturnType<typeof createP12WorkflowFixture>>;
  let storageRoot: string;
  const previousRoot = process.env.STORAGE_LOCAL_ROOT;
  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'taskforge-p12-contract-'));
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
    f = await createP12WorkflowFixture(app);
  }, 60000);
  afterAll(async () => {
    await app?.close();
    if (previousRoot === undefined) delete process.env.STORAGE_LOCAL_ROOT;
    else process.env.STORAGE_LOCAL_ROOT = previousRoot;
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });
  const taskPath = (
    state = 'DRAFT',
    kind: 'manual' | 'checklist' | 'approval' | 'completed' = 'manual',
  ) =>
    `/api/projects/${f.scenarios[state].project.id}/tasks/${f.scenarios[state][kind].id}`;

  it('serves the same canonical content/capabilities on List/Board/detail and the actual frontend contract reader', async () => {
    const s = f.scenarios.DRAFT;
    const headers = await f.headers('creator');
    const detail = await request(app.getHttpServer())
      .get(taskPath())
      .set(headers)
      .expect(200);
    const list = await request(app.getHttpServer())
      .get(`/api/projects/${s.project.id}/tasks`)
      .set(headers)
      .expect(200);
    const board = await request(app.getHttpServer())
      .get(`/api/projects/${s.project.id}/tasks/board`)
      .set(headers)
      .expect(200);
    const entries = [
      list.body.find((t: { id: string }) => t.id === s.manual.id),
      board.body
        .flatMap((c: { tasks: unknown[] }) => c.tasks)
        .find((t: { id: string }) => t.id === s.manual.id),
    ];
    for (const entry of entries) {
      expect(entry.milestoneId).toBe(s.milestoneId);
      expect(entry.effectiveProgress).toBe(45);
      expect(entry.dueAt).toBe('2026-12-01T09:30:00.000Z');
      expect(entry.capabilities).toEqual(detail.body.capabilities);
      expect(Object.keys(entry).some((key) => key.startsWith('_'))).toBe(false);
    }
    expect(
      execFileSync(
        process.execPath,
        [join(__dirname, '../../frontend/scripts/p12-contract-check.mjs')],
        {
          input: JSON.stringify(detail.body),
          encoding: 'utf8',
        },
      ),
    ).toContain('canonical Task HTTP consumer contract passed');
  });
  it.each(['pm', 'creator', 'assignee', 'contributor', 'readAll'] as const)(
    'reports per-command authority for %s and matches direct API denials',
    async (label) => {
      const headers = await f.headers(label);
      const read = await request(app.getHttpServer())
        .get(taskPath())
        .set(headers)
        .expect(200);
      const c = read.body.capabilities;
      const execution = ['pm', 'creator', 'assignee'].includes(label);
      expect(c.editContent.allowed).toBe(execution);
      expect(c.editProgress.allowed).toBe(execution);
      expect(c.transition.allowed).toBe(execution);
      expect(c.editManagement.allowed).toBe(label === 'pm');
      expect(c.assign.allowed).toBe(label === 'pm');
      expect(c.unassign.allowed).toBe(label === 'pm');
      expect(c.configureApproval.allowed).toBe(label === 'pm');
      expect(c.readAttachments.allowed).toBe(true);
      expect(c.uploadAttachment.allowed).toBe(label !== 'readAll');
      expect(c.unlinkAttachment.allowed).toBe(label !== 'readAll');
      if (!execution) {
        const denied = await request(app.getHttpServer())
          .patch(taskPath())
          .set(headers)
          .send({ title: 'denied' })
          .expect(403);
        expect(denied.body.code).toBe(c.editContent.reason);
      }
      if (label !== 'pm') {
        const denied = await request(app.getHttpServer())
          .patch(taskPath())
          .set(headers)
          .send({ priorityCode: 'HIGH' })
          .expect(403);
        // Update's existing management-first check runs after requiring active Project membership.
        expect(denied.body.code).toBe(c.editManagement.reason);
      }
    },
  );
  it('distinguishes manual/checklist/completion/approval restrictions without denying all transitions', async () => {
    const headers = await f.headers('pm');
    const checklist = await request(app.getHttpServer())
      .get(taskPath('DRAFT', 'checklist'))
      .set(headers)
      .expect(200);
    expect(checklist.body.effectiveProgress).toBe(33);
    expect(checklist.body.capabilities.editProgress).toEqual({
      allowed: false,
      reason: 'TASK_PROGRESS_CHECKLIST_DERIVED',
    });
    expect(checklist.body.capabilities.editChecklist.allowed).toBe(true);
    expect(checklist.body.capabilities.transition.allowed).toBe(true);
    const completed = await request(app.getHttpServer())
      .get(taskPath('DRAFT', 'completed'))
      .set(headers)
      .expect(200);
    expect(completed.body.effectiveProgress).toBe(100);
    expect(completed.body.capabilities.editProgress.reason).toBe(
      'TASK_COMPLETED',
    );
    expect(completed.body.capabilities.editChecklist.reason).toBe(
      'TASK_COMPLETED',
    );
    for (const action of [
      'assign',
      'unassign',
      'uploadAttachment',
      'unlinkAttachment',
      'transition',
    ]) {
      expect(completed.body.capabilities[action].allowed).toBe(true);
    }
    const statusId = f.scenarios.DRAFT.statuses.find(
      (s) => s.semanticCategory === 'COMPLETED',
    )!.id;
    for (const [kind, code] of [
      ['checklist', 'TASK_CHECKLIST_INCOMPLETE'],
      ['approval', 'TASK_APPROVAL_REQUIRED'],
    ] as const) {
      await request(app.getHttpServer())
        .patch(`${taskPath('DRAFT', kind)}/status`)
        .set(headers)
        .send({ statusId })
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe(code));
    }
    await request(app.getHttpServer())
      .patch(`${taskPath('DRAFT', 'completed')}/status`)
      .set(headers)
      .send({
        statusId: f.scenarios.DRAFT.statuses.find(
          (s) => s.semanticCategory === 'NOT_STARTED',
        )!.id,
      })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('TASK_TRANSITION_INVALID'));
    await request(app.getHttpServer())
      .patch(`${taskPath('DRAFT', 'completed')}/manual-progress`)
      .set(headers)
      .send({ manualProgress: 45 })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('TASK_COMPLETED'));
    await request(app.getHttpServer())
      .patch(`${taskPath('DRAFT', 'checklist')}/manual-progress`)
      .set(headers)
      .send({ manualProgress: 45 })
      .expect(409)
      .expect(({ body }) =>
        expect(body.code).toBe('TASK_PROGRESS_CHECKLIST_DERIVED'),
      );
    await request(app.getHttpServer())
      .post(`${taskPath('DRAFT', 'approval')}/approval-requests`)
      .set(await f.headers('creator'))
      .send({ reason: 'Ready' })
      .expect(201);
    const pending = await request(app.getHttpServer())
      .get(taskPath('DRAFT', 'approval'))
      .set(headers)
      .expect(200);
    expect(pending.body.capabilities.configureApproval.reason).toBe(
      'TASK_APPROVAL_PENDING',
    );
    await request(app.getHttpServer())
      .patch(`${taskPath('DRAFT', 'approval')}/approval`)
      .set(headers)
      .send({ approverProjectMembershipId: null })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('TASK_APPROVAL_PENDING'));
  });
  it('My Tasks has canonical capabilities across four Projects using one task query, and excludes another actor', async () => {
    const spy = jest.spyOn(f.db.logger, 'logQuery');
    try {
      const mine = await request(app.getHttpServer())
        .get('/api/tasks/my')
        .set(await f.headers('assignee'))
        .expect(200);
      expect(mine.body).toHaveLength(4);
      expect(
        spy.mock.calls.filter(([sql]) => sql.includes('FROM tasks t')),
      ).toHaveLength(1);
      for (const state of ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']) {
        const s = f.scenarios[state];
        const row = mine.body.find((t: { id: string }) => t.id === s.manual.id);
        const detail = await request(app.getHttpServer())
          .get(taskPath(state))
          .set(await f.headers('assignee'))
          .expect(200);
        expect(row.capabilities).toEqual(detail.body.capabilities);
        expect(row.milestoneId).toBe(s.milestoneId);
        expect(row.capabilities.editContent.allowed).toBe(
          ['DRAFT', 'ACTIVE'].includes(state),
        );
      }
      await request(app.getHttpServer())
        .get('/api/tasks/my')
        .set(await f.headers('readAll'))
        .expect(200)
        .expect([]);
      await request(app.getHttpServer())
        .get('/api/tasks/my')
        .set(f.otherHeaders)
        .expect(200)
        .expect([]);
    } finally {
      spy.mockRestore();
    }
  });
  it.each(['COMPLETED', 'ARCHIVED'])(
    'closed Project %s denies content, assignment and file mutation with the same capability reason',
    async (state) => {
      const headers = await f.headers('pm');
      const read = await request(app.getHttpServer())
        .get(taskPath(state))
        .set(headers)
        .expect(200);
      for (const action of [
        'editContent',
        'editManagement',
        'editProgress',
        'editChecklist',
        'transition',
        'assign',
        'unassign',
        'configureApproval',
        'uploadAttachment',
        'unlinkAttachment',
      ]) {
        expect(read.body.capabilities[action]).toEqual({
          allowed: false,
          reason: 'PROJECT_READ_ONLY',
        });
      }
      await request(app.getHttpServer())
        .patch(taskPath(state))
        .set(headers)
        .send({ title: 'denied' })
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('PROJECT_READ_ONLY'));
      await request(app.getHttpServer())
        .post(`${taskPath(state)}/attachments`)
        .set(headers)
        .attach('file', Buffer.from('safe text'), {
          filename: 'safe.txt',
          contentType: 'text/plain',
        })
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('PROJECT_READ_ONLY'));
      await request(app.getHttpServer())
        .delete(`${taskPath(state)}/attachments/${randomUUID()}`)
        .set(headers)
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('PROJECT_READ_ONLY'));
    },
  );
  it('preserves attachment authority on completed Tasks and readonly access while enforcing archived Task state', async () => {
    const headers = await f.headers('creator');
    const path = taskPath('ACTIVE', 'completed');
    const file = await request(app.getHttpServer())
      .post(`${path}/attachments`)
      .set(headers)
      .attach('file', Buffer.from('safe text'), {
        filename: 'safe.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`${path}/attachments/${file.body.id}/download`)
      .set(await f.headers('readAll'))
      .expect(200);
    await request(app.getHttpServer())
      .delete(`${path}/attachments/${file.body.id}`)
      .set(await f.headers('readAll'))
      .expect(403)
      .expect(({ body }) =>
        expect(body.code).toBe('PROJECT_MEMBERSHIP_REQUIRED'),
      );
    await request(app.getHttpServer())
      .delete(`${path}/attachments/${file.body.id}`)
      .set(await f.headers('contributor'))
      .expect(200);
    await request(app.getHttpServer())
      .delete(path)
      .set(await f.headers('pm'))
      .expect(200);
    await request(app.getHttpServer())
      .post(`${path}/attachments`)
      .set(headers)
      .attach('file', Buffer.from('safe text'), {
        filename: 'safe.txt',
        contentType: 'text/plain',
      })
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('RESOURCE_NOT_FOUND'));
    await request(app.getHttpServer())
      .get(path)
      .set(headers)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('RESOURCE_NOT_FOUND'));
    await request(app.getHttpServer())
      .patch(path)
      .set(headers)
      .send({ title: 'denied' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('TASK_ARCHIVED'));
    await request(app.getHttpServer())
      .delete(`${path}/attachments/${file.body.id}`)
      .set(headers)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('TASK_ARCHIVED'));
  });
  it('preserves cross-tenant/validation/session status and emits stable codes', async () => {
    const server = app.getHttpServer();
    const headers = await f.headers('creator');
    await request(server)
      .get(taskPath())
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe('AUTH_SESSION_REQUIRED');
        expect(body.message).toBe('Bearer access token is required');
      });
    await request(server)
      .get(taskPath())
      .set({
        ...f.otherHeaders,
        'x-organization-id': f.workspace.organizationId,
      })
      .expect(403)
      .expect(({ body }) =>
        expect(body.code).toBe('TENANT_MEMBERSHIP_REQUIRED'),
      );
    for (const path of [
      taskPath(),
      `/api/projects/${f.scenarios.DRAFT.project.id}/tasks`,
      `/api/projects/${f.scenarios.DRAFT.project.id}/tasks/board`,
    ]) {
      await request(server)
        .get(path)
        .set(f.otherHeaders)
        .expect(404)
        .expect(({ body }) => expect(body.code).toBe('RESOURCE_NOT_FOUND'));
    }
    await request(server)
      .patch(`${taskPath()}/manual-progress`)
      .set(headers)
      .send({ manualProgress: 101 })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('REQUEST_VALIDATION_FAILED');
        expect(Array.isArray(body.message)).toBe(true);
      });
  });
  it('rechecks membership after the client has read an allowed capability', async () => {
    const actor = f.actors.assignee;
    const headers = await f.headers('assignee');
    await request(app.getHttpServer())
      .get(taskPath())
      .set(headers)
      .expect(200)
      .expect(({ body }) =>
        expect(body.capabilities.editContent.allowed).toBe(true),
      );
    await f.db
      .getRepository(ProjectMembershipEntity)
      .update(actor.projectMembershipId, { removedAt: new Date() });
    try {
      await request(app.getHttpServer())
        .patch(taskPath())
        .set(headers)
        .send({ title: 'stale permission' })
        .expect(403)
        .expect(({ body }) =>
          expect(body.code).toBe('PROJECT_MEMBERSHIP_REQUIRED'),
        );
      await request(app.getHttpServer())
        .get(taskPath())
        .set(headers)
        .expect(403);
      const my = await request(app.getHttpServer())
        .get('/api/tasks/my')
        .set(headers)
        .expect(200);
      expect(
        my.body.some(
          (t: { id: string }) => t.id === f.scenarios.DRAFT.manual.id,
        ),
      ).toBe(false);
    } finally {
      await f.db
        .getRepository(ProjectMembershipEntity)
        .update(actor.projectMembershipId, { removedAt: null });
    }
  });
});
