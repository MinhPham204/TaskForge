import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { DataSource, In, IsNull, LessThanOrEqual } from 'typeorm';
import { EmailService } from '../../../common/services/email.service';
import { getRedisConnection } from '../../../config/redis.config';
import { PostgresNotificationService } from './notification.service';
import { decryptOutboxInvitationCredential } from './outbox-credential';
import { OutboxEventEntity } from '../persistence/typeorm/collaboration.entities';
import {
  OrganizationEntity,
  OrganizationInvitationEntity,
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  UserEntity,
} from '../../onboarding/persistence/typeorm/onboarding.entities';
import { ApprovalRequestEntity, TaskEntity } from '../../task/persistence/typeorm/task.entities';
import { ProjectMembershipEntity } from '../../projects/persistence/typeorm/project.entities';

export const POSTGRES_OUTBOX_QUEUE = 'postgres-outbox';
const MAX_ATTEMPTS = 3;
const CLAIM_TIMEOUT_MS = 60_000;

export interface PostgresOutboxJob { outboxEventId: string }

/** Claims only durable events. Redis is deliberately outside the business transaction. */
@Injectable()
export class PostgresOutboxDispatcher {
  constructor(private readonly dataSource: DataSource, private readonly queue: Queue<PostgresOutboxJob>) {
    // A Redis connection can finish closing after Nest teardown begins. The
    // durable Outbox state has already been persisted; prevent BullMQ from
    // turning that expected shutdown race into an unhandled process error.
    this.queue.on?.('error', () => undefined);
  }

  async dispatchReady(limit = 25): Promise<number> {
    await this.reclaimStale();
    const events = await this.dataSource.transaction(async (manager) => {
      const ready = await manager.getRepository(OutboxEventEntity)
        .createQueryBuilder('event')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('event.status IN (:...statuses)', { statuses: ['PENDING', 'FAILED'] })
        .andWhere('event.available_at <= NOW()')
        .orderBy('event.available_at', 'ASC')
        .addOrderBy('event.created_at', 'ASC')
        .limit(limit)
        .getMany();
      const now = new Date();
      for (const event of ready) {
        event.status = 'PROCESSING'; event.claimedAt = now; event.attempts += 1; event.lastError = null;
      }
      return manager.getRepository(OutboxEventEntity).save(ready);
    });
    if (!events.length) return 0;
    try {
      await this.queue.addBulk(events.map((event) => ({
        name: event.eventType,
        data: { outboxEventId: event.id },
        opts: { jobId: `outbox-${event.id}`, attempts: MAX_ATTEMPTS, backoff: { type: 'exponential', delay: 250 }, removeOnComplete: 100, removeOnFail: false },
      })));
      await this.dataSource.getRepository(OutboxEventEntity).update(
        { id: In(events.map((event) => event.id)), status: 'PROCESSING' },
        { status: 'PUBLISHED', publishedAt: new Date() },
      );
    } catch (error) {
      await this.fail(events.map((event) => event.id), error);
    }
    return events.length;
  }

  async reclaimStale(): Promise<number> {
    const result = await this.dataSource.getRepository(OutboxEventEntity).update(
      { status: 'PROCESSING', claimedAt: LessThanOrEqual(new Date(Date.now() - CLAIM_TIMEOUT_MS)) },
      { status: 'FAILED', availableAt: new Date(), lastError: 'Processing claim timed out.' },
    );
    return result.affected ?? 0;
  }

  async fail(ids: string[], error: unknown): Promise<void> {
    if (!ids.length) return;
    await this.dataSource.getRepository(OutboxEventEntity).update(
      { id: In(ids) },
      { status: 'FAILED', availableAt: new Date(Date.now() + backoffMs(1)), lastError: safeError(error) },
    );
  }

  /** Must finish before BullMQ removes a terminally failed job. */
  async persistFinalFailure(outboxEventId: string, error: unknown): Promise<void> {
    const event = await this.dataSource.getRepository(OutboxEventEntity).findOneBy({ id: outboxEventId });
    if (!event) return;
    await this.dataSource.getRepository(OutboxEventEntity).update(
      { id: outboxEventId },
      { status: 'FAILED', claimedAt: null, availableAt: new Date(Date.now() + backoffMs(event.attempts)), lastError: safeError(error) },
    );
  }

  close(): Promise<void> { return this.queue.close(); }
}

/** Executes effects at least once; only the in-app notification has a database deduplication guarantee. */
@Injectable()
export class PostgresOutboxProcessor {
  constructor(
    private readonly dataSource: DataSource,
    private readonly email: EmailService,
    private readonly notifications: PostgresNotificationService,
  ) {}

  async process(job: Job<PostgresOutboxJob>): Promise<void> {
    const event = await this.dataSource.getRepository(OutboxEventEntity).findOneBy({ id: job.data.outboxEventId });
    if (!event || event.status === 'PROCESSED') return;
    try {
      if (event.eventType === 'ORGANIZATION_INVITATION_CREATED') await this.processInvitation(event);
      else await this.processApproval(event);
      await this.dataSource.getRepository(OutboxEventEntity).update({ id: event.id }, { status: 'PROCESSED', processedAt: new Date(), claimedAt: null, lastError: null });
    } catch (error) {
      throw error;
    }
  }

