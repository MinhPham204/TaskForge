import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from 'minio';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import { OrganizationMembershipEntity, OrganizationMembershipState } from '../../onboarding/persistence/typeorm/onboarding.entities';
import { StoredFileEntity } from '../persistence/typeorm/collaboration.entities';
import { PostgresStoredFileRepository } from '../persistence/typeorm/collaboration.repositories';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain']);

export interface FileStorageAdapter {
  readonly providerCode: string;
  put(objectKey: string, bytes: Buffer): Promise<void>;
  get(objectKey: string): Promise<Buffer | null>;
  remove(objectKey: string): Promise<void>;
}

/** Local filesystem storage is the portfolio-safe provider; object keys remain internal. */
export class LocalFileStorageAdapter implements FileStorageAdapter {
  readonly providerCode = 'local-filesystem';
  private readonly root: string;
  constructor(rootDirectory: string) { this.root = resolve(rootDirectory); }
  async put(objectKey: string, bytes: Buffer): Promise<void> {
    const path = this.pathFor(objectKey);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
  async get(objectKey: string): Promise<Buffer | null> {
    try { return await readFile(this.pathFor(objectKey)); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async remove(objectKey: string): Promise<void> {
    try { await unlink(this.pathFor(objectKey)); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  private pathFor(objectKey: string): string {
    if (!/^[a-f0-9-]+\/[a-f0-9-]+$/.test(objectKey)) throw new Error('Invalid local storage object key');
    return join(this.root, objectKey);
  }
}

/** Private S3-compatible storage; callers retain authorization through StoredFile. */
export class MinioFileStorageAdapter implements FileStorageAdapter {
  readonly providerCode = 'minio';
  private bucketReady: Promise<void> | undefined;
  constructor(private readonly client: Client, private readonly bucket: string) {}
  async put(objectKey: string, bytes: Buffer): Promise<void> {
    await this.ensureBucket();
    await this.client.putObject(this.bucket, objectKey, bytes, bytes.byteLength);
  }
  async get(objectKey: string): Promise<Buffer | null> {
    try {
      const stream = await this.client.getObject(this.bucket, objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    } catch (error) {
      if ((error as { code?: string }).code === 'NoSuchKey') return null;
      throw error;
    }
  }
  async remove(objectKey: string): Promise<void> {
    try { await this.client.removeObject(this.bucket, objectKey); }
    catch (error) { if ((error as { code?: string }).code !== 'NoSuchKey') throw error; }
  }
  /** Lazy, idempotent provisioning keeps application and unit-test startup side-effect free. */
  async ensureBucket(): Promise<void> {
    this.bucketReady ??= this.ensureBucketOnce();
    try {
      await this.bucketReady;
    } catch (error) {
      this.bucketReady = undefined;
      throw error;
    }
  }
  private async ensureBucketOnce(): Promise<void> {
    if (await this.client.bucketExists(this.bucket)) return;
    try {
      await this.client.makeBucket(this.bucket);
    } catch (error) {
      if (!(await this.client.bucketExists(this.bucket))) throw error;
    }
  }
}

export interface PostgresFileActor { organizationId: string; membershipId: string; }
export interface UploadPostgresFileInput { originalName: string; mediaType: string; bytes: Buffer; }
export interface StoredFileResponse { id: string; originalName: string; mediaType: string; sizeBytes: string; checksumSha256: string; createdAt: Date; }
export interface DownloadPostgresFile extends StoredFileResponse { bytes: Buffer; }
export interface ArchivePostgresFileResult extends StoredFileResponse { storageCleanupSucceeded: boolean; }

export class PostgresFileStorageService {
  constructor(private readonly transactions: PostgresTransactionRunner, private readonly storage: FileStorageAdapter) {}

  async upload(actor: PostgresFileActor, input: UploadPostgresFileInput): Promise<StoredFileResponse> {
    validateUpload(input);
    const objectKey = `${actor.organizationId}/${randomUUID()}`;
    await this.storage.put(objectKey, input.bytes);
    try {
      const stored = await this.transactions.run(async (manager) => {
        await requireActiveMembership(manager, actor);
        const files = new PostgresStoredFileRepository(manager);
        return files.save(files.create({
          organizationId: actor.organizationId, storageProviderCode: this.storage.providerCode,
          objectKey, originalName: safeOriginalName(input.originalName), mediaType: input.mediaType,
          sizeBytes: input.bytes.byteLength.toString(), checksumSha256: createHash('sha256').update(input.bytes).digest('hex'),
          uploadedByMembershipId: actor.membershipId, deletedAt: null,
        }));
      });
      return toResponse(stored);
    } catch (error) {
      // P5-08 owns durable cleanup/retry; never expose the private object key.
      throw error;
    }
  }

  async download(actor: PostgresFileActor, fileId: string): Promise<DownloadPostgresFile> {
    const stored = await this.transactions.run(async (manager) => {
      await requireActiveMembership(manager, actor);
      const file = await manager.getRepository(StoredFileEntity).findOneBy({ id: fileId, organizationId: actor.organizationId, deletedAt: IsNull() });
      if (!file) throw new NotFoundException('Stored file not found');
      return file;
    });
    const bytes = await this.storage.get(stored.objectKey);
    if (!bytes) throw new NotFoundException('Stored file content not found');
    return { ...toResponse(stored), bytes };
  }

  async archive(actor: PostgresFileActor, fileId: string): Promise<ArchivePostgresFileResult> {
    const stored = await this.transactions.run(async (manager) => {
      await requireActiveMembership(manager, actor);
      const file = await manager.getRepository(StoredFileEntity).findOneBy({ id: fileId, organizationId: actor.organizationId });
      if (!file) throw new NotFoundException('Stored file not found');
      if (!file.deletedAt) {
        file.deletedAt = new Date();
        await manager.getRepository(StoredFileEntity).save(file);
      }
      return file;
    });
    try {
      await this.storage.remove(stored.objectKey);
      return { ...toResponse(stored), storageCleanupSucceeded: true };
    } catch {
      // Metadata is already archived. P5-08 deliberately makes cleanup retryable.
      return { ...toResponse(stored), storageCleanupSucceeded: false };
    }
  }
}

function validateUpload(input: UploadPostgresFileInput): void {
  if (!input.bytes.byteLength) throw new BadRequestException('File cannot be empty');
  if (input.bytes.byteLength > MAX_FILE_SIZE_BYTES) throw new BadRequestException('File exceeds the 10 MiB limit');
  if (!ALLOWED_MEDIA_TYPES.has(input.mediaType)) throw new BadRequestException('File type is not allowed');
  safeOriginalName(input.originalName);
}
function safeOriginalName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 255 || /[\\/\0]/.test(name)) throw new BadRequestException('File name is invalid');
  return name;
}
async function requireActiveMembership(manager: EntityManager, actor: PostgresFileActor): Promise<void> {
  const membership = await manager.getRepository(OrganizationMembershipEntity).findOneBy({ id: actor.membershipId, organizationId: actor.organizationId, state: OrganizationMembershipState.ACTIVE });
  if (!membership) throw new ForbiddenException('Active organization membership is required');
}
function toResponse(file: StoredFileEntity): StoredFileResponse {
  return { id: file.id, originalName: file.originalName, mediaType: file.mediaType ?? 'application/octet-stream', sizeBytes: file.sizeBytes, checksumSha256: file.checksumSha256 ?? '', createdAt: file.createdAt };
}
