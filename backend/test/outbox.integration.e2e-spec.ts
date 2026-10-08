import { testOrganizationRoleId } from '../src/testing/organization-role.fixture';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { EmailService } from '../src/common/services/email.service';
import { PostgresOutboxDispatcher, PostgresOutboxProcessor } from '../src/modules/collaboration/application/outbox-runtime';
import { decryptOutboxInvitationCredential } from '../src/modules/collaboration/application/outbox-credential';
import { OutboxEventEntity } from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';
import { PostgresInvitationMembershipService } from '../src/modules/onboarding/application/invitation-membership.service';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { OrganizationMembershipEntity, OrganizationMembershipState, OrganizationRole, UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresTeamService } from '../src/modules/projects/application/team.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import { PostgresProjectParticipantService } from '../src/modules/projects/application/project-participant.service';
import { ProjectMembershipEntity, ProjectRole, ProjectTaskStatusEntity, TaskStatusSemanticCategory } from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresTaskService } from '../src/modules/task/application/task.service';
import { AuditLogEntity, ActivityEntryEntity, NotificationEntity } from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';
import { PostgresNotificationService } from '../src/modules/collaboration/application/notification.service';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('selective Outbox integration', () => {
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let invitations: PostgresInvitationMembershipService;
  let teams: PostgresTeamService;
  let projects: PostgresProjectService;
  let participants: PostgresProjectParticipantService;
  let tasks: PostgresTaskService;
  let notifications: PostgresNotificationService;
  let queued: Array<{ data: { outboxEventId: string }; opts: { jobId: string } }>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PostgresOnboardingTestModule] }).compile();
    dataSource = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    invitations = module.get(PostgresInvitationMembershipService);
    teams = module.get(PostgresTeamService); projects = module.get(PostgresProjectService);
    participants = module.get(PostgresProjectParticipantService); tasks = module.get(PostgresTaskService);
    notifications = module.get(PostgresNotificationService);
  });

  beforeEach(async () => {
    queued = [];
    await dataSource.query('TRUNCATE TABLE outbox_events, organization_invitations, organization_memberships, teams, organizations, users CASCADE');
  });

  afterAll(async () => { await dataSource.destroy(); });

  it('commits an encrypted invitation event, publishes it with a stable job ID, and reclaims stale claims', async () => {
    const owner = await dataSource.getRepository(UserEntity).save({
      email: `outbox-owner-${Date.now()}@example.test`, name: 'Owner', passwordHash: 'hash', profileImageUrl: null,
      emailVerifiedAt: new Date(), refreshTokenHash: null, disabledAt: null,
    });
    const workspace = await onboarding.createOrganization(owner.id, { name: 'Outbox workspace' });
    const result = await invitations.createInvitation(owner.id, workspace.organizationId, {
      email: 'outbox-invite@example.test', expiresAt: new Date(Date.now() + 60_000),
    });
    const event = await dataSource.getRepository(OutboxEventEntity).findOneByOrFail({ aggregateId: result.invitation.id });
    expect(event.status).toBe('PENDING');
    expect(JSON.stringify(event.payload)).not.toContain(result.token);
    expect(decryptOutboxInvitationCredential(event.payload.credential as Record<string, unknown>)).toBe(result.token);

    const queue = { addBulk: jest.fn(async (jobs) => { queued.push(...jobs); }) } as never;
    const dispatcher = new PostgresOutboxDispatcher(dataSource, queue);
    await expect(dispatcher.dispatchReady()).resolves.toBe(1);
    expect(queued).toEqual([expect.objectContaining({ data: { outboxEventId: event.id }, opts: expect.objectContaining({ jobId: `outbox-${event.id}` }) })]);
    expect((await dataSource.getRepository(OutboxEventEntity).findOneByOrFail({ id: event.id })).status).toBe('PUBLISHED');

    await dataSource.getRepository(OutboxEventEntity).update({ id: event.id }, { status: 'PROCESSING', claimedAt: new Date(Date.now() - 61_000) });
    await expect(dispatcher.reclaimStale()).resolves.toBe(1);
    expect((await dataSource.getRepository(OutboxEventEntity).findOneByOrFail({ id: event.id })).status).toBe('FAILED');

    await dataSource.getRepository(OutboxEventEntity).update({ id: event.id }, { status: 'PUBLISHED' });
    const email = { sendOrganizationInvitationEmail: jest.fn().mockResolvedValue(undefined) };
    const processor = new PostgresOutboxProcessor(dataSource, email as unknown as EmailService, {} as never);
    await processor.process({ data: { outboxEventId: event.id }, attemptsMade: 0 } as never);
    const processed = await dataSource.getRepository(OutboxEventEntity).findOneByOrFail({ id: event.id });
    expect(processed.status).toBe('PROCESSED');
    expect(processed.payload).toEqual({ invitationId: result.invitation.id });
    expect(email.sendOrganizationInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: result.invitation.email,
      acceptLink: expect.stringContaining(encodeURIComponent(result.token)),
    }));
  });

  it('keeps a failed publish durable and delivers it after Redis recovery', async () => {
    const owner = await dataSource.getRepository(UserEntity).save({
      email: `outbox-recovery-${Date.now()}@example.test`, name: 'Owner', passwordHash: 'hash', profileImageUrl: null,
      emailVerifiedAt: new Date(), refreshTokenHash: null, disabledAt: null,
    });
    const workspace = await onboarding.createOrganization(owner.id, { name: 'Outbox recovery workspace' });
    const result = await invitations.createInvitation(owner.id, workspace.organizationId, {
      email: 'outbox-recovery-invite@example.test', expiresAt: new Date(Date.now() + 60_000),
    });
    const event = await dataSource.getRepository(OutboxEventEntity).findOneByOrFail({ aggregateId: result.invitation.id });
    const unavailableDispatcher = new PostgresOutboxDispatcher(dataSource, {
      addBulk: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    } as never);
    await unavailableDispatcher.dispatchReady();
    expect((await dataSource.getRepository(OutboxEventEntity).findOneByOrFail({ id: event.id })).status).toBe('FAILED');

    await dataSource.getRepository(OutboxEventEntity).update({ id: event.id }, { availableAt: new Date() });
    const name = `outbox-recovery-${Date.now()}`;
    const connection = new IORedis({ host: '127.0.0.1', port: 6380, maxRetriesPerRequest: null });
    const workerConnection = new IORedis({ host: '127.0.0.1', port: 6380, maxRetriesPerRequest: null });
    const queue = new Queue(name, { connection });
    const email = { sendOrganizationInvitationEmail: jest.fn().mockResolvedValue(undefined) };
    const processor = new PostgresOutboxProcessor(dataSource, email as unknown as EmailService, {} as never);
    const worker = new Worker(name, (job) => processor.process(job), { connection: workerConnection });
    const recoveredDispatcher = new PostgresOutboxDispatcher(dataSource, queue as never);
    try {
      await worker.waitUntilReady();
      await recoveredDispatcher.dispatchReady();
      await waitFor(async () => (await dataSource.getRepository(OutboxEventEntity).findOneByOrFail({ id: event.id })).status === 'PROCESSED');
      expect(email.sendOrganizationInvitationEmail).toHaveBeenCalledTimes(1);
    } finally {
      await Promise.all([worker.close(), queue.close(), connection.quit(), workerConnection.quit()]);
    }
  });

  it('persists final BullMQ failure before a job can be removed for redispatch', async () => {
    const owner = await dataSource.getRepository(UserEntity).save({ email: `outbox-final-${Date.now()}@example.test`, name: 'Owner', passwordHash: 'hash', profileImageUrl: null, emailVerifiedAt: new Date(), refreshTokenHash: null, disabledAt: null });
    const workspace = await onboarding.createOrganization(owner.id, { name: 'Outbox final failure workspace' });
    const result = await invitations.createInvitation(owner.id, workspace.organizationId, { email: 'outbox-final-invite@example.test', expiresAt: new Date(Date.now() + 60_000) });
    const event = await dataSource.getRepository(OutboxEventEntity).findOneByOrFail({ aggregateId: result.invitation.id });
    await dataSource.getRepository(OutboxEventEntity).update({ id: event.id }, { status: 'PUBLISHED', attempts: 3 });
    const dispatcher = new PostgresOutboxDispatcher(dataSource, {} as never);
    let stateWhenRemoved: string | undefined;
    const failedJob = { remove: async () => { stateWhenRemoved = (await dataSource.getRepository(OutboxEventEntity).findOneByOrFail({ id: event.id })).status; } };
    await dispatcher.persistFinalFailure(event.id, new Error(`delivery failed for ${result.token}`));
    await failedJob.remove();
    const failed = await dataSource.getRepository(OutboxEventEntity).findOneByOrFail({ id: event.id });
    expect(stateWhenRemoved).toBe('FAILED');
    expect(failed.lastError).not.toContain(result.token);
    expect(failed.availableAt.getTime()).toBeGreaterThan(Date.now() - 1_000);
  });

  it('makes duplicate approval worker execution a notification no-op without new activity or audit', async () => {
    const owner = await dataSource.getRepository(UserEntity).save({ email: `outbox-approval-owner-${Date.now()}@example.test`, name: 'Owner', passwordHash: 'hash', profileImageUrl: null, emailVerifiedAt: new Date(), refreshTokenHash: null, disabledAt: null });
    const approver = await dataSource.getRepository(UserEntity).save({ email: `outbox-approval-approver-${Date.now()}@example.test`, name: 'Approver', passwordHash: 'hash', profileImageUrl: null, emailVerifiedAt: new Date(), refreshTokenHash: null, disabledAt: null });
    const workspace = await onboarding.createOrganization(owner.id, { name: 'Outbox approval workspace' });
    const approverMembership = await dataSource.getRepository(OrganizationMembershipEntity).save({ organizationId: workspace.organizationId, userId: approver.id, roleId: await testOrganizationRoleId(dataSource, workspace.organizationId, OrganizationRole.MEMBER), state: OrganizationMembershipState.ACTIVE, joinedAt: new Date(), stateChangedAt: new Date() });
    const actor = { organizationId: workspace.organizationId, membershipId: workspace.membershipId };
    const project = await projects.create(actor, { name: 'Approval project' });
    await teams.addMember(actor, workspace.generalTeamId, approverMembership.id);
    await participants.addMember(actor, project.id, approverMembership.id, ProjectRole.CONTRIBUTOR);
    const approverProjectMembership = await dataSource.getRepository(ProjectMembershipEntity).findOneByOrFail({ organizationId: workspace.organizationId, projectId: project.id, organizationMembershipId: approverMembership.id });
    const status = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({ projectId: project.id, semanticCategory: TaskStatusSemanticCategory.NOT_STARTED });
    const task = await tasks.create(actor, project.id, { owningTeamId: workspace.generalTeamId, statusId: status.id, title: 'Approval task', description: '', priorityCode: 'MEDIUM' });
    await tasks.configureApproval(actor, project.id, task.id, { approverProjectMembershipId: approverProjectMembership.id });
    const approval = await tasks.requestApproval(actor, project.id, task.id);
    const event = await dataSource.getRepository(OutboxEventEntity).findOneByOrFail({ aggregateId: approval.id });
    await dataSource.getRepository(OutboxEventEntity).update({ id: event.id }, { status: 'PUBLISHED' });
    const email = { sendApprovalRequestEmail: jest.fn().mockResolvedValue(undefined) };
    const processor = new PostgresOutboxProcessor(dataSource, email as unknown as EmailService, notifications);
    const activityBefore = await dataSource.getRepository(ActivityEntryEntity).count();
    const auditBefore = await dataSource.getRepository(AuditLogEntity).count();
    await processor.process({ data: { outboxEventId: event.id }, attemptsMade: 0 } as never);
    await processor.process({ data: { outboxEventId: event.id }, attemptsMade: 1 } as never);
    expect(await dataSource.getRepository(NotificationEntity).countBy({ deduplicationKey: `outbox-${event.id}-approval-request` })).toBe(1);
    expect(await dataSource.getRepository(ActivityEntryEntity).count()).toBe(activityBefore);
    expect(await dataSource.getRepository(AuditLogEntity).count()).toBe(auditBefore);
    expect(email.sendApprovalRequestEmail).toHaveBeenCalledTimes(1);
  });

  async function waitFor(check: () => Promise<boolean>): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for Outbox worker.');
  }
});