  private async processInvitation(event: OutboxEventEntity): Promise<void> {
    const invitationId = stringPayload(event.payload, 'invitationId');
    const invitation = invitationId && await this.dataSource.getRepository(OrganizationInvitationEntity).findOneBy({ id: invitationId, organizationId: event.organizationId });
    if (!invitation || invitation.state !== 'PENDING' || invitation.expiresAt.getTime() <= Date.now()) {
      await this.redactInvitationCredential(event); return;
    }
    const credential = event.payload.credential;
    if (!credential || typeof credential !== 'object' || Array.isArray(credential)) throw new Error('Invitation event credential is missing.');
    const token = decryptOutboxInvitationCredential(credential as Record<string, unknown>);
    const [organization, inviterMembership] = await Promise.all([
      this.dataSource.getRepository(OrganizationEntity).findOneBy({ id: event.organizationId }),
      this.dataSource.getRepository(OrganizationMembershipEntity).findOneBy({ id: invitation.invitedByMembershipId, organizationId: event.organizationId }),
    ]);
    const inviter = inviterMembership && await this.dataSource.getRepository(UserEntity).findOneBy({ id: inviterMembership.userId });
    if (!organization || !inviter) { await this.redactInvitationCredential(event); return; }
    const clientUrl = (process.env.CLIENT_URL ?? '').replace(/\/$/, '');
    await this.email.sendOrganizationInvitationEmail({
      to: invitation.email, organizationName: organization.name, organizationId: organization.id,
      invitedByName: inviter.name, acceptLink: `${clientUrl}/invitations/accept?token=${encodeURIComponent(token)}`,
    });
    await this.redactInvitationCredential(event);
  }

  private async processApproval(event: OutboxEventEntity): Promise<void> {
    const approvalId = stringPayload(event.payload, 'approvalRequestId');
    const approval = approvalId && await this.dataSource.getRepository(ApprovalRequestEntity).findOneBy({ id: approvalId, organizationId: event.organizationId });
    if (!approval || approval.state !== 'PENDING') return;
    const [task, projectMember] = await Promise.all([
      this.dataSource.getRepository(TaskEntity).findOneBy({ id: approval.taskId, organizationId: event.organizationId, projectId: approval.projectId }),
      this.dataSource.getRepository(ProjectMembershipEntity).findOneBy({ id: approval.approverProjectMembershipId, organizationId: event.organizationId, projectId: approval.projectId }),
    ]);
    if (!task || !projectMember || projectMember.removedAt) return;
    const membership = await this.dataSource.getRepository(OrganizationMembershipEntity).findOneBy({ id: projectMember.organizationMembershipId, organizationId: event.organizationId, state: OrganizationMembershipState.ACTIVE });
    if (!membership) return;
    const recipient = await this.dataSource.getRepository(UserEntity).findOneBy({ id: membership.userId, disabledAt: IsNull() });
    if (!recipient) return;
    await this.notifications.createForRecipient(event.organizationId, {
      recipientUserId: recipient.id, projectId: approval.projectId, typeCode: 'TASK_APPROVAL_REQUESTED', resourceType: 'TASK_APPROVAL_REQUEST', resourceId: approval.id,
      safePayload: { taskId: task.id }, deduplicationKey: `outbox-${event.id}-approval-request`,
    });
    await this.email.sendApprovalRequestEmail({ to: recipient.email, taskTitle: task.title, taskId: task.id, organizationId: event.organizationId, submittedByName: 'A project member' });
  }

  private async redactInvitationCredential(event: OutboxEventEntity): Promise<void> {
    const { credential: _credential, ...metadata } = event.payload;
    event.payload = metadata;
    await this.dataSource.getRepository(OutboxEventEntity).save(event);
  }
}

/** One in-process dispatcher and Worker; no separate process topology is introduced. */
@Injectable()
export class PostgresOutboxRuntime implements OnModuleInit, OnModuleDestroy {
  private readonly worker: Worker<PostgresOutboxJob>;
  private readonly workerConnection: IORedis;
  private timer: NodeJS.Timeout | undefined;
  constructor(private readonly dispatcher: PostgresOutboxDispatcher, processor: PostgresOutboxProcessor) {
    const connection = { ...getRedisConnection(process.env), maxRetriesPerRequest: null };
    this.workerConnection = new IORedis(connection);
    this.workerConnection.on('error', () => undefined);
    this.worker = new Worker<PostgresOutboxJob>(POSTGRES_OUTBOX_QUEUE, (job) => processor.process(job), { connection: this.workerConnection });
    // BullMQ emits Redis shutdown errors after Nest has begun graceful teardown.
    // Keep the process alive long enough to close the worker and queue cleanly.
    this.worker.on('error', () => undefined);
    this.worker.on('failed', async (job) => {
      if (job && job.attemptsMade >= MAX_ATTEMPTS) {
        await this.dispatcher.persistFinalFailure(job.data.outboxEventId, new Error('BullMQ retries exhausted.'));
        await job.remove();
      }
    });
  }
  async onModuleInit(): Promise<void> {
    // Ensure the Worker owns a ready connection before Nest reports the served
    // runtime as initialized. This also makes shutdown deterministic in tests.
    await this.worker.waitUntilReady();
    this.timer = setInterval(() => void this.dispatcher.dispatchReady(), 5_000);
    void this.dispatcher.dispatchReady();
  }
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    // Close the blocking Worker connection before the dispatch Queue. BullMQ
    // otherwise races the two Redis teardown paths and can emit an error after
    // Nest has already completed application shutdown.
    await this.worker.close();
    await this.workerConnection.quit();
    await this.dispatcher.close();
  }
}

function stringPayload(payload: Record<string, unknown>, key: string): string | null { return typeof payload[key] === 'string' ? payload[key] : null; }
function backoffMs(attempt: number): number { return Math.min(60_000, 250 * 2 ** Math.max(0, attempt)); }
function safeError(error: unknown): string { const value = error instanceof Error ? error.message : 'Outbox delivery failed.'; return value.replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]').slice(0, 500); }
