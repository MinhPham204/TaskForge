import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from 'minio';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import { activeTaskIdentity } from '../../task/domain/task-membership';
import { withErrorCode } from '../../../common/http/coded-error';
import {
  ProjectFileEntity,
  StoredFileEntity,
  TaskAttachmentEntity,
} from '../persistence/typeorm/collaboration.entities';
import { PostgresStoredFileRepository } from '../persistence/typeorm/collaboration.repositories';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
]);

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
  constructor(rootDirectory: string) {
    this.root = resolve(rootDirectory);
  }
  async put(objectKey: string, bytes: Buffer): Promise<void> {
    const path = this.pathFor(objectKey);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
  async get(objectKey: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(objectKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async remove(objectKey: string): Promise<void> {
    try {
      await unlink(this.pathFor(objectKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  private pathFor(objectKey: string): string {
    if (!/^[a-f0-9-]+\/[a-f0-9-]+$/.test(objectKey))
      throw new Error('Invalid local storage object key');
    return join(this.root, objectKey);
  }
}

/** Private S3-compatible storage; callers retain authorization through StoredFile. */
export class MinioFileStorageAdapter implements FileStorageAdapter {
  readonly providerCode = 'minio';
  private bucketReady: Promise<void> | undefined;
  constructor(
    private readonly client: Client,
    private readonly bucket: string,
  ) {}
  async put(objectKey: string, bytes: Buffer): Promise<void> {
    await this.ensureBucket();
    await this.client.putObject(
      this.bucket,
      objectKey,
      bytes,
      bytes.byteLength,
    );
  }
  async get(objectKey: string): Promise<Buffer | null> {
    try {
      const stream = await this.client.getObject(this.bucket, objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream)
        chunks.push(Buffer.from(chunk as Uint8Array));
      return Buffer.concat(chunks);
    } catch (error) {
      if ((error as { code?: string }).code === 'NoSuchKey') return null;
      throw error;
    }
  }
  async remove(objectKey: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, objectKey);
    } catch (error) {
      if ((error as { code?: string }).code !== 'NoSuchKey') throw error;
    }
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

export interface PostgresFileActor {
  organizationId: string;
  membershipId: string;
}
export interface UploadPostgresFileInput {
  originalName: string;
  mediaType: string;
  bytes: Buffer;
}
export interface StoredFileResponse {
  id: string;
  originalName: string;
  mediaType: string;
  sizeBytes: string;
  checksumSha256: string;
  createdAt: Date;
}
export interface DownloadPostgresFile extends StoredFileResponse {
  bytes: Buffer;
}
export interface ArchivePostgresFileResult extends StoredFileResponse {
  storageCleanupSucceeded: boolean;
}

export class PostgresFileStorageService {
  private readonly logger = new Logger(PostgresFileStorageService.name);
  private readonly failedUploads = new Set<string>();
  constructor(
    private readonly transactions: PostgresTransactionRunner,
    private readonly storage: FileStorageAdapter,
  ) {}

  async upload(
    actor: PostgresFileActor,
    input: UploadPostgresFileInput,
  ): Promise<StoredFileResponse> {
    return this.uploadLinked(actor, input, (_manager, stored) =>
      Promise.resolve(toResponse(stored)),
    );
  }

  async uploadLinked<T>(
    actor: PostgresFileActor,
    input: UploadPostgresFileInput,
    link: (manager: EntityManager, stored: StoredFileEntity) => Promise<T>,
  ): Promise<T> {
    validateUpload(input);
    await this.transactions.run((manager) =>
      requireActiveMembership(manager, actor),
    );
    await this.reconcileFailedUploads(1);
    if (this.failedUploads.size >= 100)
      throw withErrorCode(
        new ServiceUnavailableException(
          'File storage cleanup is unavailable. Try later.',
        ),
        'FILE_STORAGE_UNAVAILABLE',
      );
    const objectKey = `${actor.organizationId}/${randomUUID()}`;
    try {
      await this.storage.put(objectKey, input.bytes);
    } catch {
      this.failedUploads.add(objectKey);
      await this.cleanupFailedUpload(objectKey);
      throw withErrorCode(
        new ServiceUnavailableException(
          'File storage is unavailable. Check the file list before retrying.',
        ),
        'FILE_STORAGE_UNAVAILABLE',
      );
    }
    try {
      return await this.transactions.run(async (manager) => {
        await requireActiveMembership(manager, actor);
        const files = new PostgresStoredFileRepository(manager);
        const stored = await files.save(
          files.create({
            organizationId: actor.organizationId,
            storageProviderCode: this.storage.providerCode,
            objectKey,
            originalName: safeOriginalName(input.originalName),
            mediaType: input.mediaType,
            sizeBytes: input.bytes.byteLength.toString(),
            checksumSha256: createHash('sha256')
              .update(input.bytes)
              .digest('hex'),
            uploadedByMembershipId: actor.membershipId,
            deletedAt: null,
          }),
        );
        return link(manager, stored);
      });
    } catch (error) {
      this.failedUploads.add(objectKey);
      await this.cleanupFailedUpload(objectKey);
      if (error instanceof HttpException) throw error;
      throw withErrorCode(
        new ServiceUnavailableException(
          'Upload could not be confirmed. Refresh the file list before retrying.',
        ),
        'FILE_UPLOAD_UNCONFIRMED',
      );
    }
  }

  /** Bounded internal reconciliation; private keys never enter responses/logs. */
  async reconcileFailedUploads(limit = 10): Promise<number> {
    for (const key of [...this.failedUploads].slice(
      0,
      Math.max(0, Math.min(limit, 10)),
    ))
      await this.cleanupFailedUpload(key);
    return this.failedUploads.size;
  }

  private async cleanupFailedUpload(objectKey: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // A lost transaction acknowledgment may follow a successful commit.
        // Never compensate by deleting a committed or shared stored file.
        const persisted = await this.transactions.read((manager) =>
          manager.getRepository(StoredFileEntity).findOneBy({
            objectKey,
            storageProviderCode: this.storage.providerCode,
          }),
        );
        if (!persisted) await this.storage.remove(objectKey);
        this.failedUploads.delete(objectKey);
        return;
      } catch {
        /* Retain ownership for a later bounded reconciliation. */
      }
    }
    this.logger.warn('FILE_UPLOAD_CLEANUP_PENDING: bounded cleanup exhausted');
  }

  async download(
    actor: PostgresFileActor,
    fileId: string,
  ): Promise<DownloadPostgresFile> {
    const stored = await this.transactions.run(async (manager) => {
      await requireActiveMembership(manager, actor);
      const file = await manager.getRepository(StoredFileEntity).findOneBy({
        id: fileId,
        organizationId: actor.organizationId,
        deletedAt: IsNull(),
      });
      if (!file) throw new NotFoundException('Stored file not found');
      return file;
    });
    const bytes = await this.storage.get(stored.objectKey);
    if (!bytes) throw new NotFoundException('Stored file content not found');
    return { ...toResponse(stored), bytes };
  }

  async archive(
    actor: PostgresFileActor,
    fileId: string,
  ): Promise<ArchivePostgresFileResult> {
    const stored = await this.transactions.run(async (manager) => {
      await requireActiveMembership(manager, actor);
      const file = await manager.getRepository(StoredFileEntity).findOne({
        where: { id: fileId, organizationId: actor.organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!file) throw new NotFoundException('Stored file not found');
      const relation = {
        organizationId: actor.organizationId,
        storedFileId: fileId,
        removedAt: IsNull(),
      };
      if (
        (await manager
          .getRepository(TaskAttachmentEntity)
          .existsBy(relation)) ||
        (await manager.getRepository(ProjectFileEntity).existsBy(relation))
      ) {
        throw new ConflictException(
          'Stored file is still referenced by an active relation',
        );
      }
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
  if (!input.bytes.byteLength)
    throw new BadRequestException('File cannot be empty');
  if (input.bytes.byteLength > MAX_FILE_SIZE_BYTES)
    throw new BadRequestException('File exceeds the 10 MiB limit');
  if (!ALLOWED_MEDIA_TYPES.has(input.mediaType))
    throw new BadRequestException('File type is not allowed');
  safeOriginalName(input.originalName);
}
function safeOriginalName(value: string): string {
  const name = value.trim();
  // eslint-disable-next-line no-control-regex -- Reject control bytes in user file names.
  if (!name || name.length > 255 || /[\\/\x00-\x1f\x7f]/.test(name))
    throw new BadRequestException('File name is invalid');
  return name;
}
async function requireActiveMembership(
  manager: EntityManager,
  actor: PostgresFileActor,
): Promise<void> {
  if (
    !(await activeTaskIdentity(
      manager,
      actor.organizationId,
      actor.membershipId,
      true,
    ))
  )
    throw withErrorCode(
      new ForbiddenException('Active organization membership is required'),
      'TENANT_MEMBERSHIP_REQUIRED',
    );
}
function toResponse(file: StoredFileEntity): StoredFileResponse {
  return {
    id: file.id,
    originalName: file.originalName,
    mediaType: file.mediaType ?? 'application/octet-stream',
    sizeBytes: file.sizeBytes,
    checksumSha256: file.checksumSha256 ?? '',
    createdAt: file.createdAt,
  };
}
