import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import {
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
import { PostgresTaskService } from '../src/modules/task/application/task.service';
import { PostgresNotificationService } from '../src/modules/collaboration/application/notification.service';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Collaboration & Files HTTP Integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let participants: PostgresProjectParticipantService;
  let modules: PostgresProjectModuleService;
  let tasks: PostgresTaskService;
  let notifications: PostgresNotificationService;
  let httpServer: Parameters<typeof request>[0];
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
    jwt = app.get(JwtService);
    onboarding = app.get(PostgresOrganizationOnboardingService);
    projects = app.get(PostgresProjectService);
    participants = app.get(PostgresProjectParticipantService);
    modules = app.get(PostgresProjectModuleService);
    tasks = app.get(PostgresTaskService);
    notifications = app.get(PostgresNotificationService);
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

  it('verifies notification inbox, mark read, and mark unread lifecycle', async () => {
    const owner = await createUser('notif-owner');
    const member = await createUser('notif-member');
    const workspace = await onboarding.createOrganization(owner.id, {
      name: `Notif Workspace ${sequence}`,
    });
    const memberMembership = await addActiveMembership(
      member.id,
      workspace.organizationId,
      OrganizationRole.MEMBER,
    );

    const createdNotif = await notifications.createForRecipient(
      workspace.organizationId,
      {
        recipientUserId: member.id,
        typeCode: 'TASK_ASSIGNED',
        resourceType: 'TASK',
        safePayload: { taskTitle: 'Review security findings' },
      },
    );
    expect(createdNotif).toBeTruthy();

    // List notifications as member
    const listRes = await request(httpServer)
      .get('/notifications')
      .set('authorization', `Bearer ${accessToken(member.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);

    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0]).toMatchObject({
      id: createdNotif?.id,
      typeCode: 'TASK_ASSIGNED',
      readAt: null,
      safePayload: { taskTitle: 'Review security findings' },
    });

    // Mark as read
    const readRes = await request(httpServer)
      .patch(`/notifications/${createdNotif?.id}/read`)
      .set('authorization', `Bearer ${accessToken(member.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(readRes.body.readAt).toBeTruthy();

    // Mark as unread
    const unreadRes = await request(httpServer)
      .patch(`/notifications/${createdNotif?.id}/unread`)
      .set('authorization', `Bearer ${accessToken(member.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(unreadRes.body.readAt).toBeNull();
  });

  it('verifies project activity timeline, project files gating, and task attachments', async () => {
    const pm = await createUser('pm');
    const contributor = await createUser('contributor');
    const outsider = await createUser('outsider');
    const workspace = await onboarding.createOrganization(pm.id, {
      name: `Collab Workspace ${sequence}`,
    });
    const pmActor = {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };

    const project = await projects.create(pmActor, { name: 'Collab Project' });
    const contributorMembership = await addActiveMembership(
      contributor.id,
      workspace.organizationId,
      OrganizationRole.MEMBER,
    );
    await participants.addMember(
      pmActor,
      project.id,
      contributorMembership.id,
      ProjectRole.CONTRIBUTOR,
    );

    const status = await dataSource
      .getRepository(ProjectTaskStatusEntity)
      .findOneByOrFail({
        projectId: project.id,
        semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
      });

    const task = await tasks.create(pmActor, project.id, {
      owningTeamId: workspace.generalTeamId,
      statusId: status.id,
      title: 'Collab Task',
      description: 'Test task',
      priorityCode: 'HIGH',
      dueAt: null,
    });

    // 1. Verify Activity timeline contains project & task activities
    const activityRes = await request(httpServer)
      .get(`/projects/${project.id}/activities`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(Array.isArray(activityRes.body)).toBe(true);
    expect(activityRes.body.length).toBeGreaterThanOrEqual(2); // Project created, task created
    expect(activityRes.body[0]).toHaveProperty('actionCode');
    expect(activityRes.body[0]).toHaveProperty('safeMetadata');
    expect(activityRes.body[0]).not.toHaveProperty('objectKey');

    // 2. Task Attachment: works when FILES module is disabled!
    await modules.setEnabled(pmActor, project.id, ProjectModuleCode.FILES, false);

    const attachRes = await request(httpServer)
      .post(`/projects/${project.id}/tasks/${task.id}/attachments`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .attach('file', Buffer.from('attachment file content'), 'notes.txt')
      .expect(201);

    expect(attachRes.body).toMatchObject({
      taskId: task.id,
      originalName: 'notes.txt',
      mediaType: 'text/plain',
    });

    // List task attachments
    const listAttachmentsRes = await request(httpServer)
      .get(`/projects/${project.id}/tasks/${task.id}/attachments`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(listAttachmentsRes.body).toHaveLength(1);
    expect(listAttachmentsRes.body[0].id).toBe(attachRes.body.id);

    // Download task attachment
    const downloadAttachRes = await request(httpServer)
      .get(`/projects/${project.id}/tasks/${task.id}/attachments/${attachRes.body.id}/download`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(downloadAttachRes.text).toBe('attachment file content');

    // Unlink task attachment
    await request(httpServer)
      .delete(`/projects/${project.id}/tasks/${task.id}/attachments/${attachRes.body.id}`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);

    // 3. Project Files: Gated by FILES module and PM role
    // When FILES module is disabled: PM cannot upload
    await request(httpServer)
      .post(`/projects/${project.id}/files`)
      .set('authorization', `Bearer ${accessToken(pm.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .attach('file', Buffer.from('project doc content'), 'spec.pdf')
      .expect(409); // ConflictException: Project Files module is disabled

    // Enable FILES module
    await modules.setEnabled(pmActor, project.id, ProjectModuleCode.FILES, true);

    // Contributor cannot upload Project file (only PM)
    await request(httpServer)
      .post(`/projects/${project.id}/files`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .attach('file', Buffer.from('project doc content'), 'spec.pdf')
      .expect(403); // ForbiddenException: An active Project Manager is required

    // PM uploads Project file
    const uploadProjFileRes = await request(httpServer)
      .post(`/projects/${project.id}/files`)
      .set('authorization', `Bearer ${accessToken(pm.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .field('displayName', 'Architecture Blueprint')
      .attach('file', Buffer.from('blueprint content'), 'blueprint.txt')
      .expect(201);

    expect(uploadProjFileRes.body).toMatchObject({
      projectId: project.id,
      displayName: 'Architecture Blueprint',
      originalName: 'blueprint.txt',
    });

    // Contributor can list and download Project file
    const listFilesRes = await request(httpServer)
      .get(`/projects/${project.id}/files`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(listFilesRes.body).toHaveLength(1);
    expect(listFilesRes.body[0].displayName).toBe('Architecture Blueprint');

    const downloadProjFileRes = await request(httpServer)
      .get(`/projects/${project.id}/files/${uploadProjFileRes.body.id}/download`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    expect(downloadProjFileRes.text).toBe('blueprint content');

    // Disable FILES module: existing file can STILL be unlinked and downloaded!
    await modules.setEnabled(pmActor, project.id, ProjectModuleCode.FILES, false);

    // Download still works when disabled
    await request(httpServer)
      .get(`/projects/${project.id}/files/${uploadProjFileRes.body.id}/download`)
      .set('authorization', `Bearer ${accessToken(contributor.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);

    // PM can unlink when disabled
    await request(httpServer)
      .delete(`/projects/${project.id}/files/${uploadProjFileRes.body.id}`)
      .set('authorization', `Bearer ${accessToken(pm.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);

    // Negative: Outsider access fails
    await request(httpServer)
      .get(`/projects/${project.id}/activities`)
      .set('authorization', `Bearer ${accessToken(outsider.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(403);

    await request(httpServer)
      .get(`/projects/${project.id}/files`)
      .set('authorization', `Bearer ${accessToken(outsider.id)}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(403);
  });

  async function createUser(prefix: string): Promise<UserEntity> {
    return dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: 'test-hash',
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
  }

  function addActiveMembership(
    userId: string,
    organizationId: string,
    role: OrganizationRole,
  ): Promise<OrganizationMembershipEntity> {
    return dataSource.getRepository(OrganizationMembershipEntity).save({
      userId,
      organizationId,
      role,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date(),
      stateChangedAt: new Date(),
    });
  }

  function accessToken(userId: string): string {
    return jwt.sign(
      { sub: userId, email: 'ignored@example.test' },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
  }
});
