import type { DataSource } from 'typeorm';
import { IsNull } from 'typeorm';
import type { Job, Queue } from 'bullmq';
import {
  OperationalLogger,
  type OperationalEventLogger,
} from '../../../common/observability/operational-logger';
import {
  InvitationState,
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationInvitationEntity,
  UserEntity,
} from '../../onboarding/persistence/typeorm/onboarding.entities';
import { ProjectMembershipEntity } from '../../projects/persistence/typeorm/project.entities';
import { ApprovalRequestEntity, TaskAssigneeEntity, TaskEntity } from '../../task/persistence/typeorm/task.entities';

export const POSTGRES_EMAIL_QUEUE = 'postgres-email';
export type PostgresEmailJobKind = 'INVITATION' | 'ASSIGNMENT' | 'APPROVAL' | 'DUE_REMINDER';

export interface PostgresEmailJob {
  kind: PostgresEmailJobKind;
  organizationId: string;
  projectId?: string;
  taskId?: string;
  invitationId?: string;
  projectMembershipId?: string;
  approvalRequestId?: string;
}

export interface PostgresEmailSender {
  sendEmail(options: { to: string; subject: string; text: string }): Promise<void>;
}

/** Queue producer deliberately serializes only stable database identifiers. */
export class PostgresEmailJobProducer {
  constructor(
    private readonly queue: Queue<PostgresEmailJob>,
    private readonly logger: OperationalEventLogger = new OperationalLogger(),
  ) {}

  async enqueue(job: PostgresEmailJob): Promise<Job<PostgresEmailJob>> {
    const jobId = jobIdFor(job);
    try {
      const queued = await this.queue.add(job.kind, job, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 250 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
      this.logger.info('email_job_enqueued', { ...logContext(job), jobId });
      return queued;
    } catch (error) {
      this.logger.error('email_job_enqueue_failed', {
        ...logContext(job),
        jobId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }
}

/** Re-resolves current database access on every retry before email delivery. */
export class PostgresEmailJobProcessor {
  constructor(
    private readonly dataSource: DataSource,
    private readonly email: PostgresEmailSender,
    private readonly logger: OperationalEventLogger = new OperationalLogger(),
  ) {}

  async process(job: PostgresEmailJob): Promise<void> {
    try {
      const message = await this.resolve(job);
      if (!message) {
        this.logger.warn('email_job_skipped', logContext(job));
        return;
      }
      await this.email.sendEmail(message);
      this.logger.info('email_job_completed', logContext(job));
    } catch (error) {
      this.logger.error('email_job_failed', {
        ...logContext(job),
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }

  private async resolve(job: PostgresEmailJob): Promise<{ to: string; subject: string; text: string } | null> {
    if (job.kind === 'INVITATION') return this.resolveInvitation(job);
    if (!job.projectId || !job.taskId || !job.projectMembershipId) return null;

    const recipient = await this.resolveActiveProjectRecipient(
      job.organizationId,
      job.projectId,
      job.projectMembershipId,
    );
    if (!recipient) return null;
    const task = await this.dataSource.getRepository(TaskEntity).findOneBy({
      id: job.taskId, organizationId: job.organizationId, projectId: job.projectId, archivedAt: IsNull(),
    });
    if (!task) return null;

    if (job.kind === 'ASSIGNMENT') {
      const assigned = await this.dataSource.getRepository(TaskAssigneeEntity).findOneBy({
        organizationId: job.organizationId, projectId: job.projectId, taskId: task.id,
        projectMembershipId: job.projectMembershipId, removedAt: IsNull(),
      });
      if (!assigned) return null;
      return { to: recipient.email, subject: `Task assigned: ${task.title}`, text: `You were assigned to task "${task.title}".` };
    }
    if (job.kind === 'APPROVAL') {
      if (!job.approvalRequestId) return null;
      const approval = await this.dataSource.getRepository(ApprovalRequestEntity).findOneBy({
        id: job.approvalRequestId, organizationId: job.organizationId, projectId: job.projectId, taskId: task.id,
      });
      if (!approval || approval.state !== 'PENDING' || approval.approverProjectMembershipId !== job.projectMembershipId) return null;
      return { to: recipient.email, subject: `Approval requested: ${task.title}`, text: `Task "${task.title}" is awaiting your approval.` };
    }
    if (!task.dueAt) return null;
    const assigned = await this.dataSource.getRepository(TaskAssigneeEntity).findOneBy({
      organizationId: job.organizationId, projectId: job.projectId, taskId: task.id,
      projectMembershipId: job.projectMembershipId, removedAt: IsNull(),
    });
    if (!assigned) return null;
    return { to: recipient.email, subject: `Task reminder: ${task.title}`, text: `Task "${task.title}" is due ${task.dueAt.toISOString()}.` };
  }

  private async resolveInvitation(job: PostgresEmailJob) {
    if (!job.invitationId) return null;
    const invitation = await this.dataSource.getRepository(OrganizationInvitationEntity).findOneBy({
      id: job.invitationId, organizationId: job.organizationId, state: InvitationState.PENDING,
    });
    if (!invitation || invitation.expiresAt.getTime() <= Date.now()) return null;
    return { to: invitation.email, subject: 'You are invited to TaskForge', text: 'You have a pending workspace invitation.' };
  }

  private async resolveActiveProjectRecipient(organizationId: string, projectId: string, projectMembershipId: string): Promise<UserEntity | null> {
    const projectMembership = await this.dataSource.getRepository(ProjectMembershipEntity).findOneBy({
      id: projectMembershipId, organizationId, projectId, removedAt: IsNull(),
    });
    if (!projectMembership) return null;
    const membership = await this.dataSource.getRepository(OrganizationMembershipEntity).findOneBy({
      id: projectMembership.organizationMembershipId, organizationId, state: OrganizationMembershipState.ACTIVE,
    });
    if (!membership) return null;
    return this.dataSource.getRepository(UserEntity).findOneBy({ id: membership.userId, disabledAt: IsNull() });
  }
}

function jobIdFor(job: PostgresEmailJob): string {
  return [job.kind, job.organizationId, job.invitationId ?? job.taskId ?? 'none', job.projectMembershipId ?? job.approvalRequestId ?? 'none'].join('-');
}

function logContext(job: PostgresEmailJob): Record<string, string | undefined> {
  return {
    jobKind: job.kind,
    organizationId: job.organizationId,
    projectId: job.projectId,
    taskId: job.taskId,
    invitationId: job.invitationId,
    projectMembershipId: job.projectMembershipId,
    approvalRequestId: job.approvalRequestId,
  };
}
