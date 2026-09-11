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
import {
  ProjectRole,
  ProjectModuleCode,
  ProjectMembershipEntity,
  ProjectTaskStatusEntity,
  TaskStatusSemanticCategory,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresTeamService } from '../src/modules/projects/application/team.service';
import {
  TaskAssigneeEntity,
  TaskEntity,
} from '../src/modules/task/persistence/typeorm/task.entities';
import { PostgresNotificationService } from '../src/modules/collaboration/application/notification.service';
import { ActivityEntryEntity, AuditLogEntity, NotificationEntity } from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Task create/update/archive integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let participants: PostgresProjectParticipantService;
  let teams: PostgresTeamService;
  let jwt: JwtService;
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
    onboarding = module.get(PostgresOrganizationOnboardingService);
    projects = module.get(PostgresProjectService);
    participants = module.get(PostgresProjectParticipantService);
    teams = module.get(PostgresTeamService);
    jwt = module.get(JwtService);
  });

  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(`
      TRUNCATE TABLE comments, task_approval_requests, task_checklist_items,
        task_assignees, tasks, project_module_settings, project_task_statuses,
        project_memberships, project_teams, team_members,
        organization_invitations, organization_memberships, teams,
        organizations, users RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => app.close());

  it('creates, updates and soft-archives a Task through the PostgreSQL API', async () => {
    const workspace = await createWorkspace('primary');
    const actor = {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
    const project = await projects.create(actor, { name: 'Task project' });
    const status = await dataSource
      .getRepository(ProjectTaskStatusEntity)
      .findOneByOrFail({
        projectId: project.id,
        semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
      });
    const token = await accessToken(workspace.userId, workspace.email);
    const payload = {
      owningTeamId: workspace.generalTeamId,
      statusId: status.id,
      title: '  Prepare release  ',
      description: 'Initial content',
      priorityCode: 'MEDIUM',
      dueAt: '2026-10-01T09:00:00.000Z',
    };

    const created = await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send(payload)
      .expect(201);
    expect(created.body.title).toBe('Prepare release');
    expect(created.body.creatorProjectMembershipId).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ priorityCode: 'HIGH', title: 'Release checklist' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.priorityCode).toBe('HIGH');
        expect(body.title).toBe('Release checklist');
      });

    await request(app.getHttpServer())
      .delete(`/api/projects/${project.id}/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    await expect(
      dataSource.getRepository(TaskEntity).findOneByOrFail({
        id: created.body.id,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ archivedAt: expect.any(Date) }),
    );
    await expect(
      dataSource.getRepository(ActivityEntryEntity).find({
        where: { projectId: project.id },
        order: { occurredAt: 'ASC' },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionCode: 'PROJECT_CREATED', subjectId: project.id }),
        expect.objectContaining({ actionCode: 'TASK_CREATED', subjectId: created.body.id }),
        expect.objectContaining({ actionCode: 'TASK_UPDATED', subjectId: created.body.id }),
        expect.objectContaining({ actionCode: 'TASK_ARCHIVED', subjectId: created.body.id }),
      ]),
    );
    await expect(
      dataSource.getRepository(AuditLogEntity).find({
        where: { projectId: project.id },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionCode: 'PROJECT_CREATED', targetId: project.id }),
      ]),
    );
  });

  it('enforces Document ownership, Project visibility, archive and cross-tenant access over HTTP', async () => {
    const workspace = await createWorkspace('documents');
    const actor = { organizationId: workspace.organizationId, membershipId: workspace.membershipId };
    const project = await projects.create(actor, { name: 'Document project' });
    const contributorOrgMembership = await createMember(workspace.organizationId, 'document-contributor');
    await teams.addMember(actor, workspace.generalTeamId, contributorOrgMembership.id);
    await participants.addMember(actor, project.id, contributorOrgMembership.id, ProjectRole.CONTRIBUTOR);
    const contributor = await dataSource.getRepository(UserEntity).findOneByOrFail({ id: contributorOrgMembership.userId });
    const managerToken = await accessToken(workspace.userId, workspace.email);
    const contributorToken = await accessToken(contributor.id, contributor.email);
    const created = await request(app.getHttpServer()).post(`/api/projects/${project.id}/documents`).set('Authorization', `Bearer ${managerToken}`).set('x-organization-id', workspace.organizationId).send({ title: 'Runbook', content: 'Initial content' }).expect(201);
    expect(created.body.authorProjectMembershipId).toBeTruthy();
    await request(app.getHttpServer()).get(`/api/projects/${project.id}/documents`).set('Authorization', `Bearer ${contributorToken}`).set('x-organization-id', workspace.organizationId).expect(200).expect(({ body }) => expect(body).toHaveLength(1));
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/documents/${created.body.id}`).set('Authorization', `Bearer ${contributorToken}`).set('x-organization-id', workspace.organizationId).send({ content: 'Unauthorized edit' }).expect(403);
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/documents/${created.body.id}`).set('Authorization', `Bearer ${managerToken}`).set('x-organization-id', workspace.organizationId).send({ content: 'Updated content' }).expect(200).expect(({ body }) => expect(body.content).toBe('Updated content'));
    await request(app.getHttpServer()).delete(`/api/projects/${project.id}/documents/${created.body.id}`).set('Authorization', `Bearer ${managerToken}`).set('x-organization-id', workspace.organizationId).expect(200);
    await request(app.getHttpServer()).get(`/api/projects/${project.id}/documents`).set('Authorization', `Bearer ${managerToken}`).set('x-organization-id', workspace.organizationId).expect(200).expect(({ body }) => expect(body).toHaveLength(0));
    const other = await createWorkspace('documents-other');
    await request(app.getHttpServer()).get(`/api/projects/${project.id}/documents/${created.body.id}`).set('Authorization', `Bearer ${await accessToken(other.userId, other.email)}`).set('x-organization-id', other.organizationId).expect(404);
  });

  it('manages bounded Risks with active owners and same-Project mitigation Tasks', async () => {
    const workspace = await createWorkspace('risks');
    const actor = { organizationId: workspace.organizationId, membershipId: workspace.membershipId };
    const project = await projects.create(actor, { name: 'Risk project' });
    const ownerOrganizationMembership = await createMember(workspace.organizationId, 'risk-owner');
    await teams.addMember(actor, workspace.generalTeamId, ownerOrganizationMembership.id);
    const owner = await participants.addMember(actor, project.id, ownerOrganizationMembership.id, ProjectRole.CONTRIBUTOR);
    const status = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId: project.id,
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
    });
    const token = await accessToken(workspace.userId, workspace.email);
    await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/risks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({
        title: 'Invalid likelihood',
        likelihoodCode: 'CRITICAL',
        impactCode: 'HIGH',
        ownerProjectMembershipId: owner.id,
      })
      .expect(400);
    const task = await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ owningTeamId: workspace.generalTeamId, statusId: status.id, title: 'Mitigate vendor dependency', priorityCode: 'HIGH' })
      .expect(201);
    const risk = await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/risks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({
        title: ' Vendor capacity ',
        likelihoodCode: 'MEDIUM',
        impactCode: 'HIGH',
        ownerProjectMembershipId: owner.id,
        mitigation: 'Secure an alternate vendor',
      })
      .expect(201);
    expect(risk.body).toEqual(expect.objectContaining({
      title: 'Vendor capacity',
      state: 'OPEN',
      ownerProjectMembershipId: owner.id,
    }));
    await expect(dataSource.getRepository(NotificationEntity).findOneByOrFail({
      organizationId: workspace.organizationId,
      recipientUserId: ownerOrganizationMembership.userId,
      resourceId: risk.body.id,
      typeCode: 'RISK_CREATED',
    })).resolves.toEqual(expect.objectContaining({ projectId: project.id }));
    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/risks/${risk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ state: 'RESOLVED' })
      .expect(200)
      .expect(({ body }) => expect(body.state).toBe('RESOLVED'));
    await expect(dataSource.getRepository(TaskEntity).findOneByOrFail({ id: task.body.id }))
      .resolves.toEqual(expect.objectContaining({ statusId: status.id }));
    await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/risks/${risk.body.id}/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(201);

    const otherProject = await projects.create(actor, { name: 'Other risk project' });
    const otherStatus = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({ projectId: otherProject.id });
    const otherTask = await request(app.getHttpServer())
      .post(`/api/projects/${otherProject.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ owningTeamId: workspace.generalTeamId, statusId: otherStatus.id, title: 'Other project task', priorityCode: 'LOW' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/risks/${risk.body.id}/tasks/${otherTask.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(404);

    await dataSource.getRepository(ProjectMembershipEntity).update(owner.id, { removedAt: new Date() });
    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/risks/${risk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ ownerProjectMembershipId: owner.id })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/projects/${project.id}/risks/${risk.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/risks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(0));

    const otherWorkspace = await createWorkspace('risks-other');
    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/risks`)
      .set('Authorization', `Bearer ${await accessToken(otherWorkspace.userId, otherWorkspace.email)}`)
      .set('x-organization-id', otherWorkspace.organizationId)
      .expect(404);
  });

  it('preserves optional-module history while disabled and restores mutations after re-enable', async () => {
    const workspace = await createWorkspace('module-gates');
    const actor = { organizationId: workspace.organizationId, membershipId: workspace.membershipId };
    const project = await projects.create(actor, { name: 'Module gate project' });
    const manager = await dataSource.getRepository(ProjectMembershipEntity).findOneByOrFail({
      projectId: project.id,
      organizationMembershipId: workspace.membershipId,
    });
    const token = await accessToken(workspace.userId, workspace.email);
    const milestone = await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/milestones`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ name: 'Initial milestone', dueDate: '2026-11-01' })
      .expect(201);
    const document = await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ title: 'Initial document', content: 'Retained history' })
      .expect(201);
    const risk = await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/risks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ title: 'Initial risk', likelihoodCode: 'LOW', impactCode: 'MEDIUM', ownerProjectMembershipId: manager.id })
      .expect(201);
    await expect(dataSource.getRepository(ActivityEntryEntity).find({ where: { projectId: project.id } }))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ actionCode: 'MILESTONE_CREATED', subjectId: milestone.body.id }),
        expect.objectContaining({ actionCode: 'DOCUMENT_CREATED', subjectId: document.body.id }),
        expect.objectContaining({ actionCode: 'RISK_CREATED', subjectId: risk.body.id }),
      ]));
    await expect(dataSource.getRepository(AuditLogEntity).find({ where: { projectId: project.id } }))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ actionCode: 'MILESTONE_CREATED', targetId: milestone.body.id, organizationId: workspace.organizationId }),
        expect.objectContaining({ actionCode: 'DOCUMENT_CREATED', targetId: document.body.id, organizationId: workspace.organizationId }),
        expect.objectContaining({ actionCode: 'RISK_CREATED', targetId: risk.body.id, organizationId: workspace.organizationId }),
      ]));

    for (const moduleCode of [ProjectModuleCode.MILESTONES, ProjectModuleCode.DOCUMENTS, ProjectModuleCode.RISKS]) {
      await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/modules`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-organization-id', workspace.organizationId)
        .send({ moduleCode, enabled: false })
        .expect(201);
    }
    await request(app.getHttpServer()).get(`/api/projects/${project.id}/milestones`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).expect(200).expect(({ body }) => expect(body).toHaveLength(1));
    await request(app.getHttpServer()).get(`/api/projects/${project.id}/documents`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).expect(200).expect(({ body }) => expect(body).toHaveLength(1));
    await request(app.getHttpServer()).get(`/api/projects/${project.id}/risks`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).expect(200).expect(({ body }) => expect(body).toHaveLength(1));
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/milestones/${milestone.body.id}`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ name: 'Blocked milestone' }).expect(409);
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/documents/${document.body.id}`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ content: 'Blocked document' }).expect(409);
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/risks/${risk.body.id}`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ state: 'MITIGATING' }).expect(409);

    for (const moduleCode of [ProjectModuleCode.MILESTONES, ProjectModuleCode.DOCUMENTS, ProjectModuleCode.RISKS]) {
      await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/modules`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-organization-id', workspace.organizationId)
        .send({ moduleCode, enabled: true })
        .expect(201);
    }
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/milestones/${milestone.body.id}`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ name: 'Re-enabled milestone' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/documents/${document.body.id}`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ content: 'Re-enabled document' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/risks/${risk.body.id}`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ state: 'MITIGATING' }).expect(200);
  });

  it('commits Risk mutations when optional notification delivery fails', async () => {
    const workspace = await createWorkspace('risk-notification-failure');
    const actor = { organizationId: workspace.organizationId, membershipId: workspace.membershipId };
    const project = await projects.create(actor, { name: 'Notification failure project' });
    const owner = await dataSource.getRepository(ProjectMembershipEntity).findOneByOrFail({
      projectId: project.id,
      organizationMembershipId: workspace.membershipId,
    });
    const notificationFailure = jest
      .spyOn(PostgresNotificationService.prototype, 'createForRecipient')
      .mockRejectedValueOnce(new Error('inbox unavailable'));
    try {
      const created = await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/risks`)
        .set('Authorization', `Bearer ${await accessToken(workspace.userId, workspace.email)}`)
        .set('x-organization-id', workspace.organizationId)
        .send({ title: 'Persist despite notification failure', likelihoodCode: 'LOW', impactCode: 'LOW', ownerProjectMembershipId: owner.id })
        .expect(201);
      await expect(dataSource.getRepository(ActivityEntryEntity).findOneByOrFail({
        organizationId: workspace.organizationId,
        projectId: project.id,
        subjectId: created.body.id,
        actionCode: 'RISK_CREATED',
      })).resolves.toBeTruthy();
    } finally {
      notificationFailure.mockRestore();
    }
  });

  it('rejects cross-tenant and non-participating Team Task creation', async () => {
    const first = await createWorkspace('first');
    const second = await createWorkspace('second');
    const firstProject = await projects.create(
      {
        organizationId: first.organizationId,
        membershipId: first.membershipId,
      },
      { name: 'First project' },
    );
    const secondProject = await projects.create(
      {
        organizationId: second.organizationId,
        membershipId: second.membershipId,
      },
      { name: 'Second project' },
    );
    const firstStatus = await dataSource
      .getRepository(ProjectTaskStatusEntity)
      .findOneByOrFail({ projectId: firstProject.id });
    const otherTeam = await teams.create(
      {
        organizationId: first.organizationId,
        membershipId: first.membershipId,
      },
      { name: 'Not participating' },
    );
    const token = await accessToken(first.userId, first.email);
    const payload = {
      owningTeamId: otherTeam.id,
      statusId: firstStatus.id,
      title: 'Scoped Task',
      priorityCode: 'LOW',
    };

    await request(app.getHttpServer())
      .post(`/api/projects/${firstProject.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', first.organizationId)
      .send(payload)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/projects/${secondProject.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', first.organizationId)
      .send({ ...payload, owningTeamId: first.generalTeamId })
      .expect(404);
  });

  it('enforces the active Project Member and owning-Team assignee intersection, and rolls back an invalid Team change', async () => {
    const workspace = await createWorkspace('assignment');
    const actor = {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
    const project = await projects.create(actor, {
      name: 'Assignment project',
    });
    const status = await dataSource
      .getRepository(ProjectTaskStatusEntity)
      .findOneByOrFail({
        projectId: project.id,
        semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
      });
    const assigneeOrganizationMembership = await createMember(
      workspace.organizationId,
      'assignee',
    );
    const alternateTeam = await teams.create(actor, { name: 'Alternate' });
    await participants.addTeam(actor, project.id, alternateTeam.id);
    const blockedTeam = await teams.create(actor, { name: 'Blocked' });
    await participants.addTeam(actor, project.id, blockedTeam.id);
    await teams.addMember(
      actor,
      alternateTeam.id,
      assigneeOrganizationMembership.id,
    );
    const assigneeProjectMembership = await participants.addMember(
      actor,
      project.id,
      assigneeOrganizationMembership.id,
      ProjectRole.CONTRIBUTOR,
    );
    const token = await accessToken(workspace.userId, workspace.email);
    const task = await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({
        owningTeamId: workspace.generalTeamId,
        statusId: status.id,
        title: 'Assigned Task',
        priorityCode: 'MEDIUM',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/tasks/${task.body.id}/assignees`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ projectMembershipId: assigneeProjectMembership.id })
      .expect(409);
    await teams.addMember(
      actor,
      workspace.generalTeamId,
      assigneeOrganizationMembership.id,
    );
    await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/tasks/${task.body.id}/assignees`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ projectMembershipId: assigneeProjectMembership.id })
      .expect(201);
    await expect(
      dataSource.getRepository(TaskAssigneeEntity).findOneByOrFail({
        taskId: task.body.id,
        projectMembershipId: assigneeProjectMembership.id,
      }),
    ).resolves.toEqual(expect.objectContaining({ removedAt: null }));
    const assigneeUser = await dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ id: assigneeOrganizationMembership.userId });
    const inProgress = await dataSource
      .getRepository(ProjectTaskStatusEntity)
      .findOneByOrFail({
        projectId: project.id,
        semanticCategory: TaskStatusSemanticCategory.IN_PROGRESS,
      });
    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${task.body.id}/status`)
      .set(
        'Authorization',
        `Bearer ${await accessToken(assigneeUser.id, assigneeUser.email)}`,
      )
      .set('x-organization-id', workspace.organizationId)
      .send({ statusId: inProgress.id })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ owningTeamId: blockedTeam.id })
      .expect(409);
    await expect(
      dataSource
        .getRepository(TaskEntity)
        .findOneByOrFail({ id: task.body.id }),
    ).resolves.toEqual(
      expect.objectContaining({ owningTeamId: workspace.generalTeamId }),
    );

    await request(app.getHttpServer())
      .delete(
        `/api/projects/${project.id}/tasks/${task.body.id}/assignees/${assigneeProjectMembership.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ owningTeamId: blockedTeam.id })
      .expect(200)
      .expect(({ body }) => expect(body.owningTeamId).toBe(blockedTeam.id));
  });

  it('enforces semantic status transitions and checklist-derived progress', async () => {
    const workspace = await createWorkspace('workflow');
    const actor = {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
    const project = await projects.create(actor, { name: 'Workflow project' });
    const statuses = await dataSource
      .getRepository(ProjectTaskStatusEntity)
      .findBy({ projectId: project.id });
    const notStarted = statusFor(
      statuses,
      TaskStatusSemanticCategory.NOT_STARTED,
    );
    const inProgress = statusFor(
      statuses,
      TaskStatusSemanticCategory.IN_PROGRESS,
    );
    const completed = statusFor(
      statuses,
      TaskStatusSemanticCategory.COMPLETED,
    );
    const token = await accessToken(workspace.userId, workspace.email);
    const task = await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({
        owningTeamId: workspace.generalTeamId,
        statusId: notStarted.id,
        title: 'Workflow Task',
        priorityCode: 'MEDIUM',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${task.body.id}/manual-progress`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ manualProgress: 101 })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${task.body.id}/manual-progress`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ manualProgress: 55 })
      .expect(200)
      .expect(({ body }) => expect(body.manualProgress).toBe(55));
    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${task.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ statusId: completed.id })
      .expect(409);
    const transitions = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/tasks/${task.body.id}/status`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-organization-id', workspace.organizationId)
          .send({ statusId: inProgress.id }),
      ),
    );
    expect(transitions.map((response) => response.status)).toEqual([200, 200]);
    await expect(
      dataSource.getRepository(TaskEntity).findOneByOrFail({ id: task.body.id }),
    ).resolves.toEqual(expect.objectContaining({ statusId: inProgress.id }));
    const item = await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/tasks/${task.body.id}/checklist-items`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ text: 'Verify release' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${task.body.id}/manual-progress`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ manualProgress: 80 })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${task.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ statusId: completed.id })
      .expect(409);
    await request(app.getHttpServer())
      .patch(
        `/api/projects/${project.id}/tasks/${task.body.id}/checklist-items/${item.body.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ completed: true })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${task.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ statusId: completed.id })
      .expect(200)
      .expect(({ body }) => {
        expect(body.statusId).toBe(completed.id);
        expect(body.manualProgress).toBe(100);
      });
    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/tasks/${task.body.id}/manual-progress`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ manualProgress: 75 })
      .expect(409);
  });

  it('scopes comment visibility and soft-delete to the Task Project', async () => {
    const workspace = await createWorkspace('comments');
    const other = await createWorkspace('comments-other');
    const actor = { organizationId: workspace.organizationId, membershipId: workspace.membershipId };
    const project = await projects.create(actor, { name: 'Comment project' });
    const status = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({ projectId: project.id });
    const token = await accessToken(workspace.userId, workspace.email);
    const task = await request(app.getHttpServer()).post(`/api/projects/${project.id}/tasks`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ owningTeamId: workspace.generalTeamId, statusId: status.id, title: 'Comment Task', priorityCode: 'LOW' }).expect(201);
    const comment = await request(app.getHttpServer()).post(`/api/projects/${project.id}/tasks/${task.body.id}/comments`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ body: ' First note ' }).expect(201);
    expect(comment.body.body).toBe('First note');
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/tasks/${task.body.id}/comments/${comment.body.id}`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ body: 'Edited note' }).expect(200);
    await request(app.getHttpServer()).get(`/api/projects/${project.id}/tasks/${task.body.id}/comments`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).expect(200).expect(({ body }) => expect(body).toHaveLength(1));
    const otherToken = await accessToken(other.userId, other.email);
    await request(app.getHttpServer()).get(`/api/projects/${project.id}/tasks/${task.body.id}/comments`).set('Authorization', `Bearer ${otherToken}`).set('x-organization-id', other.organizationId).expect(403);
    await request(app.getHttpServer()).delete(`/api/projects/${project.id}/tasks/${task.body.id}/comments/${comment.body.id}`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).expect(200);
    await request(app.getHttpServer()).get(`/api/projects/${project.id}/tasks/${task.body.id}/comments`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).expect(200).expect(({ body }) => expect(body).toHaveLength(0));
  });

  it('serializes competing approval terminal actions without overwriting history', async () => {
    const workspace = await createWorkspace('approval');
    const actor = { organizationId: workspace.organizationId, membershipId: workspace.membershipId };
    const project = await projects.create(actor, { name: 'Approval project' });
    const status = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({ projectId: project.id });
    const approverMembership = await createMember(workspace.organizationId, 'approver');
    await teams.addMember(actor, workspace.generalTeamId, approverMembership.id);
    const approverProjectMembership = await participants.addMember(actor, project.id, approverMembership.id, ProjectRole.CONTRIBUTOR);
    const token = await accessToken(workspace.userId, workspace.email);
    const task = await request(app.getHttpServer()).post(`/api/projects/${project.id}/tasks`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ owningTeamId: workspace.generalTeamId, statusId: status.id, title: 'Approval Task', priorityCode: 'HIGH' }).expect(201);
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/tasks/${task.body.id}/approval`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ approverProjectMembershipId: approverProjectMembership.id }).expect(200);
    const inProgress = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({ projectId: project.id, semanticCategory: TaskStatusSemanticCategory.IN_PROGRESS });
    const completed = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({ projectId: project.id, semanticCategory: TaskStatusSemanticCategory.COMPLETED });
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/tasks/${task.body.id}/status`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ statusId: inProgress.id }).expect(200);
    await request(app.getHttpServer()).patch(`/api/projects/${project.id}/tasks/${task.body.id}/status`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({ statusId: completed.id }).expect(409);
    await request(app.getHttpServer()).post(`/api/projects/${project.id}/tasks/${task.body.id}/approval-requests`).set('Authorization', `Bearer ${token}`).set('x-organization-id', workspace.organizationId).send({}).expect(201);
    const approver = await dataSource.getRepository(UserEntity).findOneByOrFail({ id: approverMembership.userId });
    const approverToken = await accessToken(approver.id, approver.email);
    const outcomes = await Promise.all(['approve', 'reject'].map((action) => request(app.getHttpServer()).post(`/api/projects/${project.id}/tasks/${task.body.id}/approval-requests/${action}`).set('Authorization', `Bearer ${approverToken}`).set('x-organization-id', workspace.organizationId).send({ reason: 'not accepted' })));
    expect(outcomes.map((item) => item.status).sort()).toEqual([201, 409]);
    const rows = await dataSource.query('SELECT state FROM task_approval_requests WHERE task_id = $1', [task.body.id]);
    expect(rows).toHaveLength(1);
    expect(['APPROVED', 'REJECTED']).toContain(rows[0].state);
  });

  async function createWorkspace(prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: 'test-only-password-hash',
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
    const workspace = await onboarding.createOrganization(user.id, {
      name: `${prefix} workspace`,
    });
    return { ...workspace, userId: user.id, email: user.email };
  }

  async function createMember(organizationId: string, prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: 'test-only-password-hash',
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
    return dataSource.getRepository(OrganizationMembershipEntity).save({
      organizationId,
      userId: user.id,
      role: OrganizationRole.MEMBER,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date(),
      stateChangedAt: new Date(),
    });
  }

  function accessToken(userId: string, email: string) {
    return jwt.signAsync(
      { sub: userId, email },
      { secret: 'local-test-access-secret' },
    );
  }

  function statusFor(
    statuses: ProjectTaskStatusEntity[],
    semanticCategory: TaskStatusSemanticCategory,
  ) {
    const status = statuses.find(
      (item) => item.semanticCategory === semanticCategory,
    );
    if (!status) throw new Error(`Missing ${semanticCategory} test status`);
    return status;
  }
});
