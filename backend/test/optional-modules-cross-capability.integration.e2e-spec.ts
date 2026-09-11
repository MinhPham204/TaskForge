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
  ProjectMembershipEntity,
  ProjectModuleCode,
  ProjectRole,
  ProjectTaskStatusEntity,
  TaskStatusSemanticCategory,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresTeamService } from '../src/modules/projects/application/team.service';
import { PostgresTaskService } from '../src/modules/task/application/task.service';
import { TaskEntity } from '../src/modules/task/persistence/typeorm/task.entities';
import {
  ActivityEntryEntity,
  AuditLogEntity,
} from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';
import {
  MilestoneStatusCode,
  RiskEntity,
  RiskScaleCode,
  RiskState,
} from '../src/modules/projects/persistence/typeorm/optional-module.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Optional Modules Cross-Capability Regression (P6-09)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let participants: PostgresProjectParticipantService;
  let modules: PostgresProjectModuleService;
  let teams: PostgresTeamService;
  let tasks: PostgresTaskService;
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
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  });

  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(`
      TRUNCATE TABLE notifications, audit_logs, activity_entries, risk_task_links,
        risks, documents, project_files, milestones,
        task_attachments, stored_files, comments, task_approval_requests,
        task_checklist_items, task_assignees, tasks, project_module_settings,
        project_task_statuses, project_memberships, project_teams, team_members,
        organization_invitations, organization_memberships, teams, organizations,
        users RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  function accessToken(userId: string, email: string) {
    return jwt.signAsync(
      { sub: userId, email },
      { secret: 'local-test-access-secret' },
    );
  }

  async function createWorkspace(prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}-${Date.now()}@example.test`,
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
      email: `${prefix}-${sequence}-${Date.now()}@example.test`,
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

  it('enforces strict cross-tenant and same-project isolation for Milestones, Documents, and Risks', async () => {
    // 1. Create Organization A & B
    const wsA = await createWorkspace('tenant-a');
    const wsB = await createWorkspace('tenant-b');

    const actorA = { organizationId: wsA.organizationId, membershipId: wsA.membershipId };
    const actorB = { organizationId: wsB.organizationId, membershipId: wsB.membershipId };

    const projectA1 = await projects.create(actorA, { name: 'Project A1' });
    const projectA2 = await projects.create(actorA, { name: 'Project A2' });
    const projectB = await projects.create(actorB, { name: 'Project B' });

    const tokenA = await accessToken(wsA.userId, wsA.email);
    const tokenB = await accessToken(wsB.userId, wsB.email);

    // Create a milestone in Project A1
    const msRes = await request(httpServer)
      .post(`/api/projects/${projectA1.id}/milestones`)
      .set('authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', wsA.organizationId)
      .send({ name: 'Sprint 1 Milestone', dueDate: '2026-12-01' })
      .expect(201);
    const milestoneA1Id = msRes.body.id;

    // Create a document in Project A1
    const docRes = await request(httpServer)
      .post(`/api/projects/${projectA1.id}/documents`)
      .set('authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', wsA.organizationId)
      .send({ title: 'Architecture RFC', content: 'Details here' })
      .expect(201);
    const docA1Id = docRes.body.id;

    // Get Project A1 manager membership
    const managerA1 = await dataSource.getRepository(ProjectMembershipEntity).findOneByOrFail({
      projectId: projectA1.id,
      organizationMembershipId: wsA.membershipId,
    });

    // Create a risk in Project A1
    const riskRes = await request(httpServer)
      .post(`/api/projects/${projectA1.id}/risks`)
      .set('authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', wsA.organizationId)
      .send({
        title: 'Timeline Slippage',
        likelihoodCode: RiskScaleCode.HIGH,
        impactCode: RiskScaleCode.HIGH,
        ownerProjectMembershipId: managerA1.id,
        mitigation: 'Add buffer time',
      })
      .expect(201);
    const riskA1Id = riskRes.body.id;

    // --- Cross-Tenant Rejection (User B attempting to access Project A1 resources) ---
    await request(httpServer)
      .get(`/api/projects/${projectA1.id}/milestones`)
      .set('authorization', `Bearer ${tokenB}`)
      .set('x-organization-id', wsB.organizationId)
      .expect(404);

    await request(httpServer)
      .post(`/api/projects/${projectA1.id}/milestones`)
      .set('authorization', `Bearer ${tokenB}`)
      .set('x-organization-id', wsB.organizationId)
      .send({ name: 'Hacked Milestone', dueDate: '2026-12-01' })
      .expect(404);

    await request(httpServer)
      .get(`/api/projects/${projectA1.id}/documents`)
      .set('authorization', `Bearer ${tokenB}`)
      .set('x-organization-id', wsB.organizationId)
      .expect(404);

    await request(httpServer)
      .get(`/api/projects/${projectA1.id}/documents/${docA1Id}`)
      .set('authorization', `Bearer ${tokenB}`)
      .set('x-organization-id', wsB.organizationId)
      .expect(404);

    await request(httpServer)
      .get(`/api/projects/${projectA1.id}/risks`)
      .set('authorization', `Bearer ${tokenB}`)
      .set('x-organization-id', wsB.organizationId)
      .expect(404);

    // --- Same-Tenant Cross-Project Constraint Violations ---
    // 1. Task in Project A1 CANNOT link to Milestone in Project A2
    const msA2Res = await request(httpServer)
      .post(`/api/projects/${projectA2.id}/milestones`)
      .set('authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', wsA.organizationId)
      .send({ name: 'Project A2 Milestone', dueDate: '2026-12-01' })
      .expect(201);
    const milestoneA2Id = msA2Res.body.id;

    const statusA1 = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId: projectA1.id,
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
    });

    // Attempting to create Task in Project A1 referencing Milestone in Project A2 must fail
    await request(httpServer)
      .post(`/api/projects/${projectA1.id}/tasks`)
      .set('authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', wsA.organizationId)
      .send({
        owningTeamId: wsA.generalTeamId,
        statusId: statusA1.id,
        title: 'Task linking cross-project milestone',
        priorityCode: 'MEDIUM',
        milestoneId: milestoneA2Id,
      })
      .expect(404);

    // 2. Risk in Project A1 CANNOT link to Task in Project A2
    const statusA2 = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId: projectA2.id,
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
    });
    const taskA2 = await tasks.create(actorA, projectA2.id, {
      owningTeamId: wsA.generalTeamId,
      statusId: statusA2.id,
      title: 'Task in Project A2',
      description: '',
      priorityCode: 'LOW',
    });

    await request(httpServer)
      .post(`/api/projects/${projectA1.id}/risks/${riskA1Id}/tasks/${taskA2.id}`)
      .set('authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', wsA.organizationId)
      .expect(404);

    // 3. Risk in Project A1 CANNOT be assigned to a project member of Project A2
    const memberOrgMembership = await createMember(wsA.organizationId, 'member-a');
    await teams.addMember(actorA, wsA.generalTeamId, memberOrgMembership.id);
    const memberA2 = await participants.addMember(actorA, projectA2.id, memberOrgMembership.id, ProjectRole.CONTRIBUTOR);

    await request(httpServer)
      .post(`/api/projects/${projectA1.id}/risks`)
      .set('authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', wsA.organizationId)
      .send({
        title: 'Cross-project owner risk',
        likelihoodCode: RiskScaleCode.LOW,
        impactCode: RiskScaleCode.LOW,
        ownerProjectMembershipId: memberA2.id, // Member from A2, not A1!
      })
      .expect(409);
  });

  it('guarantees module-toggle semantics across all 4 modules (Milestones, Documents, Risks, Files): preserves data, blocks mutations with 409, and restores cleanly on re-enable', async () => {
    const ws = await createWorkspace('module-toggle');
    const actor = { organizationId: ws.organizationId, membershipId: ws.membershipId };
    const project = await projects.create(actor, { name: 'Full Toggle Project' });
    const token = await accessToken(ws.userId, ws.email);

    const manager = await dataSource.getRepository(ProjectMembershipEntity).findOneByOrFail({
      projectId: project.id,
      organizationMembershipId: ws.membershipId,
    });
    const status = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId: project.id,
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
    });
    const task = await tasks.create(actor, project.id, {
      owningTeamId: ws.generalTeamId,
      statusId: status.id,
      title: 'Mitigation Task',
      description: '',
      priorityCode: 'MEDIUM',
    });

    // 1. Initial creations across all 4 modules
    const msRes = await request(httpServer)
      .post(`/api/projects/${project.id}/milestones`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ name: 'Alpha Release', dueDate: '2026-10-01' })
      .expect(201);
    const milestoneId = msRes.body.id;

    const docRes = await request(httpServer)
      .post(`/api/projects/${project.id}/documents`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ title: 'System Overview', content: 'Architecture draft' })
      .expect(201);
    const docId = docRes.body.id;

    const riskRes = await request(httpServer)
      .post(`/api/projects/${project.id}/risks`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({
        title: 'Dependency Outage',
        likelihoodCode: RiskScaleCode.LOW,
        impactCode: RiskScaleCode.MEDIUM,
        ownerProjectMembershipId: manager.id,
      })
      .expect(201);
    const riskId = riskRes.body.id;

    const fileRes = await request(httpServer)
      .post(`/api/projects/${project.id}/files`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .field('displayName', 'Project Architecture Diagram')
      .attach('file', Buffer.from('mock-file-content'), 'arch.png')
      .expect(201);
    const fileId = fileRes.body.id;

    // 2. Disable all four modules
    for (const mod of [
      ProjectModuleCode.MILESTONES,
      ProjectModuleCode.DOCUMENTS,
      ProjectModuleCode.RISKS,
      ProjectModuleCode.FILES,
    ]) {
      await request(httpServer)
        .post(`/api/projects/${project.id}/modules`)
        .set('authorization', `Bearer ${token}`)
        .set('x-organization-id', ws.organizationId)
        .send({ moduleCode: mod, enabled: false })
        .expect(201);
    }

    // 3. Verify READ works and returns existing data for all 4 modules while disabled
    await request(httpServer)
      .get(`/api/projects/${project.id}/milestones`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));

    await request(httpServer)
      .get(`/api/projects/${project.id}/documents`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));

    await request(httpServer)
      .get(`/api/projects/${project.id}/documents/${docId}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(200)
      .expect(({ body }) => expect(body.title).toBe('System Overview'));

    await request(httpServer)
      .get(`/api/projects/${project.id}/risks`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));

    await request(httpServer)
      .get(`/api/projects/${project.id}/files`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));

    // 4. Verify MUTATIONS return 409 Conflict for all 4 modules while disabled
    // Milestone mutations blocked
    await request(httpServer)
      .post(`/api/projects/${project.id}/milestones`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ name: 'Blocked Milestone', dueDate: '2026-10-02' })
      .expect(409);

    await request(httpServer)
      .patch(`/api/projects/${project.id}/milestones/${milestoneId}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ name: 'Blocked Rename' })
      .expect(409);

    await request(httpServer)
      .post(`/api/projects/${project.id}/milestones/${milestoneId}/close`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(409);

    // Document mutations blocked
    await request(httpServer)
      .post(`/api/projects/${project.id}/documents`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ title: 'Blocked Doc', content: 'Blocked' })
      .expect(409);

    await request(httpServer)
      .patch(`/api/projects/${project.id}/documents/${docId}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ title: 'Blocked Doc Update' })
      .expect(409);

    await request(httpServer)
      .delete(`/api/projects/${project.id}/documents/${docId}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(409);

    // Risk mutations blocked
    await request(httpServer)
      .post(`/api/projects/${project.id}/risks`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({
        title: 'Blocked Risk',
        likelihoodCode: RiskScaleCode.LOW,
        impactCode: RiskScaleCode.LOW,
        ownerProjectMembershipId: manager.id,
      })
      .expect(409);

    await request(httpServer)
      .patch(`/api/projects/${project.id}/risks/${riskId}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ state: RiskState.MITIGATING })
      .expect(409);

    await request(httpServer)
      .post(`/api/projects/${project.id}/risks/${riskId}/tasks/${task.id}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(409);

    await request(httpServer)
      .delete(`/api/projects/${project.id}/risks/${riskId}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(409);

    // Files upload blocked when module disabled
    await request(httpServer)
      .post(`/api/projects/${project.id}/files`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .field('displayName', 'Blocked Upload')
      .attach('file', Buffer.from('blocked'), 'test.txt')
      .expect(409);

    // 5. Re-enable all 4 modules
    for (const mod of [
      ProjectModuleCode.MILESTONES,
      ProjectModuleCode.DOCUMENTS,
      ProjectModuleCode.RISKS,
      ProjectModuleCode.FILES,
    ]) {
      await request(httpServer)
        .post(`/api/projects/${project.id}/modules`)
        .set('authorization', `Bearer ${token}`)
        .set('x-organization-id', ws.organizationId)
        .send({ moduleCode: mod, enabled: true })
        .expect(201);
    }

    // 6. Verify mutations succeed cleanly again without data recreation
    await request(httpServer)
      .patch(`/api/projects/${project.id}/milestones/${milestoneId}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ name: 'Alpha Release v2' })
      .expect(200)
      .expect(({ body }) => expect(body.name).toBe('Alpha Release v2'));

    await request(httpServer)
      .patch(`/api/projects/${project.id}/documents/${docId}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ title: 'System Overview Final' })
      .expect(200)
      .expect(({ body }) => expect(body.title).toBe('System Overview Final'));

    await request(httpServer)
      .patch(`/api/projects/${project.id}/risks/${riskId}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ state: RiskState.MITIGATING })
      .expect(200)
      .expect(({ body }) => expect(body.state).toBe(RiskState.MITIGATING));

    await request(httpServer)
      .post(`/api/projects/${project.id}/risks/${riskId}/tasks/${task.id}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(201);

    await request(httpServer)
      .post(`/api/projects/${project.id}/files`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .field('displayName', 'Restored Upload')
      .attach('file', Buffer.from('restored-content'), 'restored.txt')
      .expect(201);

    await request(httpServer)
      .delete(`/api/projects/${project.id}/files/${fileId}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(200);
  });

  it('enforces independent lifecycle invariant: task completion does not close milestones, risk resolution does not transition tasks', async () => {
    const ws = await createWorkspace('lifecycle-invariant');
    const actor = { organizationId: ws.organizationId, membershipId: ws.membershipId };
    const project = await projects.create(actor, { name: 'Lifecycle Invariant Project' });
    const token = await accessToken(ws.userId, ws.email);

    const manager = await dataSource.getRepository(ProjectMembershipEntity).findOneByOrFail({
      projectId: project.id,
      organizationMembershipId: ws.membershipId,
    });

    const notStartedStatus = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId: project.id,
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
    });
    const inProgressStatus = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId: project.id,
      semanticCategory: TaskStatusSemanticCategory.IN_PROGRESS,
    });
    const doneStatus = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({
      projectId: project.id,
      semanticCategory: TaskStatusSemanticCategory.COMPLETED,
    });

    // 1. Milestone & Task Independence
    const msRes = await request(httpServer)
      .post(`/api/projects/${project.id}/milestones`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ name: 'Beta Milestone', dueDate: '2026-11-15' })
      .expect(201);
    const milestoneId = msRes.body.id;

    // Create two tasks linked to milestone
    const task1 = await tasks.create(actor, project.id, {
      owningTeamId: ws.generalTeamId,
      statusId: notStartedStatus.id,
      title: 'Backend API implementation',
      description: '',
      priorityCode: 'HIGH',
      milestoneId,
    });

    const task2 = await tasks.create(actor, project.id, {
      owningTeamId: ws.generalTeamId,
      statusId: notStartedStatus.id,
      title: 'Frontend integration',
      description: '',
      priorityCode: 'HIGH',
      milestoneId,
    });

    // Check initial aggregate: 0/2 completed (0%)
    let listRes = await request(httpServer)
      .get(`/api/projects/${project.id}/milestones`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(200);
    expect(listRes.body[0].progress).toEqual(
      expect.objectContaining({ taskCount: 2, percent: 0 }),
    );
    expect(listRes.body[0].statusCode).toBe(MilestoneStatusCode.OPEN);

    // Complete task 1 (NOT_STARTED -> IN_PROGRESS -> COMPLETED)
    await tasks.transitionStatus(actor, project.id, task1.id, inProgressStatus.id);
    await tasks.transitionStatus(actor, project.id, task1.id, doneStatus.id);

    // Check aggregate: 1/2 completed (50%), milestone is still OPEN
    listRes = await request(httpServer)
      .get(`/api/projects/${project.id}/milestones`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(200);
    expect(listRes.body[0].progress).toEqual(
      expect.objectContaining({ taskCount: 2, percent: 50 }),
    );
    expect(listRes.body[0].statusCode).toBe(MilestoneStatusCode.OPEN);

    // Complete task 2 (ALL linked tasks are now COMPLETED with 100% progress)
    await tasks.transitionStatus(actor, project.id, task2.id, inProgressStatus.id);
    await tasks.transitionStatus(actor, project.id, task2.id, doneStatus.id);

    // INVARIANT: Milestone status MUST remain OPEN despite 100% completion!
    listRes = await request(httpServer)
      .get(`/api/projects/${project.id}/milestones`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(200);
    expect(listRes.body[0].progress).toEqual(
      expect.objectContaining({ taskCount: 2, percent: 100 }),
    );
    expect(listRes.body[0].statusCode).toBe(MilestoneStatusCode.OPEN);

    // Close milestone EXPLICITLY
    await request(httpServer)
      .post(`/api/projects/${project.id}/milestones/${milestoneId}/close`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(201)
      .expect(({ body }) => expect(body.statusCode).toBe(MilestoneStatusCode.CLOSED));

    // Reopen milestone explicitly
    await request(httpServer)
      .post(`/api/projects/${project.id}/milestones/${milestoneId}/reopen`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(201)
      .expect(({ body }) => expect(body.statusCode).toBe(MilestoneStatusCode.OPEN));

    // 2. Risk & Task Independence
    const mitigationTask = await tasks.create(actor, project.id, {
      owningTeamId: ws.generalTeamId,
      statusId: notStartedStatus.id,
      title: 'Active Mitigation Task',
      description: '',
      priorityCode: 'URGENT',
    });

    const riskRes = await request(httpServer)
      .post(`/api/projects/${project.id}/risks`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({
        title: 'Database connection pool starvation',
        likelihoodCode: RiskScaleCode.HIGH,
        impactCode: RiskScaleCode.HIGH,
        ownerProjectMembershipId: manager.id,
      })
      .expect(201);
    const riskId = riskRes.body.id;

    // Link task to risk
    await request(httpServer)
      .post(`/api/projects/${project.id}/risks/${riskId}/tasks/${mitigationTask.id}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .expect(201);

    // Resolve the risk
    await request(httpServer)
      .patch(`/api/projects/${project.id}/risks/${riskId}`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ state: RiskState.RESOLVED })
      .expect(200)
      .expect(({ body }) => expect(body.state).toBe(RiskState.RESOLVED));

    // INVARIANT: Linked task MUST remain in NOT_STARTED! Resolving risk does not transition task!
    const unchangedTask = await dataSource.getRepository(TaskEntity).findOneByOrFail({ id: mitigationTask.id });
    expect(unchangedTask.statusId).toBe(notStartedStatus.id);

    // Complete the mitigation task (NOT_STARTED -> IN_PROGRESS -> COMPLETED)
    await tasks.transitionStatus(actor, project.id, mitigationTask.id, inProgressStatus.id);
    await tasks.transitionStatus(actor, project.id, mitigationTask.id, doneStatus.id);

    // INVARIANT: Risk MUST remain in RESOLVED! Completing task does not alter risk!
    const riskDb = await dataSource.getRepository(RiskEntity).findOneByOrFail({ id: riskId });
    expect(riskDb.state).toBe(RiskState.RESOLVED);
  });

  it('records Activity and Audit logs correctly for optional-module events', async () => {
    const ws = await createWorkspace('audit-activity');
    const actor = { organizationId: ws.organizationId, membershipId: ws.membershipId };
    const project = await projects.create(actor, { name: 'Audit Activity Project' });
    const token = await accessToken(ws.userId, ws.email);

    const manager = await dataSource.getRepository(ProjectMembershipEntity).findOneByOrFail({
      projectId: project.id,
      organizationMembershipId: ws.membershipId,
    });

    const ms = await request(httpServer)
      .post(`/api/projects/${project.id}/milestones`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ name: 'Audit Milestone', dueDate: '2026-12-31' })
      .expect(201);

    const doc = await request(httpServer)
      .post(`/api/projects/${project.id}/documents`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({ title: 'Audit Document', content: 'Logged' })
      .expect(201);

    const risk = await request(httpServer)
      .post(`/api/projects/${project.id}/risks`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', ws.organizationId)
      .send({
        title: 'Audit Risk',
        likelihoodCode: RiskScaleCode.LOW,
        impactCode: RiskScaleCode.LOW,
        ownerProjectMembershipId: manager.id,
      })
      .expect(201);

    // Verify Activity entries
    const activities = await dataSource.getRepository(ActivityEntryEntity).find({
      where: { projectId: project.id },
    });
    const actionCodes = activities.map((a) => a.actionCode);
    expect(actionCodes).toContain('MILESTONE_CREATED');
    expect(actionCodes).toContain('DOCUMENT_CREATED');
    expect(actionCodes).toContain('RISK_CREATED');

    // Verify Audit log entries
    const audits = await dataSource.getRepository(AuditLogEntity).find({
      where: { projectId: project.id },
    });
    const auditActions = audits.map((a) => a.actionCode);
    expect(auditActions).toContain('MILESTONE_CREATED');
    expect(auditActions).toContain('DOCUMENT_CREATED');
    expect(auditActions).toContain('RISK_CREATED');
  });
});
