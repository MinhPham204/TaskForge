import {
  ConflictException,
  INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import request from 'supertest';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import {
  PostgresTransactionRunner,
  type PostgresTransactionWork,
  type PostgresIsolationLevel,
} from '../src/database/transaction-runner';
import {
  LocalFileStorageAdapter,
  PostgresFileStorageService,
  type FileStorageAdapter,
} from '../src/modules/collaboration/application/file-storage';
import { PostgresFileRelationService } from '../src/modules/collaboration/application/file-relation.service';
import { PostgresCollaborationService } from '../src/modules/collaboration/application/collaboration.service';
import { PostgresStoredFileRepository } from '../src/modules/collaboration/persistence/typeorm/collaboration.repositories';
import {
  StoredFileEntity,
  TaskAttachmentEntity,
} from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';
import {
  ProjectEntity,
  ProjectState,
  ProjectModuleSettingEntity,
  ProjectModuleCode,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { TaskEntity } from '../src/modules/task/persistence/typeorm/task.entities';
import { UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { createP12WorkflowFixture } from './fixtures/p12-workflow.fixture';

class TrackingStorage implements FileStorageAdapter {
  readonly providerCode = 'local-filesystem';
  puts = 0;
  removals = 0;
  failRemovals = 0;
  readonly objects = new Set<string>();
  afterPut: (() => Promise<void>) | undefined;
  constructor(private readonly delegate: LocalFileStorageAdapter) {}
  async put(key: string, bytes: Buffer) {
    await this.delegate.put(key, bytes);
    this.puts++;
    this.objects.add(key);
    await this.afterPut?.();
  }
  get(key: string) {
    return this.delegate.get(key);
  }
  async remove(key: string) {
    this.removals++;
    if (this.failRemovals-- > 0) throw new Error('simulated cleanup outage');
    await this.delegate.remove(key);
    this.objects.delete(key);
  }
}

describe('P12-08 attachment preflight/atomic metadata/cleanup HTTP acceptance', () => {
  let app: INestApplication, root: string, storage: TrackingStorage;
  let f: Awaited<ReturnType<typeof createP12WorkflowFixture>>;
  let files: PostgresFileStorageService,
    relations: PostgresFileRelationService,
    collaboration: PostgresCollaborationService;
  const input = {
    originalName: 'p12.txt',
    mediaType: 'text/plain',
    bytes: Buffer.from('P12 private bytes'),
  };
  const actor = () => ({
    organizationId: f.workspace.organizationId,
    membershipId: f.workspace.membershipId,
  });
  const path = (state = 'DRAFT', kind: 'manual' | 'completed' = 'manual') =>
    `/api/projects/${f.scenarios[state].project.id}/tasks/${f.scenarios[state][kind].id}/attachments`;
  const server = () => app.getHttpServer() as Server;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'taskforge-p12-attachments-'));
    storage = new TrackingStorage(new LocalFileStorageAdapter(root));
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    })
      .overrideProvider(PostgresFileStorageService)
      .useFactory({
        inject: [PostgresTransactionRunner],
        factory: (runner: PostgresTransactionRunner) =>
          new PostgresFileStorageService(runner, storage),
      })
      .compile();
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
    await app.listen(0, '127.0.0.1');
    f = await createP12WorkflowFixture(app);
    files = app.get<PostgresFileStorageService>(PostgresFileStorageService);
    relations = app.get<PostgresFileRelationService>(
      PostgresFileRelationService,
    );
    collaboration = app.get<PostgresCollaborationService>(
      PostgresCollaborationService,
    );
  }, 60000);
  afterAll(async () => {
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    storage.afterPut = undefined;
    storage.failRemovals = 0;
  });

  it('allows Completed Task upload with FILES off, read-all download and other-member idempotent unlink without deleting shared bytes', async () => {
    await f.db.getRepository(ProjectModuleSettingEntity).update(
      {
        projectId: f.scenarios.DRAFT.project.id,
        moduleCode: ProjectModuleCode.FILES,
      },
      { enabled: false },
    );
    const pm = await f.headers('pm');
    const uploaded = await request(server())
      .post(path('DRAFT', 'completed'))
      .set(pm)
      .attach('file', input.bytes, input.originalName)
      .expect(201);
    const attachment = uploaded.body as {
      id: string;
      storedFileId: string;
      objectKey?: string;
    };
    expect(attachment.objectKey).toBeUndefined();
    const second = await relations.attachToTask(
      actor(),
      f.scenarios.DRAFT.project.id,
      f.scenarios.DRAFT.manual.id,
      attachment.storedFileId,
    );
    await request(server())
      .get(`${path('DRAFT', 'completed')}/${attachment.id}/download`)
      .set(await f.headers('readAll'))
      .expect(200)
      .expect(input.bytes.toString());
    const before = storage.removals;
    for (let i = 0; i < 2; i++)
      await request(server())
        .delete(`${path('DRAFT', 'completed')}/${attachment.id}`)
        .set(await f.headers('creator'))
        .expect(200);
    expect(storage.removals).toBe(before);
    await request(server())
      .get(`${path()}/${second.id}/download`)
      .set(pm)
      .expect(200)
      .expect(input.bytes.toString());
    await expect(
      files.archive(actor(), attachment.storedFileId),
    ).rejects.toBeInstanceOf(ConflictException);
    await request(server())
      .get(`${path('DRAFT', 'completed')}/${attachment.id}/download`)
      .set(pm)
      .expect(404);
  });

  it('rejects terminal/foreign/missing/execution membership targets before storage writes', async () => {
    const pm = await f.headers('pm'),
      before = storage.puts;
    for (const state of ['COMPLETED', 'ARCHIVED'])
      await request(server())
        .post(path(state))
        .set(pm)
        .attach('file', input.bytes, input.originalName)
        .expect(409);
    await request(server())
      .post(path())
      .set(await f.headers('readAll'))
      .attach('file', input.bytes, input.originalName)
      .expect(403);
    await request(server())
      .post(path())
      .set(f.otherHeaders)
      .attach('file', input.bytes, input.originalName)
      .expect(403);
    await request(server())
      .post(
        `/api/projects/${f.scenarios.DRAFT.project.id}/tasks/${f.scenarios.ACTIVE.manual.id}/attachments`,
      )
      .set(pm)
      .attach('file', input.bytes, input.originalName)
      .expect(404);
    await request(server())
      .post(`/api/projects/${f.scenarios.DRAFT.project.id}/files`)
      .set(pm)
      .attach('file', input.bytes, input.originalName)
      .expect(409);
    await request(server())
      .post(`/api/projects/${f.scenarios.DRAFT.project.id}/files`)
      .set(await f.headers('creator'))
      .attach('file', input.bytes, input.originalName)
      .expect(403);
    expect(storage.puts).toBe(before);
  });

  it('bounds multipart bytes and validates empty/type/name/display name before storage writes', async () => {
    const pm = await f.headers('pm'),
      before = storage.puts;
    await request(server()).post(path()).set(pm).expect(400);
    await request(server())
      .post(path())
      .set(pm)
      .attach('file', Buffer.alloc(0), 'empty.txt')
      .expect(400);
    await request(server())
      .post(path())
      .set(pm)
      .attach('file', Buffer.from('x'), {
        filename: 'bad.exe',
        contentType: 'application/octet-stream',
      })
      .expect(400);
    await request(server())
      .post(path())
      .set(pm)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'oversize.txt')
      .expect(413);
    await expect(
      files.upload(actor(), { ...input, originalName: '../bad.txt' }),
    ).rejects.toThrow('File name is invalid');
    await expect(
      collaboration.uploadProjectFile(
        actor(),
        f.scenarios.DRAFT.project.id,
        input,
        'x'.repeat(256),
      ),
    ).rejects.toThrow('Display name is invalid');
    expect(storage.puts).toBe(before);
  });

  it('rechecks lifecycle after put and rolls back metadata/relation with cleanup', async () => {
    const s = f.scenarios.ACTIVE,
      before = storage.objects.size;
    storage.afterPut = async () => {
      await f.db
        .getRepository(ProjectEntity)
        .update(s.project.id, { state: ProjectState.COMPLETED });
    };
    try {
      await expect(
        collaboration.uploadTaskAttachment(
          actor(),
          s.project.id,
          s.manual.id,
          input,
        ),
      ).rejects.toThrow('read-only');
    } finally {
      await f.db
        .getRepository(ProjectEntity)
        .update(s.project.id, { state: ProjectState.ACTIVE });
    }
    expect(storage.objects.size).toBe(before);
  });

  it('accepts the inclusive 10 MiB boundary while the parser rejects the next byte', async () => {
    const before = storage.puts;
    await request(server())
      .post(path())
      .set(await f.headers('pm'))
      .attach('file', Buffer.alloc(10 * 1024 * 1024), 'limit.txt')
      .expect(201);
    expect(storage.puts).toBe(before + 1);
  });

  it('keeps existing Project files readable when FILES is off and prevents writes in terminal Projects', async () => {
    const s = f.scenarios.ACTIVE;
    const file = await collaboration.uploadProjectFile(
      actor(),
      s.project.id,
      input,
      'Readable name.txt',
    );
    await f.db
      .getRepository(ProjectModuleSettingEntity)
      .update(
        { projectId: s.project.id, moduleCode: ProjectModuleCode.FILES },
        { enabled: false },
      );
    await f.db
      .getRepository(ProjectEntity)
      .update(s.project.id, { state: ProjectState.COMPLETED });
    try {
      await expect(
        collaboration.downloadProjectFile(actor(), s.project.id, file.id),
      ).resolves.toEqual(
        expect.objectContaining({
          originalName: 'Readable name.txt',
          bytes: input.bytes,
        }),
      );
      await expect(
        collaboration.removeProjectFile(actor(), s.project.id, file.id),
      ).rejects.toThrow('read-only');
      await expect(
        collaboration.uploadProjectFile(actor(), s.project.id, input),
      ).rejects.toThrow('read-only');
    } finally {
      await f.db
        .getRepository(ProjectEntity)
        .update(s.project.id, { state: ProjectState.ACTIVE });
    }
    await collaboration.removeProjectFile(actor(), s.project.id, file.id);
    await collaboration.removeProjectFile(actor(), s.project.id, file.id);
  });

  it('cleans an object when the provider writes bytes but fails to acknowledge put', async () => {
    const before = storage.objects.size;
    storage.afterPut = () =>
      Promise.reject(new Error('provider acknowledgment lost'));
    await expect(files.upload(actor(), input)).rejects.toThrow(
      'File storage is unavailable',
    );
    expect(storage.objects.size).toBe(before);
  });

  it('cleans successful puts when metadata insert or relation transaction fails, with bounded transient retry', async () => {
    const s = f.scenarios.DRAFT,
      before = storage.objects.size;
    const count = await f.db
      .getRepository(StoredFileEntity)
      .countBy({ organizationId: f.workspace.organizationId });
    jest
      .spyOn(PostgresStoredFileRepository.prototype, 'save')
      .mockRejectedValueOnce(new Error('simulated metadata failure'));
    await expect(
      collaboration.uploadTaskAttachment(
        actor(),
        s.project.id,
        s.manual.id,
        input,
      ),
    ).rejects.toThrow('could not be confirmed');
    expect(storage.objects.size).toBe(before);
    storage.failRemovals = 2;
    const removals = storage.removals;
    jest
      .spyOn(relations, 'attachToTaskInTransaction')
      .mockRejectedValueOnce(
        new ConflictException('simulated relation failure'),
      );
    await expect(
      collaboration.uploadTaskAttachment(
        actor(),
        s.project.id,
        s.manual.id,
        input,
      ),
    ).rejects.toThrow('simulated relation failure');
    expect(storage.removals - removals).toBe(3);
    expect(storage.objects.size).toBe(before);
    expect(
      await f.db
        .getRepository(StoredFileEntity)
        .countBy({ organizationId: f.workspace.organizationId }),
    ).toBe(count);
  });

  it('retains failed cleanup for bounded reconciliation without exposing keys or retrying upload', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const before = storage.objects.size,
      puts = storage.puts,
      removals = storage.removals;
    storage.failRemovals = 20;
    jest
      .spyOn(relations, 'attachToTaskInTransaction')
      .mockRejectedValueOnce(new ConflictException('relation rejected'));
    await expect(
      collaboration.uploadTaskAttachment(
        actor(),
        f.scenarios.DRAFT.project.id,
        f.scenarios.DRAFT.manual.id,
        input,
      ),
    ).rejects.toThrow('relation rejected');
    expect(storage.puts - puts).toBe(1);
    expect(storage.removals - removals).toBe(3);
    expect(storage.objects.size).toBe(before + 1);
    expect(warn).toHaveBeenCalledWith(
      'FILE_UPLOAD_CLEANUP_PENDING: bounded cleanup exhausted',
    );
    storage.failRemovals = 0;
    expect(await files.reconcileFailedUploads(1)).toBe(0);
    expect(storage.objects.size).toBe(before);
  });

  it('preserves a committed upload if the transaction acknowledgment is lost', async () => {
    class LostAckRunner extends PostgresTransactionRunner {
      calls = 0;
      override async run<T>(
        work: PostgresTransactionWork<T>,
        isolation?: PostgresIsolationLevel,
      ): Promise<T> {
        const result = isolation
          ? await super.run(work, isolation)
          : await super.run(work);
        if (++this.calls === 2)
          throw new Error('simulated acknowledgment loss');
        return result;
      }
    }
    const service = new PostgresFileStorageService(
      new LostAckRunner(f.db),
      storage,
    );
    const before = storage.objects.size;
    await expect(
      service.uploadLinked(actor(), input, async (manager, stored) =>
        relations.attachToTaskInTransaction(
          manager,
          actor(),
          f.scenarios.DRAFT.project.id,
          f.scenarios.DRAFT.manual.id,
          stored.id,
        ),
      ),
    ).rejects.toThrow('could not be confirmed');
    expect(storage.objects.size).toBe(before + 1);
    const attachment = await f.db
      .getRepository(TaskAttachmentEntity)
      .findOneOrFail({
        where: { taskId: f.scenarios.DRAFT.manual.id },
        order: { createdAt: 'DESC' },
      });
    await expect(
      collaboration.downloadTaskAttachment(
        actor(),
        attachment.projectId,
        attachment.taskId,
        attachment.id,
      ),
    ).resolves.toEqual(expect.objectContaining({ bytes: input.bytes }));
  });

  it('rejects disabled actors and archived Tasks in direct services before put', async () => {
    const before = storage.puts;
    await f.db
      .getRepository(UserEntity)
      .update(f.actors.pm.user.id, { disabledAt: new Date() });
    try {
      await expect(
        collaboration.uploadTaskAttachment(
          actor(),
          f.scenarios.DRAFT.project.id,
          f.scenarios.DRAFT.manual.id,
          input,
        ),
      ).rejects.toThrow('Active organization membership');
    } finally {
      await f.db
        .getRepository(UserEntity)
        .update(f.actors.pm.user.id, { disabledAt: null });
    }
    const archived = f.scenarios.ACTIVE.completed.id;
    await f.db
      .getRepository(TaskEntity)
      .update(archived, { archivedAt: new Date() });
    try {
      await request(server())
        .post(path('ACTIVE', 'completed'))
        .set(await f.headers('pm'))
        .attach('file', input.bytes, input.originalName)
        .expect(404);
    } finally {
      await f.db
        .getRepository(TaskEntity)
        .update(archived, { archivedAt: null });
    }
    expect(storage.puts).toBe(before);
  });

  it('runs the production attachment controller/store and JSX consumer over real Nest HTTP', async () => {
    const headers = await f.headers('pm');
    const baseURL = await app.getUrl();
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [
          join(
            __dirname,
            '../../frontend/scripts/p12-attachments-integration.mjs',
          ),
        ],
        { timeout: 60000 },
        (error, stdout, stderr) => {
          if (error) reject(new Error(`Attachment consumer failed: ${stderr}`));
          else resolve(stdout);
        },
      );
      child.stdin!.end(
        JSON.stringify({
          baseURL,
          accessToken: headers.Authorization.slice(7),
          organizationId: f.workspace.organizationId,
          userId: f.actors.pm.user.id,
          projectId: f.scenarios.DRAFT.project.id,
          taskId: f.scenarios.DRAFT.completed.id,
        }),
      );
    });
    expect(output).toContain('P12 actual attachment consumer passed');
  }, 90000);
});
