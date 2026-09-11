import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client } from 'minio';
import { getMinioConfig } from '../src/config/minio.config';
import { LocalFileStorageAdapter, MinioFileStorageAdapter, PostgresFileStorageService, type FileStorageAdapter } from '../src/modules/collaboration/application/file-storage';
import { PostgresTransactionRunner } from '../src/database/transaction-runner';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { StoredFileEntity } from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

class MemoryStorageAdapter implements FileStorageAdapter {
  readonly providerCode = 'memory-contract-test';
  readonly objects = new Map<string, Buffer>();
  failRemovals = false;
  async put(key: string, bytes: Buffer) { this.objects.set(key, Buffer.from(bytes)); }
  async get(key: string) { return this.objects.get(key) ?? null; }
  async remove(key: string) {
    if (this.failRemovals) throw new Error('simulated storage cleanup failure');
    this.objects.delete(key);
  }
}

class FailOnceMinioAdapter implements FileStorageAdapter {
  readonly providerCode = 'minio';
  private failNextRemoval = true;
  constructor(private readonly delegate: MinioFileStorageAdapter) {}
  put(key: string, bytes: Buffer) { return this.delegate.put(key, bytes); }
  get(key: string) { return this.delegate.get(key); }
  async remove(key: string) {
    if (this.failNextRemoval) {
      this.failNextRemoval = false;
      throw new Error('simulated cleanup interruption');
    }
    await this.delegate.remove(key);
  }
}

