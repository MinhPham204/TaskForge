import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { createPostgresDataSourceOptions } from '../data-source.options';
import {
  OrganizationEntity,
  OrganizationMembershipEntity,
  OrganizationRole,
  OrganizationMembershipState,
  TeamEntity,
  TeamMemberEntity,
  UserEntity,
} from '../../modules/onboarding/persistence/typeorm/onboarding.entities';
import {
  ProjectEntity,
  ProjectMembershipEntity,
  ProjectModuleCode,
  ProjectModuleSettingEntity,
  ProjectRole,
  ProjectState,
  ProjectTaskStatusEntity,
  ProjectTeamEntity,
  TaskStatusSemanticCategory,
} from '../../modules/projects/persistence/typeorm/project.entities';
import {
  DocumentEntity,
  MilestoneEntity,
  MilestoneStatusCode,
  RiskEntity,
  RiskScaleCode,
  RiskState,
} from '../../modules/projects/persistence/typeorm/optional-module.entities';
import {
  ApprovalRequestEntity,
  ApprovalRequestState,
  CommentEntity,
  TaskAssigneeEntity,
  TaskChecklistItemEntity,
  TaskEntity,
} from '../../modules/task/persistence/typeorm/task.entities';
import {
  ActivityEntryEntity,
  NotificationEntity,
} from '../../modules/collaboration/persistence/typeorm/collaboration.entities';

export interface SeedOptions {
  confirmSeed?: boolean;
  log?: (message: string) => void;
}

