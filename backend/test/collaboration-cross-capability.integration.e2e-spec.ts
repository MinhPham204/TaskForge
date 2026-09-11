import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import {
  InvitationState,
  OrganizationInvitationEntity,
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import { PostgresProjectParticipantService } from '../src/modules/projects/application/project-participant.service';
import { PostgresProjectModuleService } from '../src/modules/projects/application/project-module.service';
import {
  ProjectModuleCode,
  ProjectRole,
  ProjectTaskStatusEntity,
  TaskStatusSemanticCategory,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresTeamService } from '../src/modules/projects/application/team.service';
import { PostgresTaskService } from '../src/modules/task/application/task.service';
import { PostgresNotificationService } from '../src/modules/collaboration/application/notification.service';
import {
  ActivityEntryEntity,
  AuditLogEntity,
  StoredFileEntity,
} from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';
import {
  PostgresEmailJobProcessor,
  type PostgresEmailSender,
} from '../src/modules/collaboration/application/email-jobs';
import { PostgresFileStorageService } from '../src/modules/collaboration/application/file-storage';
import { PostgresFileRelationService } from '../src/modules/collaboration/application/file-relation.service';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Collaboration & Files Cross-Capability Regression (P5-10)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let participants: PostgresProjectParticipantService;
  let modules: PostgresProjectModuleService;
  let teams: PostgresTeamService;
  let tasks: PostgresTaskService;
  let notifications: PostgresNotificationService;
  let fileStorage: PostgresFileStorageService;
  let fileRelations: PostgresFileRelationService;
  let httpServer: Parameters<typeof request>[0];
  let sequence = 0;

  beforeAll(async () => {
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

    dataSource = module.get(DataSource);
    jwt = module.get(JwtService);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    projects = module.get(PostgresProjectService);
    participants = module.get(PostgresProjectParticipantService);
    modules = module.get(PostgresProjectModuleService);
    teams = module.get(PostgresTeamService);
    tasks = module.get(PostgresTaskService);
    notifications = module.get(PostgresNotificationService);
    fileStorage = module.get(PostgresFileStorageService);
    fileRelations = module.get(PostgresFileRelationService);
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  });

  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(`
      TRUNCATE TABLE notifications, audit_logs, activity_entries, project_files,
        task_attachments, stored_files, comments, task_approval_requests,
        task_checklist_items, task_assignees, tasks, project_module_settings,
        project_task_statuses, project_memberships, project_teams, team_members,
        organization_invitations, organization_memberships, teams, organizations, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  function accessToken(userId: string) {
    return jwt.sign({ sub: userId }, { secret: 'local-test-access-secret', expiresIn: '1h' });
  }

  async function createUser(prefix: string) {
    return dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}-${Date.now()}@example.test`,
      passwordHash: 'hash',
      name: `User ${prefix}`,
      profileImageUrl: null,
      disabledAt: null,
    });
  }

  async function addActiveMembership(
    userId: string,
    organizationId: string,
    role: OrganizationRole,
  ) {
    return dataSource.getRepository(OrganizationMembershipEntity).save({
      organizationId,
      userId,
      role,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date(),
      stateChangedAt: new Date(),
    });
  }

  it('enforces strict cross-tenant isolation for stored files, attachments, and notifications', async () => {
    // 1. Create Organization A and Organization B
    const userA = await createUser('tenant-a-owner');
    const userB = await createUser('tenant-b-owner');

    const wsA = await onboarding.createOrganization(userA.id, { name: `Org A ${sequence}` });
    const wsB = await onboarding.createOrganization(userB.id, { name: `Org B ${sequence}` });

    const actorA = { organizationId: wsA.organizationId, membershipId: wsA.membershipId };
    const actorB = { organizationId: wsB.organizationId, membershipId: wsB.membershipId };

    // Projects in both orgs
    const projectA = await projects.create(actorA, { name: 'Project A' });
    const projectB = await projects.create(actorB, { name: 'Project B' });

    const statusA = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId: projectA.id,
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
    });
    const statusB = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId: projectB.id,
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
    });

    const taskA = await tasks.create(actorA, projectA.id, {
      owningTeamId: wsA.generalTeamId,
      statusId: statusA.id,
      title: 'Task in Org A',
      description: '',
      priorityCode: 'MEDIUM',
    });
    const taskB = await tasks.create(actorB, projectB.id, {
      owningTeamId: wsB.generalTeamId,
      statusId: statusB.id,
      title: 'Task in Org B',
      description: '',
      priorityCode: 'MEDIUM',
    });

    // User A uploads stored file in Org A
    const storedFileA = await fileStorage.upload(actorA, {
      bytes: Buffer.from('Confidential Org A Content'),
      originalName: 'secret.txt',
      mediaType: 'text/plain',
    });

    // Verify stored file has Org A tenant id
    await expect(
      dataSource.getRepository(StoredFileEntity).findOneByOrFail({ id: storedFileA.id }),
    ).resolves.toEqual(expect.objectContaining({ organizationId: wsA.organizationId }));

    // Cross-tenant negative 1: User B cannot attach Org A's stored file to Org B's task
    await expect(
      fileRelations.attachToTask(actorB, projectB.id, taskB.id, storedFileA.id),
    ).rejects.toThrow();

    // Cross-tenant negative 2: User B cannot link Org A's stored file as Project File in Org B
    await expect(
      fileRelations.addToProject(actorB, projectB.id, storedFileA.id),
    ).rejects.toThrow();

    // Cross-tenant negative 3: User B cannot download Org A's stored file
    await expect(
      fileStorage.download(actorB, storedFileA.id),
    ).rejects.toThrow();

    // Cross-tenant negative 4: Notification for User A is invisible to User B
    await notifications.createForRecipient(wsA.organizationId, {
      recipientUserId: userA.id,
      typeCode: 'TASK_ASSIGNED',
      resourceType: 'TASK',
      safePayload: { taskTitle: 'Secret task' },
    });

    const inboxB = await notifications.listInbox(actorB);
    expect(inboxB).toHaveLength(0);

    // HTTP endpoint cross-tenant verification: User B cannot download attachment in Org A
    const attachA = await fileRelations.attachToTask(
      actorA,
      projectA.id,
      taskA.id,
      storedFileA.id,
    );

    await request(httpServer)
      .get(`/api/projects/${projectA.id}/tasks/${taskA.id}/attachments/${attachA.id}/download`)
      .set('authorization', `Bearer ${accessToken(userB.id)}`)
      .set('x-organization-id', wsB.organizationId)
      .expect(404); // Not found in Org B context
  });

  it('prunes revoked/inactive recipients from notifications, activities, and async jobs', async () => {
    const owner = await createUser('owner');
    const member = await createUser('target-member');

    const workspace = await onboarding.createOrganization(owner.id, { name: `Prune Org ${sequence}` });
    const ownerActor = { organizationId: workspace.organizationId, membershipId: workspace.membershipId };

    const memberMembership = await addActiveMembership(
      member.id,
      workspace.organizationId,
      OrganizationRole.MEMBER,
    );

    const project = await projects.create(ownerActor, { name: 'Prune Project' });
    await teams.addMember(ownerActor, workspace.generalTeamId, memberMembership.id);
    await participants.addMember(ownerActor, project.id, memberMembership.id, ProjectRole.CONTRIBUTOR);

    // Initial notification for active member works
    const notif1 = await notifications.createForRecipient(workspace.organizationId, {
      recipientUserId: member.id,
      typeCode: 'TASK_ASSIGNED',
      resourceType: 'TASK',
      safePayload: { info: 'Welcome' },
    });
    expect(notif1).toBeTruthy();

    // Deactivate member membership (revoke)
    await dataSource.getRepository(OrganizationMembershipEntity).update(memberMembership.id, {
      state: OrganizationMembershipState.REVOKED,
      stateChangedAt: new Date(),
    });

    // Notification service now prunes revoked member (returns null)
    const notif2 = await notifications.createForRecipient(workspace.organizationId, {
      recipientUserId: member.id,
      typeCode: 'TASK_ASSIGNED',
      resourceType: 'TASK',
      safePayload: { info: 'Should not receive' },
    });
    expect(notif2).toBeNull();

    // Email processor re-checks active status: does NOT send email to revoked recipient
    const sentEmails: Array<{ to: string; subject: string }> = [];
    const mockEmailSender: PostgresEmailSender = {
      sendEmail: async (opts) => {
        sentEmails.push(opts);
      },
    };
    const processor = new PostgresEmailJobProcessor(dataSource, mockEmailSender);

    // Mock invitation job that was revoked
    const invite = await dataSource.getRepository(OrganizationInvitationEntity).save({
      organizationId: workspace.organizationId,
      email: `revoked-invite-${sequence}@example.test`,
      invitedRole: OrganizationRole.MEMBER,
      state: InvitationState.REVOKED,
      tokenHash: 'hash',
      invitedByMembershipId: workspace.membershipId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await processor.process({
      kind: 'INVITATION',
      organizationId: workspace.organizationId,
      invitationId: invite.id,
    });
    expect(sentEmails).toHaveLength(0); // Revoked invitation skipped

    // HTTP Guard check: Revoked member cannot access notifications
    await request(httpServer)
      .get('/api/notifications')
      .set('authorization', `Bearer ${accessToken(member.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(403);
  });

  it('guarantees FILES module disabled behavior: blocks new uploads, keeps history, allows unlink and task attachments', async () => {
    const owner = await createUser('pm-user');
    const contributor = await createUser('contrib-user');

    const workspace = await onboarding.createOrganization(owner.id, { name: `Module Org ${sequence}` });
    const pmActor = { organizationId: workspace.organizationId, membershipId: workspace.membershipId };

    const contribMembership = await addActiveMembership(
      contributor.id,
      workspace.organizationId,
      OrganizationRole.MEMBER,
    );

    const project = await projects.create(pmActor, { name: 'Module Gating Project' });
    await teams.addMember(pmActor, workspace.generalTeamId, contribMembership.id);
    await participants.addMember(pmActor, project.id, contribMembership.id, ProjectRole.CONTRIBUTOR);

    const status = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId: project.id,
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
    });

    const task = await tasks.create(pmActor, project.id, {
      owningTeamId: workspace.generalTeamId,
      statusId: status.id,
      title: 'Module Invariant Task',
      description: '',
      priorityCode: 'LOW',
    });

    // Enable FILES module initially
    await modules.setEnabled(pmActor, project.id, ProjectModuleCode.FILES, true);

    // Upload a Project File as PM
    const uploadProjRes = await request(httpServer)
      .post(`/api/projects/${project.id}/files`)
      .set('authorization', `Bearer ${accessToken(owner.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .field('displayName', 'Project Specs')
      .attach('file', Buffer.from('Specification v1'), 'specs.txt')
      .expect(201);

    const projectFileId = uploadProjRes.body.id;

    // Upload a Task Attachment as Contributor
    const uploadAttach1Res = await request(httpServer)
      .post(`/api/projects/${project.id}/tasks/${task.id}/attachments`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .attach('file', Buffer.from('Initial task attachment content'), 'attach1.txt')
      .expect(201);

    const attachment1Id = uploadAttach1Res.body.id;

    // DISABLE FILES MODULE
    await modules.setEnabled(pmActor, project.id, ProjectModuleCode.FILES, false);

    // 1. Invariant: Uploading NEW Project File is now blocked (409 Conflict)
    await request(httpServer)
      .post(`/api/projects/${project.id}/files`)
      .set('authorization', `Bearer ${accessToken(owner.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .field('displayName', 'Should Fail')
      .attach('file', Buffer.from('New content'), 'fail.txt')
      .expect(409);

    // 2. Invariant: Task Attachments continue to work completely unhindered!
    // Upload a second Task Attachment while FILES module is disabled
    const uploadAttach2Res = await request(httpServer)
      .post(`/api/projects/${project.id}/tasks/${task.id}/attachments`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .attach('file', Buffer.from('Second task attachment when FILES is disabled'), 'attach2.txt')
      .expect(201);

    expect(uploadAttach2Res.body).toBeTruthy();

    // List attachments returns both
    const listAttachRes = await request(httpServer)
      .get(`/api/projects/${project.id}/tasks/${task.id}/attachments`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(listAttachRes.body).toHaveLength(2);

    // Download first attachment works
    const downloadAttach1Res = await request(httpServer)
      .get(`/api/projects/${project.id}/tasks/${task.id}/attachments/${attachment1Id}/download`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(downloadAttach1Res.text).toBe('Initial task attachment content');

    // Unlink attachment works
    await request(httpServer)
      .delete(`/api/projects/${project.id}/tasks/${task.id}/attachments/${attachment1Id}`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);

    // 3. Invariant: Existing Project File history is preserved and accessible
    const listFilesRes = await request(httpServer)
      .get(`/api/projects/${project.id}/files`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(listFilesRes.body).toHaveLength(1);
    expect(listFilesRes.body[0].displayName).toBe('Project Specs');

    // Existing Project File can still be downloaded
    const downloadProjRes = await request(httpServer)
      .get(`/api/projects/${project.id}/files/${projectFileId}/download`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(downloadProjRes.text).toBe('Specification v1');

    // PM can still soft-unlink existing Project File while module is disabled
    await request(httpServer)
      .delete(`/api/projects/${project.id}/files/${projectFileId}`)
      .set('authorization', `Bearer ${accessToken(owner.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);

    // List after unlink returns 0
    const listFilesAfterRes = await request(httpServer)
      .get(`/api/projects/${project.id}/files`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(listFilesAfterRes.body).toHaveLength(0);
  });

  it('preserves business Source of Truth and enforces append-only immutability on audit logs', async () => {
    const owner = await createUser('audit-owner');
    const workspace = await onboarding.createOrganization(owner.id, { name: `Audit Org ${sequence}` });
    const actor = { organizationId: workspace.organizationId, membershipId: workspace.membershipId };

    const project = await projects.create(actor, { name: 'Audit Project' });
    const status = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId: project.id,
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
    });

    const task = await tasks.create(actor, project.id, {
      owningTeamId: workspace.generalTeamId,
      statusId: status.id,
      title: 'Audit Invariant Task',
      description: 'Audit test description',
      priorityCode: 'HIGH',
    });

    // Business mutation records Activity with safe metadata
    const activities = await dataSource.getRepository(ActivityEntryEntity).find({
      where: { projectId: project.id },
      order: { occurredAt: 'DESC' },
    });
    expect(activities.length).toBeGreaterThan(0);
    expect(activities[0].subjectId).toBe(task.id);
    expect(activities[0].safeMetadata).not.toHaveProperty('password');
    expect(activities[0].safeMetadata).not.toHaveProperty('token');

    // Create Audit Log row
    const auditRepo = dataSource.getRepository(AuditLogEntity);
    const auditRow = await auditRepo.save({
      organizationId: workspace.organizationId,
      projectId: project.id,
      actorUserId: owner.id,
      actorMembershipId: workspace.membershipId,
      actionCode: 'TASK_CREATE',
      targetType: 'TASK',
      targetId: task.id,
      outcomeCode: 'SUCCESS',
      reason: null,
      beforeData: null,
      afterData: { title: 'Audit Invariant Task' },
      correlationId: null,
      occurredAt: new Date(),
    });

    // Invariant: Append-only audit log rejects UPDATE
    await expect(
      dataSource.query(
        `UPDATE audit_logs SET reason = 'tampered' WHERE id = $1`,
        [auditRow.id],
      ),
    ).rejects.toThrow();

    // Invariant: Append-only audit log rejects DELETE
    await expect(
      dataSource.query(
        `DELETE FROM audit_logs WHERE id = $1`,
        [auditRow.id],
      ),
    ).rejects.toThrow();
  });
});
