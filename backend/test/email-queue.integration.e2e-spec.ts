import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { OperationalEventLogger } from '../src/common/observability/operational-logger';
import { PostgresEmailJobProcessor, PostgresEmailJobProducer, type PostgresEmailJob, type PostgresEmailSender } from '../src/modules/collaboration/application/email-jobs';
import { PostgresInvitationMembershipService } from '../src/modules/onboarding/application/invitation-membership.service';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { OrganizationMembershipEntity, OrganizationMembershipState, OrganizationRole, UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import { PostgresProjectParticipantService } from '../src/modules/projects/application/project-participant.service';
import { PostgresTeamService } from '../src/modules/projects/application/team.service';
import { ProjectMembershipEntity, ProjectRole, ProjectTaskStatusEntity, TaskStatusSemanticCategory } from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresTaskService } from '../src/modules/task/application/task.service';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL email queue integration', () => {
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let invitations: PostgresInvitationMembershipService;
  let projects: PostgresProjectService;
  let participants: PostgresProjectParticipantService;
  let teams: PostgresTeamService;
  let tasks: PostgresTaskService;
  let queue: Queue<PostgresEmailJob>;
  let events: QueueEvents;
  let worker: Worker<PostgresEmailJob>;
  let processor: PostgresEmailJobProcessor;
  let redis: IORedis;
  let workerConnection: IORedis;
  let eventsConnection: IORedis;
  let sent: Array<{ to: string; subject: string }>;
  let failFirstInvitation = true;
  let operationalEvents: Array<{
    level: 'info' | 'warn' | 'error';
    event: string;
    context: Record<string, unknown>;
  }>;
  const operationalLogger: OperationalEventLogger = {
    info: (event, context = {}) => operationalEvents.push({ level: 'info', event, context }),
    warn: (event, context = {}) => operationalEvents.push({ level: 'warn', event, context }),
    error: (event, context = {}) => operationalEvents.push({ level: 'error', event, context }),
  };
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PostgresOnboardingTestModule] }).compile();
    dataSource = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    invitations = module.get(PostgresInvitationMembershipService);
    projects = module.get(PostgresProjectService);
    participants = module.get(PostgresProjectParticipantService);
    teams = module.get(PostgresTeamService);
    tasks = module.get(PostgresTaskService);
    const name = `postgres-email-p5-${Date.now()}`;
    redis = new IORedis({ host: '127.0.0.1', port: 6380, maxRetriesPerRequest: null });
    queue = new Queue<PostgresEmailJob>(name, { connection: redis });
    eventsConnection = new IORedis({ host: '127.0.0.1', port: 6380, maxRetriesPerRequest: null });
    events = new QueueEvents(name, { connection: eventsConnection });
    const sender: PostgresEmailSender = {
      sendEmail: async ({ to, subject }) => {
        sent.push({ to, subject });
        if (subject === 'You are invited to TaskForge' && failFirstInvitation) {
          failFirstInvitation = false;
          throw new Error('simulated SMTP failure');
        }
      },
    };
    processor = new PostgresEmailJobProcessor(
      dataSource,
      sender,
      operationalLogger,
    );
    workerConnection = new IORedis({ host: '127.0.0.1', port: 6380, maxRetriesPerRequest: null });
    worker = new Worker(name, (job) => processor.process(job.data), { connection: workerConnection });
    await Promise.all([events.waitUntilReady(), worker.waitUntilReady()]);
  });

  beforeEach(async () => {
    sequence += 1;
    sent = [];
    operationalEvents = [];
    failFirstInvitation = true;
    await dataSource.query(`TRUNCATE TABLE notifications, audit_logs, activity_entries, comments, task_approval_requests, task_checklist_items, task_assignees, tasks, project_module_settings, project_task_statuses, project_memberships, project_teams, team_members, organization_invitations, organization_memberships, teams, organizations, users RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await Promise.all([worker.close(), events.close(), queue.close()]);
    await Promise.all([workerConnection.quit(), eventsConnection.quit(), redis.quit()]);
    await dataSource.destroy();
  });

  it('retries stable-ID invitation jobs and skips stale assignment recipients', async () => {
    const owner = await workspace('owner');
    const invite = await invitations.createInvitation(owner.userId, owner.organizationId, {
      email: `invite-${sequence}@example.test`, expiresAt: new Date(Date.now() + 60_000), role: OrganizationRole.MEMBER,
    });
    const producer = new PostgresEmailJobProducer(queue, operationalLogger);
    const invitationJob = await producer.enqueue({ kind: 'INVITATION', organizationId: owner.organizationId, invitationId: invite.invitation.id });
    expect(invitationJob.data).toEqual({ kind: 'INVITATION', organizationId: owner.organizationId, invitationId: invite.invitation.id });
    await invitationJob.waitUntilFinished(events);
    expect(sent.filter((message) => message.to === invite.invitation.email)).toHaveLength(2);
    expect(operationalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'email_job_enqueued', level: 'info' }),
        expect.objectContaining({ event: 'email_job_failed', level: 'error' }),
        expect.objectContaining({ event: 'email_job_completed', level: 'info' }),
      ]),
    );
    const duplicateInvitationJob = await producer.enqueue({ kind: 'INVITATION', organizationId: owner.organizationId, invitationId: invite.invitation.id });
    expect(duplicateInvitationJob.id).toBe(invitationJob.id);
    expect(sent.filter((message) => message.to === invite.invitation.email)).toHaveLength(2);

    const recipient = await user('recipient');
    const recipientMembership = await dataSource.getRepository(OrganizationMembershipEntity).save({ organizationId: owner.organizationId, userId: recipient.id, role: OrganizationRole.MEMBER, state: OrganizationMembershipState.ACTIVE, joinedAt: new Date(), stateChangedAt: new Date() });
    const project = await projects.create({ organizationId: owner.organizationId, membershipId: owner.membershipId }, { name: 'Queue project' });
    await teams.addMember({ organizationId: owner.organizationId, membershipId: owner.membershipId }, owner.generalTeamId, recipientMembership.id);
    await participants.addMember({ organizationId: owner.organizationId, membershipId: owner.membershipId }, project.id, recipientMembership.id, ProjectRole.CONTRIBUTOR);
    const recipientProjectMembership = await dataSource.getRepository(ProjectMembershipEntity).findOneByOrFail({ organizationId: owner.organizationId, projectId: project.id, organizationMembershipId: recipientMembership.id });
    const status = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({ projectId: project.id, semanticCategory: TaskStatusSemanticCategory.NOT_STARTED });
    const task = await tasks.create({ organizationId: owner.organizationId, membershipId: owner.membershipId }, project.id, { owningTeamId: owner.generalTeamId, statusId: status.id, title: 'Queue task', description: '', priorityCode: 'MEDIUM', dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    await tasks.assign({ organizationId: owner.organizationId, membershipId: owner.membershipId }, project.id, task.id, recipientProjectMembership.id);

    const assignmentJob = await producer.enqueue({ kind: 'ASSIGNMENT', organizationId: owner.organizationId, projectId: project.id, taskId: task.id, projectMembershipId: recipientProjectMembership.id });
    await assignmentJob.waitUntilFinished(events);
    expect(sent).toContainEqual(expect.objectContaining({ to: recipient.email, subject: expect.stringContaining('Task assigned') }));

    await tasks.unassign({ organizationId: owner.organizationId, membershipId: owner.membershipId }, project.id, task.id, recipientProjectMembership.id);
    await tasks.configureApproval({ organizationId: owner.organizationId, membershipId: owner.membershipId }, project.id, task.id, { approverProjectMembershipId: recipientProjectMembership.id });
    const approval = await tasks.requestApproval({ organizationId: owner.organizationId, membershipId: owner.membershipId }, project.id, task.id);
    const approvalJob = await producer.enqueue({ kind: 'APPROVAL', organizationId: owner.organizationId, projectId: project.id, taskId: task.id, projectMembershipId: recipientProjectMembership.id, approvalRequestId: approval.id });
    await approvalJob.waitUntilFinished(events);
    expect(sent).toContainEqual(expect.objectContaining({ to: recipient.email, subject: expect.stringContaining('Approval requested') }));

    await tasks.assign({ organizationId: owner.organizationId, membershipId: owner.membershipId }, project.id, task.id, recipientProjectMembership.id);
    const dueJob = await producer.enqueue({ kind: 'DUE_REMINDER', organizationId: owner.organizationId, projectId: project.id, taskId: task.id, projectMembershipId: recipientProjectMembership.id });
    await dueJob.waitUntilFinished(events);
    expect(sent).toContainEqual(expect.objectContaining({ to: recipient.email, subject: expect.stringContaining('Task reminder') }));

    recipientMembership.state = OrganizationMembershipState.REVOKED;
    recipientMembership.stateChangedAt = new Date();
    await dataSource.getRepository(OrganizationMembershipEntity).save(recipientMembership);
    sent = [];
    await processor.process({
      kind: 'DUE_REMINDER',
      organizationId: owner.organizationId,
      projectId: project.id,
      taskId: task.id,
      projectMembershipId: recipientProjectMembership.id,
    });
    expect(sent).toEqual([]);
    expect(operationalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'email_job_skipped', level: 'warn' }),
      ]),
    );
  });

  async function workspace(prefix: string) {
    const createdUser = await user(prefix);
    const created = await onboarding.createOrganization(createdUser.id, { name: `${prefix} workspace` });
    return { ...created, userId: createdUser.id };
  }
  function user(prefix: string) {
    return dataSource.getRepository(UserEntity).save({ email: `${prefix}-${sequence}@example.test`, name: prefix, passwordHash: 'test-hash', profileImageUrl: null, emailVerifiedAt: new Date(), refreshTokenHash: null, disabledAt: null });
  }
});