export async function runPortfolioSeed(
  dataSource: DataSource,
  options: SeedOptions = {},
) {
  const log = options.log || console.log;

  // Safeguard: explicitly require confirmation to avoid running on non-disposable targets
  const isExplicit =
    options.confirmSeed === true ||
    process.env.ALLOW_DEMO_SEED === 'true' ||
    process.argv.includes('--confirm-seed');

  if (!isExplicit) {
    throw new Error(
      '[Seed Safeguard] Refusing to seed database without explicit confirmation. Pass --confirm-seed or set ALLOW_DEMO_SEED=true to seed this target.',
    );
  }

  // Production safeguard: require extra confirmation if NODE_ENV=production
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_PRODUCTION_DEMO_SEED !== 'true'
  ) {
    throw new Error(
      '[Seed Safeguard] Target is configured as production. Refusing to seed unless ALLOW_PRODUCTION_DEMO_SEED=true is explicitly set.',
    );
  }

  log(
    '🌱 Starting deterministic portfolio seed for TaskForge PostgreSQL runtime...',
  );

  // 1. Clean up existing demo organization if present (idempotent re-run)
  const existingOrg = await dataSource
    .getRepository(OrganizationEntity)
    .findOne({
      where: { name: 'Acme Cloud Technologies' },
    });

  if (existingOrg) {
    log(
      `🧹 Removing existing demo organization ${existingOrg.id} for clean re-seed...`,
    );
    const orgId = existingOrg.id;

    await dataSource.transaction(async (manager) => {
      await manager.delete(NotificationEntity, { organizationId: orgId });
      await manager.delete(ActivityEntryEntity, { organizationId: orgId });
      await manager.delete(CommentEntity, { organizationId: orgId });
      await manager.delete(ApprovalRequestEntity, { organizationId: orgId });
      await manager.delete(TaskAssigneeEntity, { organizationId: orgId });
      await manager.delete(TaskChecklistItemEntity, { organizationId: orgId });
      await manager.delete(TaskEntity, { organizationId: orgId });
      await manager.delete(RiskEntity, { organizationId: orgId });
      await manager.delete(DocumentEntity, { organizationId: orgId });
      await manager.delete(MilestoneEntity, { organizationId: orgId });
      await manager.delete(ProjectModuleSettingEntity, {
        organizationId: orgId,
      });
      await manager.delete(ProjectTaskStatusEntity, { organizationId: orgId });
      await manager.delete(ProjectMembershipEntity, { organizationId: orgId });
      await manager.delete(ProjectTeamEntity, { organizationId: orgId });
      await manager.delete(ProjectEntity, { organizationId: orgId });
      await manager.delete(TeamMemberEntity, { organizationId: orgId });
      await manager.delete(TeamEntity, { organizationId: orgId });
      await manager.delete(OrganizationMembershipEntity, {
        organizationId: orgId,
      });
      await manager.delete(OrganizationEntity, { id: orgId });
    });
  }

  // 2. Seed Users
  log('👤 Creating deterministic demo user accounts...');
  const userRepo = dataSource.getRepository(UserEntity);
  const passwordHash = bcrypt.hashSync('Password123!', 10);
  const verifiedDate = new Date('2026-01-01T00:00:00Z');

  const demoUsersSpec = [
    { email: 'owner@taskforge.dev', name: 'Alex Morgan' },
    { email: 'pm@taskforge.dev', name: 'Taylor Swift' },
    { email: 'dev@taskforge.dev', name: 'Jordan Lee' },
    { email: 'designer@taskforge.dev', name: 'Morgan Chen' },
  ];

  const userMap = new Map<string, UserEntity>();

  for (const spec of demoUsersSpec) {
    let user = await userRepo.findOne({ where: { email: spec.email } });
    if (!user) {
      user = userRepo.create({
        email: spec.email,
        name: spec.name,
        passwordHash,
        emailVerifiedAt: verifiedDate,
      });
      user = await userRepo.save(user);
    } else {
      user.passwordHash = passwordHash;
      user.emailVerifiedAt = verifiedDate;
      user = await userRepo.save(user);
    }
    userMap.set(spec.email, user);
  }

  const ownerUser = userMap.get('owner@taskforge.dev')!;
  const pmUser = userMap.get('pm@taskforge.dev')!;
  const devUser = userMap.get('dev@taskforge.dev')!;
  const designerUser = userMap.get('designer@taskforge.dev')!;

  // 3. Seed Organization
  log('🏢 Creating demo Organization...');
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const organization = await orgRepo.save(
    orgRepo.create({
      name: 'Acme Cloud Technologies',
      logoUrl:
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&auto=format&fit=crop&q=80',
    }),
  );

  // 4. Seed Organization Memberships
  log('👥 Establishing workspace memberships...');
  const memberRepo = dataSource.getRepository(OrganizationMembershipEntity);

  const ownerMembership = await memberRepo.save(
    memberRepo.create({
      organizationId: organization.id,
      userId: ownerUser.id,
      role: OrganizationRole.OWNER,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date('2026-01-01T00:00:00Z'),
    }),
  );

  const pmMembership = await memberRepo.save(
    memberRepo.create({
      organizationId: organization.id,
      userId: pmUser.id,
      role: OrganizationRole.ADMIN,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date('2026-01-05T00:00:00Z'),
    }),
  );

  const devMembership = await memberRepo.save(
    memberRepo.create({
      organizationId: organization.id,
      userId: devUser.id,
      role: OrganizationRole.MEMBER,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date('2026-01-10T00:00:00Z'),
    }),
  );

  const designerMembership = await memberRepo.save(
    memberRepo.create({
      organizationId: organization.id,
      userId: designerUser.id,
      role: OrganizationRole.MEMBER,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date('2026-01-15T00:00:00Z'),
    }),
  );

  // 5. Seed Teams
  log('🛡️ Creating workspace teams...');
  const teamRepo = dataSource.getRepository(TeamEntity);
  const teamMemberRepo = dataSource.getRepository(TeamMemberEntity);

  const generalTeam = await teamRepo.save(
    teamRepo.create({
      organizationId: organization.id,
      name: 'General',
      description: 'Default organization-wide collaboration channel.',
    }),
  );

  const engineeringTeam = await teamRepo.save(
    teamRepo.create({
      organizationId: organization.id,
      name: 'Core Platform Engineering',
      description:
        'Backend architecture, infrastructure, database, and reliability.',
    }),
  );

  const productTeam = await teamRepo.save(
    teamRepo.create({
      organizationId: organization.id,
      name: 'Product & Design',
      description: 'UI/UX design systems, workflows, and frontend experience.',
    }),
  );

  // Team associations
  for (const m of [
    ownerMembership,
    pmMembership,
    devMembership,
    designerMembership,
  ]) {
    await teamMemberRepo.save(
      teamMemberRepo.create({
        organizationId: organization.id,
        teamId: generalTeam.id,
        organizationMembershipId: m.id,
        joinedAt: new Date('2026-01-15T00:00:00Z'),
      }),
    );
  }

  for (const m of [ownerMembership, pmMembership, devMembership]) {
    await teamMemberRepo.save(
      teamMemberRepo.create({
        organizationId: organization.id,
        teamId: engineeringTeam.id,
        organizationMembershipId: m.id,
        joinedAt: new Date('2026-01-15T00:00:00Z'),
      }),
    );
  }

  for (const m of [pmMembership, designerMembership]) {
    await teamMemberRepo.save(
      teamMemberRepo.create({
        organizationId: organization.id,
        teamId: productTeam.id,
        organizationMembershipId: m.id,
        joinedAt: new Date('2026-01-15T00:00:00Z'),
      }),
    );
  }

  // 6. Seed Project
  log('📁 Creating Project: TaskForge Multi-tenant SaaS v0.3...');
  const projectRepo = dataSource.getRepository(ProjectEntity);
  const project = await projectRepo.save(
    projectRepo.create({
      organizationId: organization.id,
      name: 'TaskForge Multi-tenant SaaS v0.3',
      description:
        'Enterprise task and workspace management platform with PostgreSQL persistence, TypeORM migrations, strict tenant isolation, customizable workflows, approval queues, and collaboration tools.',
      state: ProjectState.ACTIVE,
      startDate: '2026-08-01',
      dueDate: '2026-11-30',
      createdByMembershipId: ownerMembership.id,
    }),
  );

  // Project Teams
  const projectTeamRepo = dataSource.getRepository(ProjectTeamEntity);
  await projectTeamRepo.save(
    projectTeamRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      teamId: engineeringTeam.id,
      addedByMembershipId: ownerMembership.id,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );
  await projectTeamRepo.save(
    projectTeamRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      teamId: productTeam.id,
      addedByMembershipId: ownerMembership.id,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );

  // Project Memberships
  const projectMemberRepo = dataSource.getRepository(ProjectMembershipEntity);
  const ownerProjectMember = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      organizationMembershipId: ownerMembership.id,
      role: ProjectRole.PROJECT_MANAGER,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );

  const pmProjectMember = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      organizationMembershipId: pmMembership.id,
      role: ProjectRole.PROJECT_MANAGER,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );

  const devProjectMember = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      organizationMembershipId: devMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );

  const designerProjectMember = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      organizationMembershipId: designerMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );

  // 7. Seed Project Task Statuses (Semantic Categories)
  log('📊 Setting up project task workflow statuses...');
  const statusRepo = dataSource.getRepository(ProjectTaskStatusEntity);

  const statusBacklog = await statusRepo.save(
    statusRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Backlog',
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
      position: 0,
    }),
  );

  const statusTodo = await statusRepo.save(
    statusRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      name: 'To Do',
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
      position: 1,
    }),
  );

  const statusInProgress = await statusRepo.save(
    statusRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      name: 'In Progress',
      semanticCategory: TaskStatusSemanticCategory.IN_PROGRESS,
      position: 2,
    }),
  );

  const statusInReview = await statusRepo.save(
    statusRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      name: 'In Review',
      semanticCategory: TaskStatusSemanticCategory.REVIEW,
      position: 3,
    }),
  );

  const statusCompleted = await statusRepo.save(
    statusRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Completed',
      semanticCategory: TaskStatusSemanticCategory.COMPLETED,
      position: 4,
    }),
  );

  await statusRepo.save(
    statusRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Cancelled',
      semanticCategory: TaskStatusSemanticCategory.CANCELLED,
      position: 5,
    }),
  );

  // 8. Seed Module Settings (All 4 enabled)
  log('⚙️ Enabling project optional modules...');
  const moduleSettingRepo = dataSource.getRepository(
    ProjectModuleSettingEntity,
  );
  for (const mod of [
    ProjectModuleCode.MILESTONES,
    ProjectModuleCode.DOCUMENTS,
    ProjectModuleCode.RISKS,
    ProjectModuleCode.FILES,
  ]) {
    await moduleSettingRepo.save(
      moduleSettingRepo.create({
        organizationId: organization.id,
        projectId: project.id,
        moduleCode: mod,
        enabled: true,
      }),
    );
  }

  // 9. Seed Milestones
  log('🚩 Creating project milestones...');
  const milestoneRepo = dataSource.getRepository(MilestoneEntity);

  const milestone1 = await milestoneRepo.save(
    milestoneRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Milestone 1: PostgreSQL Architecture & Cutover',
      description:
        'Design and deploy multi-tenant PostgreSQL schema and run clean migrations.',
      statusCode: MilestoneStatusCode.CLOSED,
      dueDate: '2026-08-30',
      closedAt: new Date('2026-08-30T18:00:00Z'),
    }),
  );

  const milestone2 = await milestoneRepo.save(
    milestoneRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Milestone 2: Task Workflows & Approvals',
      description:
        'Implement atomic state transitions, approval queue, and assignees.',
      statusCode: MilestoneStatusCode.CLOSED,
      dueDate: '2026-09-07',
      closedAt: new Date('2026-09-07T18:00:00Z'),
    }),
  );

  const milestone3 = await milestoneRepo.save(
    milestoneRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Milestone 3: Production Deployment & Release Gate',
      description:
        'Finalize container manifests, CI pipeline consolidation, and portfolio demo.',
      statusCode: MilestoneStatusCode.OPEN,
      dueDate: '2026-10-15',
      closedAt: null,
    }),
  );

  // 10. Seed Documents
  log('📝 Creating project documentation...');
  const docRepo = dataSource.getRepository(DocumentEntity);

  await docRepo.save(
    docRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      title: 'ADR-003: Multi-tenant Data Isolation Model',
      content: `### Architecture Decision Record: Tenant Isolation
**Status:** Accepted
**Context:** Multi-tenant SaaS requires strict organization boundaries.
**Decision:** All entities carry non-nullable organizationId with composite unique indexes and request interceptors.`,
      authorProjectMembershipId: ownerProjectMember.id,
      lastEditedByProjectMembershipId: ownerProjectMember.id,
      archivedAt: null,
    }),
  );

  await docRepo.save(
    docRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      title: 'Operational Runbook & Graceful Shutdown',
      content: `### Operational Guide
- Health check: GET /api/health
- Readiness probe verifies PostgreSQL and Redis liveness.
- Graceful shutdown handles in-flight transactions within 15 seconds.`,
      authorProjectMembershipId: pmProjectMember.id,
      lastEditedByProjectMembershipId: pmProjectMember.id,
      archivedAt: null,
    }),
  );

  // 11. Seed Risks
  log('⚠️ Creating project risks & mitigations...');
  const riskRepo = dataSource.getRepository(RiskEntity);

  await riskRepo.save(
    riskRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      title: 'Third-party Email Service Rate Limits',
      description:
        'Transactional OTP emails could be throttled during high registration peaks.',
      likelihoodCode: RiskScaleCode.MEDIUM,
      impactCode: RiskScaleCode.HIGH,
      state: RiskState.OPEN,
      ownerProjectMembershipId: pmProjectMember.id,
      mitigation:
        'Implement asynchronous BullMQ email queue with exponential retry backoff.',
    }),
  );

  await riskRepo.save(
    riskRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      title: 'Database Connection Pool Exhaustion',
      description:
        'Spikes in concurrent queries could exceed PostgreSQL max pool limits.',
      likelihoodCode: RiskScaleCode.LOW,
      impactCode: RiskScaleCode.HIGH,
      state: RiskState.RESOLVED,
      ownerProjectMembershipId: devProjectMember.id,
      mitigation:
        'Configured TypeORM pool bounds (min: 2, max: 20) with idle connection reaping.',
    }),
  );

  // 12. Seed Tasks, Checklists, Assignees & Approvals
  log(
    '📋 Creating tasks with workflows, assignees, checklists, and approval states...',
  );
  const taskRepo = dataSource.getRepository(TaskEntity);
  const checklistRepo = dataSource.getRepository(TaskChecklistItemEntity);
  const assigneeRepo = dataSource.getRepository(TaskAssigneeEntity);
  const approvalRepo = dataSource.getRepository(ApprovalRequestEntity);
  const commentRepo = dataSource.getRepository(CommentEntity);

  // --- Task 1: Completed & Approved ---
  const task1 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      owningTeamId: engineeringTeam.id,
      statusId: statusCompleted.id,
      milestoneId: milestone1.id,
      title: 'Implement PostgreSQL schema migrations and audit triggers',
      description:
        'Set up TypeORM migrations from clean database with immutable audit logs.',
      priorityCode: 'HIGH',
      dueAt: new Date('2026-08-25T17:00:00Z'),
      manualProgress: 100,
      requiresApproval: true,
      approverProjectMembershipId: ownerProjectMember.id,
      creatorProjectMembershipId: ownerProjectMember.id,
    }),
  );

  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: task1.id,
      projectMembershipId: devProjectMember.id,
      organizationId: organization.id,
      projectId: project.id,
      assignedByProjectMembershipId: ownerProjectMember.id,
      assignedAt: new Date('2026-08-20T09:00:00Z'),
    }),
  );

  for (let i = 0; i < 3; i++) {
    await checklistRepo.save(
      checklistRepo.create({
        organizationId: organization.id,
        projectId: project.id,
        taskId: task1.id,
        text: `Migration test step ${i + 1}`,
        position: i,
        completedAt: new Date('2026-08-24T12:00:00Z'),
        completedByProjectMembershipId: devProjectMember.id,
      }),
    );
  }

  await approvalRepo.save(
    approvalRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      taskId: task1.id,
      requestNumber: 1,
      requestedByMembershipId: devMembership.id,
      approverProjectMembershipId: ownerProjectMember.id,
      state: ApprovalRequestState.APPROVED,
      requestReason: 'All migration integration tests passed successfully.',
      resolutionReason: 'Approved. Migrations verified against clean database.',
      resolvedByMembershipId: ownerMembership.id,
      requestedAt: new Date('2026-08-25T14:00:00Z'),
      resolvedAt: new Date('2026-08-25T16:30:00Z'),
    }),
  );

  // --- Task 2: Completed & Approved ---
  const task2 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      owningTeamId: engineeringTeam.id,
      statusId: statusCompleted.id,
      milestoneId: milestone2.id,
      title: 'Build Task Approval Queue and Atomic Transitions',
      description:
        'Implement atomic state resolution and approval request workflow in PostgreSQL.',
      priorityCode: 'URGENT',
      dueAt: new Date('2026-09-05T17:00:00Z'),
      manualProgress: 100,
      requiresApproval: true,
      approverProjectMembershipId: pmProjectMember.id,
      creatorProjectMembershipId: pmProjectMember.id,
    }),
  );

  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: task2.id,
      projectMembershipId: devProjectMember.id,
      organizationId: organization.id,
      projectId: project.id,
      assignedByProjectMembershipId: pmProjectMember.id,
      assignedAt: new Date('2026-09-01T09:00:00Z'),
    }),
  );

  await approvalRepo.save(
    approvalRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      taskId: task2.id,
      requestNumber: 1,
      requestedByMembershipId: devMembership.id,
      approverProjectMembershipId: pmProjectMember.id,
      state: ApprovalRequestState.APPROVED,
      requestReason: 'Approval queue queries and atomic transitions verified.',
      resolutionReason: 'LGTM. Atomic transition prevents completion bypass.',
      resolvedByMembershipId: pmMembership.id,
      requestedAt: new Date('2026-09-05T10:00:00Z'),
      resolvedAt: new Date('2026-09-05T15:00:00Z'),
    }),
  );

  // --- Task 3: In Review with PENDING Approval Request (Ready for Reviewer Demo!) ---
  const task3 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      owningTeamId: productTeam.id,
      statusId: statusInReview.id,
      milestoneId: milestone3.id,
      title: 'Refactor Frontend Navigation and Active Workspace Context',
      description:
        'Eliminate retired dashboard routes and support a responsive mobile sidebar.',
      priorityCode: 'HIGH',
      dueAt: new Date('2026-10-10T17:00:00Z'),
      manualProgress: 100,
      requiresApproval: true,
      approverProjectMembershipId: ownerProjectMember.id,
      creatorProjectMembershipId: designerProjectMember.id,
    }),
  );

  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: task3.id,
      projectMembershipId: designerProjectMember.id,
      organizationId: organization.id,
      projectId: project.id,
      assignedByProjectMembershipId: pmProjectMember.id,
      assignedAt: new Date('2026-09-06T09:00:00Z'),
    }),
  );

  for (let i = 0; i < 3; i++) {
    await checklistRepo.save(
      checklistRepo.create({
        organizationId: organization.id,
        projectId: project.id,
        taskId: task3.id,
        text: [
          'Implement responsive drawer',
          'Route legacy aliases to /projects',
          'Sync MyTasks tab with URL',
        ][i],
        position: i,
        completedAt: new Date('2026-09-08T10:00:00Z'),
        completedByProjectMembershipId: designerProjectMember.id,
      }),
    );
  }

  // PENDING Approval Request on Task 3!
  await approvalRepo.save(
    approvalRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      taskId: task3.id,
      requestNumber: 1,
      requestedByMembershipId: designerMembership.id,
      approverProjectMembershipId: ownerProjectMember.id,
      state: ApprovalRequestState.PENDING,
      requestReason:
        'All checklist items completed and verified against local build. Ready for final review in approval queue!',
      resolutionReason: null,
      resolvedByMembershipId: null,
      requestedAt: new Date('2026-09-08T11:00:00Z'),
      resolvedAt: null,
    }),
  );

  await commentRepo.save(
    commentRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      taskId: task3.id,
      authorProjectMembershipId: designerProjectMember.id,
      body: 'Submitted for approval. You can approve or reject this directly from the Approval Queue screen!',
    }),
  );

  // --- Task 4: In Progress ---
  const task4 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      owningTeamId: engineeringTeam.id,
      statusId: statusInProgress.id,
      milestoneId: milestone3.id,
      title: 'Implement Deterministic Portfolio Seed Script',
      description:
        'Create rich, realistic seed data covering all modules for CV portfolio demonstration.',
      priorityCode: 'MEDIUM',
      dueAt: new Date('2026-10-12T17:00:00Z'),
      manualProgress: 60,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: devProjectMember.id,
    }),
  );

  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: task4.id,
      projectMembershipId: devProjectMember.id,
      organizationId: organization.id,
      projectId: project.id,
      assignedByProjectMembershipId: ownerProjectMember.id,
      assignedAt: new Date('2026-09-08T09:00:00Z'),
    }),
  );

  await checklistRepo.save(
    checklistRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      taskId: task4.id,
      text: 'Define deterministic accounts and credentials',
      position: 0,
      completedAt: new Date('2026-09-08T09:30:00Z'),
      completedByProjectMembershipId: devProjectMember.id,
    }),
  );

  await checklistRepo.save(
    checklistRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      taskId: task4.id,
      text: 'Populate optional modules and workflows',
      position: 1,
      completedAt: new Date('2026-09-08T10:00:00Z'),
      completedByProjectMembershipId: devProjectMember.id,
    }),
  );

  await checklistRepo.save(
    checklistRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      taskId: task4.id,
      text: 'Implement disposable target safeguard check',
      position: 2,
      completedAt: null,
      completedByProjectMembershipId: null,
    }),
  );

  // --- Task 5: To Do ---
  const task5 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      owningTeamId: engineeringTeam.id,
      statusId: statusTodo.id,
      milestoneId: milestone3.id,
      title: 'Prepare Production Docker Image & Health Probes',
      description:
        'Package backend into multi-stage Alpine image with readiness probe and non-root user.',
      priorityCode: 'HIGH',
      dueAt: new Date('2026-10-15T17:00:00Z'),
      manualProgress: 0,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: ownerProjectMember.id,
    }),
  );

  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: task5.id,
      projectMembershipId: devProjectMember.id,
      organizationId: organization.id,
      projectId: project.id,
      assignedByProjectMembershipId: ownerProjectMember.id,
      assignedAt: new Date('2026-09-08T09:00:00Z'),
    }),
  );

  // --- Task 6: Backlog ---
  await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      owningTeamId: productTeam.id,
      statusId: statusBacklog.id,
      milestoneId: milestone3.id,
      title: 'Draft Comprehensive Portfolio README & Architecture ERD',
      description:
        'Document system problem, trade-offs, ERD, and reproducible local commands.',
      priorityCode: 'LOW',
      dueAt: null,
      manualProgress: 0,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: pmProjectMember.id,
    }),
  );

  // 13. Seed Timeline Activities
  log('⚡ Creating timeline activity entries...');
  const activityRepo = dataSource.getRepository(ActivityEntryEntity);

  await activityRepo.save(
    activityRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      actorMembershipId: ownerMembership.id,
      actionCode: 'PROJECT_CREATED',
      subjectType: 'PROJECT',
      subjectId: project.id,
      safeMetadata: { projectName: project.name },
      occurredAt: new Date('2026-08-01T08:00:00Z'),
    }),
  );

  await activityRepo.save(
    activityRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      actorMembershipId: designerMembership.id,
      actionCode: 'APPROVAL_REQUESTED',
      subjectType: 'TASK',
      subjectId: task3.id,
      safeMetadata: { taskTitle: task3.title, requestNumber: 1 },
      occurredAt: new Date('2026-09-08T11:00:00Z'),
    }),
  );

  // 14. Seed Notification for Pending Approval
  log('🔔 Creating in-app notification for pending approval...');
  const notifRepo = dataSource.getRepository(NotificationEntity);

  await notifRepo.save(
    notifRepo.create({
      organizationId: organization.id,
      projectId: project.id,
      recipientUserId: ownerUser.id,
      typeCode: 'TASK_APPROVAL_REQUESTED',
      resourceType: 'TASK',
      resourceId: task3.id,
      deliveryStateCode: 'DELIVERED',
      safePayload: {
        taskTitle: task3.title,
        projectName: project.name,
        requestedByName: designerUser.name,
        message: `${designerUser.name} requested approval for task "${task3.title}"`,
      },
      readAt: null,
      deliveredAt: new Date('2026-09-08T11:00:00Z'),
    }),
  );

  log('✅ Deterministic portfolio seed completed successfully!\n');
  log('================================================================');
  log('🎉 TaskForge Portfolio Demo Accounts Ready');
  log('----------------------------------------------------------------');
  log('Organization : Acme Cloud Technologies (slug: acme-cloud)');
  log('Active Project: TaskForge Multi-tenant SaaS v0.3');
  log('----------------------------------------------------------------');
  log('1. Owner Account:');
  log('   Email   : owner@taskforge.dev');
  log('   Password: Password123!');
  log('   Role    : Organization Owner / Project Manager');
  log('');
  log('2. Admin (PM) Account:');
  log('   Email   : pm@taskforge.dev');
  log('   Password: Password123!');
  log('   Role    : Organization Admin / Project Manager');
  log('');
  log('3. Contributor / Dev Account:');
  log('   Email   : dev@taskforge.dev');
  log('   Password: Password123!');
  log('   Role    : Organization Member / Contributor');
  log('');
  log('4. Contributor / Designer Account:');
  log('   Email   : designer@taskforge.dev');
  log('   Password: Password123!');
  log('   Role    : Organization Member / Contributor');
  log('================================================================');

  return {
    organization,
    project,
    users: [ownerUser, pmUser, devUser, designerUser],
  };
}

// Standalone execution entrypoint
if (require.main === module) {
  const dataSource = new DataSource(
    createPostgresDataSourceOptions(process.env),
  );

  dataSource
    .initialize()
    .then(async () => {
      try {
        await runPortfolioSeed(dataSource);
        await dataSource.destroy();
        process.exit(0);
      } catch (err: unknown) {
        console.error(
          '❌ Seeding failed:',
          err instanceof Error ? err.message : String(err),
        );
        await dataSource.destroy();
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error(
        '❌ Failed to initialize DataSource:',
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    });
}