describe('PostgreSQL stored-file storage integration', () => {
  let dataSource: DataSource;
  let module: TestingModule;
  let onboarding: PostgresOrganizationOnboardingService;
  let storage: MemoryStorageAdapter;
  let files: PostgresFileStorageService;
  let sequence = 0;

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [PostgresOnboardingTestModule] }).compile();
    dataSource = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    storage = new MemoryStorageAdapter();
    files = new PostgresFileStorageService(module.get(PostgresTransactionRunner), storage);
  });
  beforeEach(async () => {
    sequence += 1;
    storage.objects.clear();
    storage.failRemovals = false;
    await dataSource.query(`TRUNCATE TABLE notifications, audit_logs, activity_entries, project_files, task_attachments, stored_files, comments, task_approval_requests, task_checklist_items, task_assignees, tasks, project_module_settings, project_task_statuses, project_memberships, project_teams, team_members, organization_invitations, organization_memberships, teams, organizations, users RESTART IDENTITY CASCADE`);
  });
  afterAll(async () => dataSource.destroy());

  it('validates upload metadata and authorizes download without exposing object keys', async () => {
    const first = await workspace('first');
    const second = await workspace('second');
    const actor = { organizationId: first.organizationId, membershipId: first.membershipId };
    const uploaded = await files.upload(actor, { originalName: 'evidence.txt', mediaType: 'text/plain', bytes: Buffer.from('private evidence') });
    expect(uploaded).toEqual(expect.objectContaining({ originalName: 'evidence.txt', sizeBytes: '16' }));
    expect(uploaded).not.toHaveProperty('objectKey');
    const persisted = await dataSource.getRepository(StoredFileEntity).findOneByOrFail({ id: uploaded.id });
    expect(persisted).toEqual(expect.objectContaining({ organizationId: first.organizationId, uploadedByMembershipId: first.membershipId, storageProviderCode: 'memory-contract-test' }));
    expect(storage.objects.has(persisted.objectKey)).toBe(true);
    await expect(files.download(actor, uploaded.id)).resolves.toEqual(expect.objectContaining({ bytes: Buffer.from('private evidence') }));
    await expect(files.download({ organizationId: second.organizationId, membershipId: second.membershipId }, uploaded.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(files.upload(actor, { originalName: '../unsafe.txt', mediaType: 'text/plain', bytes: Buffer.from('x') })).rejects.toBeInstanceOf(BadRequestException);
    await expect(files.upload(actor, { originalName: 'script.js', mediaType: 'application/javascript', bytes: Buffer.from('x') })).rejects.toBeInstanceOf(BadRequestException);
    await expect(files.upload(actor, { originalName: 'large.txt', mediaType: 'text/plain', bytes: Buffer.alloc(10 * 1024 * 1024 + 1) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an uploader whose organization membership is no longer active', async () => {
    const workspaceData = await workspace('revoked');
    await dataSource.query(`UPDATE organization_memberships SET state = 'REVOKED' WHERE id = $1`, [workspaceData.membershipId]);
    await expect(files.upload({ organizationId: workspaceData.organizationId, membershipId: workspaceData.membershipId }, { originalName: 'evidence.txt', mediaType: 'text/plain', bytes: Buffer.from('x') })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('archives database metadata before best-effort cleanup and retries cleanup idempotently', async () => {
    const workspaceData = await workspace('cleanup');
    const actor = { organizationId: workspaceData.organizationId, membershipId: workspaceData.membershipId };
    const uploaded = await files.upload(actor, { originalName: 'cleanup.txt', mediaType: 'text/plain', bytes: Buffer.from('cleanup') });
    const persisted = await dataSource.getRepository(StoredFileEntity).findOneByOrFail({ id: uploaded.id });
    storage.failRemovals = true;
    await expect(files.archive(actor, uploaded.id)).resolves.toEqual(expect.objectContaining({ storageCleanupSucceeded: false }));
    await expect(dataSource.getRepository(StoredFileEntity).findOneByOrFail({ id: uploaded.id })).resolves.toEqual(expect.objectContaining({ deletedAt: expect.any(Date) }));
    await expect(files.download(actor, uploaded.id)).rejects.toBeInstanceOf(NotFoundException);
    storage.failRemovals = false;
    await expect(files.archive(actor, uploaded.id)).resolves.toEqual(expect.objectContaining({ storageCleanupSucceeded: true }));
    expect(storage.objects.has(persisted.objectKey)).toBe(false);
  });

  it('round-trips the same adapter contract through local filesystem storage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'taskforge-storage-'));
    try {
      const local = new LocalFileStorageAdapter(root);
      await local.put('11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222', Buffer.from('local adapter'));
      await expect(local.get('11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222')).resolves.toEqual(Buffer.from('local adapter'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses private MinIO for bucket provisioning, authorized download, tenant denial, and cleanup retry', async () => {
    const minio = getMinioConfig(process.env);
    if (!minio) throw new Error('MinIO test environment is required.');
    const adapter = new FailOnceMinioAdapter(new MinioFileStorageAdapter(
      new Client({ endPoint: minio.endpoint, port: minio.port, useSSL: minio.useSSL, accessKey: minio.accessKey, secretKey: minio.secretKey }),
      minio.bucket,
    ));
    const minioFiles = new PostgresFileStorageService(module.get(PostgresTransactionRunner), adapter);
    const first = await workspace('minio-first');
    const second = await workspace('minio-second');
    const actor = { organizationId: first.organizationId, membershipId: first.membershipId };
    const uploaded = await minioFiles.upload(actor, { originalName: 'private.txt', mediaType: 'text/plain', bytes: Buffer.from('private MinIO evidence') });
    expect(uploaded).not.toHaveProperty('objectKey');
    await expect(minioFiles.download(actor, uploaded.id)).resolves.toEqual(expect.objectContaining({ bytes: Buffer.from('private MinIO evidence') }));
    await expect(minioFiles.download({ organizationId: second.organizationId, membershipId: second.membershipId }, uploaded.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(minioFiles.archive(actor, uploaded.id)).resolves.toEqual(expect.objectContaining({ storageCleanupSucceeded: false }));
    await expect(minioFiles.archive(actor, uploaded.id)).resolves.toEqual(expect.objectContaining({ storageCleanupSucceeded: true }));
    await expect(minioFiles.download(actor, uploaded.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  async function workspace(prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({ email: `${prefix}-${sequence}@example.test`, name: prefix, passwordHash: 'hash', profileImageUrl: null, emailVerifiedAt: new Date(), refreshTokenHash: null, disabledAt: null });
    return onboarding.createOrganization(user.id, { name: `${prefix} workspace` });
  }
});
