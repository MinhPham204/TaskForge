import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { createPostgresDataSourceOptions } from '../data-source.options';
import {
  OrganizationEntity,
  OrganizationMembershipEntity,
  OrganizationRoleDefinitionEntity,
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

export interface RichSeedOptions {
  confirmSeed?: boolean;
  log?: (message: string) => void;
}

export async function runRichPortfolioSeed(
  dataSource: DataSource,
  options: RichSeedOptions = {},
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

  log('🌱 Starting comprehensive rich portfolio seed for TaskForge...');

  // Relative date helper so the dashboard calendar always has live data around TODAY!
  const now = new Date();
  const relDate = (
    offsetDays: number = 0,
    hour: number = 17,
    minute: number = 0,
  ) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offsetDays);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const relDateString = (offsetDays: number = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
  };

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
      // Clean up audit logs and collaboration files
      try {
        await manager.query(
          'ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_append_only;',
        );
        await manager.query(
          'DELETE FROM audit_logs WHERE organization_id = $1;',
          [orgId],
        );
        await manager.query(
          'ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_append_only;',
        );
      } catch (err) {
        log(
          `ℹ️ Audit log trigger bypass info: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      await manager.query(
        'DELETE FROM task_attachments WHERE organization_id = $1;',
        [orgId],
      );
      await manager.query(
        'DELETE FROM project_files WHERE organization_id = $1;',
        [orgId],
      );
      await manager.query(
        'DELETE FROM stored_files WHERE organization_id = $1;',
        [orgId],
      );

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
      await manager.query(
        'ALTER TABLE organizations DROP CONSTRAINT fk_organizations_owner_membership_same_organization',
      );
      await manager.delete(OrganizationMembershipEntity, {
        organizationId: orgId,
      });
      await manager.query(
        'DELETE FROM organization_role_permissions WHERE organization_id = $1',
        [orgId],
      );
      await manager.query(
        'DELETE FROM organization_roles WHERE organization_id = $1',
        [orgId],
      );
      await manager.delete(OrganizationEntity, { id: orgId });
      await manager.query(
        `ALTER TABLE organizations ADD CONSTRAINT fk_organizations_owner_membership_same_organization FOREIGN KEY (id, owner_membership_id) REFERENCES organization_memberships (organization_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`,
      );
    });
  }

  // 2. Seed Users
  log(
    '👤 Creating deterministic demo user accounts with realistic profiles...',
  );
  const userRepo = dataSource.getRepository(UserEntity);
  const passwordHash = bcrypt.hashSync('Password123!', 10);
  const verifiedDate = new Date('2026-01-01T00:00:00Z');

  const demoUsersSpec = [
    { email: 'owner@taskforge.dev', name: 'Alex Morgan' },
    { email: 'pm@taskforge.dev', name: 'Taylor Swift' },
    { email: 'dev@taskforge.dev', name: 'Jordan Lee' },
    { email: 'designer@taskforge.dev', name: 'Morgan Chen' },
    { email: 'fullstack@taskforge.dev', name: 'Sam Rivera' },
    { email: 'qa@taskforge.dev', name: 'Elena Rostova' },
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
  const fullstackUser = userMap.get('fullstack@taskforge.dev')!;
  const qaUser = userMap.get('qa@taskforge.dev')!;

  // 3. Seed Organization
  log('🏢 Creating demo Organization: Acme Cloud Technologies...');
  const ownerMembershipId = randomUUID();
  const { organization, roleIds, ownerMembership } =
    await dataSource.transaction(async (manager) => {
      const organization = await manager
        .getRepository(OrganizationEntity)
        .save({
          name: 'Acme Cloud Technologies',
          logoUrl:
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&auto=format&fit=crop&q=80',
          ownerMembershipId,
        });
      const roleRows = await manager
        .getRepository(OrganizationRoleDefinitionEntity)
        .findBy({ organizationId: organization.id });
      const roleIds = Object.fromEntries<string>(
        roleRows.flatMap((role) =>
          role.systemCode === null ? [] : [[role.systemCode, role.id] as const],
        ),
      );
      if (!roleIds.OWNER || !roleIds.ADMIN || !roleIds.MEMBER)
        throw new Error('Organization default roles were not provisioned');
      const ownerMembership = await manager
        .getRepository(OrganizationMembershipEntity)
        .save({
          organizationId: organization.id,
          id: ownerMembershipId,
          userId: ownerUser.id,
          roleId: roleIds.OWNER,
          state: OrganizationMembershipState.ACTIVE,
          joinedAt: new Date('2026-01-01T00:00:00Z'),
        });
      return { organization, roleIds, ownerMembership };
    });

  // 4. Seed Organization Memberships
  log('👥 Establishing workspace memberships with differentiated roles...');
  const memberRepo = dataSource.getRepository(OrganizationMembershipEntity);

  const pmMembership = await memberRepo.save(
    memberRepo.create({
      organizationId: organization.id,
      userId: pmUser.id,
      roleId: roleIds.ADMIN,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date('2026-01-05T00:00:00Z'),
    }),
  );

  const devMembership = await memberRepo.save(
    memberRepo.create({
      organizationId: organization.id,
      userId: devUser.id,
      roleId: roleIds.MEMBER,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date('2026-01-10T00:00:00Z'),
    }),
  );

  const designerMembership = await memberRepo.save(
    memberRepo.create({
      organizationId: organization.id,
      userId: designerUser.id,
      roleId: roleIds.MEMBER,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date('2026-01-15T00:00:00Z'),
    }),
  );

  const fullstackMembership = await memberRepo.save(
    memberRepo.create({
      organizationId: organization.id,
      userId: fullstackUser.id,
      roleId: roleIds.MEMBER,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date('2026-01-20T00:00:00Z'),
    }),
  );

  const qaMembership = await memberRepo.save(
    memberRepo.create({
      organizationId: organization.id,
      userId: qaUser.id,
      roleId: roleIds.MEMBER,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date('2026-01-25T00:00:00Z'),
    }),
  );

  // 5. Seed Teams
  log('🛡️ Creating workspace collaboration teams...');
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

  const devopsTeam = await teamRepo.save(
    teamRepo.create({
      organizationId: organization.id,
      name: 'DevOps & Site Reliability',
      description:
        'CI/CD pipelines, container orchestration, monitoring, and cloud security.',
    }),
  );

  // Team associations
  const allMembers = [
    ownerMembership,
    pmMembership,
    devMembership,
    designerMembership,
    fullstackMembership,
    qaMembership,
  ];

  for (const m of allMembers) {
    await teamMemberRepo.save(
      teamMemberRepo.create({
        organizationId: organization.id,
        teamId: generalTeam.id,
        organizationMembershipId: m.id,
        joinedAt: new Date('2026-01-15T00:00:00Z'),
      }),
    );
  }

  for (const m of [
    ownerMembership,
    pmMembership,
    devMembership,
    fullstackMembership,
  ]) {
    await teamMemberRepo.save(
      teamMemberRepo.create({
        organizationId: organization.id,
        teamId: engineeringTeam.id,
        organizationMembershipId: m.id,
        joinedAt: new Date('2026-01-15T00:00:00Z'),
      }),
    );
  }

  for (const m of [pmMembership, designerMembership, fullstackMembership]) {
    await teamMemberRepo.save(
      teamMemberRepo.create({
        organizationId: organization.id,
        teamId: productTeam.id,
        organizationMembershipId: m.id,
        joinedAt: new Date('2026-01-15T00:00:00Z'),
      }),
    );
  }

  for (const m of [ownerMembership, devMembership, qaMembership]) {
    await teamMemberRepo.save(
      teamMemberRepo.create({
        organizationId: organization.id,
        teamId: devopsTeam.id,
        organizationMembershipId: m.id,
        joinedAt: new Date('2026-01-25T00:00:00Z'),
      }),
    );
  }

  // Helper to initialize project statuses and modules
  const statusRepo = dataSource.getRepository(ProjectTaskStatusEntity);
  const moduleSettingRepo = dataSource.getRepository(
    ProjectModuleSettingEntity,
  );

  const initProjectWorkflow = async (projectId: string) => {
    const sBacklog = await statusRepo.save(
      statusRepo.create({
        organizationId: organization.id,
        projectId,
        name: 'Backlog',
        semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
        position: 0,
      }),
    );
    const sTodo = await statusRepo.save(
      statusRepo.create({
        organizationId: organization.id,
        projectId,
        name: 'To Do',
        semanticCategory: TaskStatusSemanticCategory.NOT_STARTED,
        position: 1,
      }),
    );
    const sInProgress = await statusRepo.save(
      statusRepo.create({
        organizationId: organization.id,
        projectId,
        name: 'In Progress',
        semanticCategory: TaskStatusSemanticCategory.IN_PROGRESS,
        position: 2,
      }),
    );
    const sInReview = await statusRepo.save(
      statusRepo.create({
        organizationId: organization.id,
        projectId,
        name: 'In Review',
        semanticCategory: TaskStatusSemanticCategory.REVIEW,
        position: 3,
      }),
    );
    const sCompleted = await statusRepo.save(
      statusRepo.create({
        organizationId: organization.id,
        projectId,
        name: 'Completed',
        semanticCategory: TaskStatusSemanticCategory.COMPLETED,
        position: 4,
      }),
    );
    const sCancelled = await statusRepo.save(
      statusRepo.create({
        organizationId: organization.id,
        projectId,
        name: 'Cancelled',
        semanticCategory: TaskStatusSemanticCategory.CANCELLED,
        position: 5,
      }),
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
          projectId,
          moduleCode: mod,
          enabled: true,
        }),
      );
    }

    return { sBacklog, sTodo, sInProgress, sInReview, sCompleted, sCancelled };
  };

  // 6. Seed Project 1: TaskForge Multi-tenant SaaS v0.3
  log('📁 Creating Project 1: TaskForge Multi-tenant SaaS v0.3...');
  const projectRepo = dataSource.getRepository(ProjectEntity);
  const projectMemberRepo = dataSource.getRepository(ProjectMembershipEntity);
  const projectTeamRepo = dataSource.getRepository(ProjectTeamEntity);
  const milestoneRepo = dataSource.getRepository(MilestoneEntity);
  const docRepo = dataSource.getRepository(DocumentEntity);
  const riskRepo = dataSource.getRepository(RiskEntity);
  const taskRepo = dataSource.getRepository(TaskEntity);
  const checklistRepo = dataSource.getRepository(TaskChecklistItemEntity);
  const assigneeRepo = dataSource.getRepository(TaskAssigneeEntity);
  const approvalRepo = dataSource.getRepository(ApprovalRequestEntity);
  const commentRepo = dataSource.getRepository(CommentEntity);
  const activityRepo = dataSource.getRepository(ActivityEntryEntity);
  const notifRepo = dataSource.getRepository(NotificationEntity);

  const project1 = await projectRepo.save(
    projectRepo.create({
      organizationId: organization.id,
      name: 'TaskForge Multi-tenant SaaS v0.3',
      description:
        'Enterprise task and workspace management platform with PostgreSQL persistence, TypeORM migrations, strict tenant isolation, customizable workflows, approval queues, and collaboration tools.',
      state: ProjectState.ACTIVE,
      startDate: relDateString(-45),
      dueDate: relDateString(60),
      createdByMembershipId: ownerMembership.id,
    }),
  );

  await projectTeamRepo.save(
    projectTeamRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      teamId: engineeringTeam.id,
      addedByMembershipId: ownerMembership.id,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );
  await projectTeamRepo.save(
    projectTeamRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      teamId: productTeam.id,
      addedByMembershipId: ownerMembership.id,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );

  const p1Owner = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      organizationMembershipId: ownerMembership.id,
      role: ProjectRole.PROJECT_MANAGER,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );
  const p1Pm = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      organizationMembershipId: pmMembership.id,
      role: ProjectRole.PROJECT_MANAGER,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );
  const p1Dev = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      organizationMembershipId: devMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );
  const p1Designer = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      organizationMembershipId: designerMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );
  const p1Fullstack = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      organizationMembershipId: fullstackMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );
  const p1Qa = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      organizationMembershipId: qaMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date('2026-08-01T00:00:00Z'),
    }),
  );

  const p1Workflow = await initProjectWorkflow(project1.id);

  // Project 1 Milestones
  const p1M1 = await milestoneRepo.save(
    milestoneRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      name: 'Milestone 1: PostgreSQL Architecture & Cutover',
      description:
        'Design and deploy multi-tenant PostgreSQL schema and run clean migrations.',
      statusCode: MilestoneStatusCode.CLOSED,
      dueDate: relDateString(-15),
      closedAt: relDate(-15),
    }),
  );
  const p1M2 = await milestoneRepo.save(
    milestoneRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      name: 'Milestone 2: Task Workflows & Approvals',
      description:
        'Implement atomic state transitions, approval queue, and assignees.',
      statusCode: MilestoneStatusCode.CLOSED,
      dueDate: relDateString(-5),
      closedAt: relDate(-5),
    }),
  );
  const p1M3 = await milestoneRepo.save(
    milestoneRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      name: 'Milestone 3: Production Deployment & Release Gate',
      description:
        'Finalize container manifests, CI pipeline consolidation, and portfolio demo.',
      statusCode: MilestoneStatusCode.OPEN,
      dueDate: relDateString(6), // In 6 days (shows up in 7-day schedule!)
      closedAt: null,
    }),
  );

  // Project 1 Documents
  await docRepo.save(
    docRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      title: 'ADR-003: Multi-tenant Data Isolation Model',
      content: `### Architecture Decision Record: Tenant Isolation
**Status:** Accepted
**Context:** Multi-tenant SaaS requires strict organization boundaries.
**Decision:** All entities carry non-nullable organizationId with composite unique indexes and request interceptors.`,
      authorProjectMembershipId: p1Owner.id,
      lastEditedByProjectMembershipId: p1Owner.id,
    }),
  );
  await docRepo.save(
    docRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      title: 'Operational Runbook & Graceful Shutdown',
      content: `### Operational Guide
- Health check: GET /api/health
- Readiness probe verifies PostgreSQL and Redis liveness.
- Graceful shutdown handles in-flight transactions within 15 seconds.`,
      authorProjectMembershipId: p1Pm.id,
      lastEditedByProjectMembershipId: p1Pm.id,
    }),
  );

  // Project 1 Risks
  await riskRepo.save(
    riskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      title: 'Third-party Email Service Rate Limits',
      description:
        'Transactional OTP emails could be throttled during high registration peaks.',
      likelihoodCode: RiskScaleCode.MEDIUM,
      impactCode: RiskScaleCode.HIGH,
      state: RiskState.OPEN,
      ownerProjectMembershipId: p1Pm.id,
      mitigation:
        'Implement asynchronous BullMQ email queue with exponential retry backoff.',
    }),
  );
  await riskRepo.save(
    riskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      title: 'Database Connection Pool Exhaustion',
      description:
        'Spikes in concurrent queries could exceed PostgreSQL max pool limits.',
      likelihoodCode: RiskScaleCode.LOW,
      impactCode: RiskScaleCode.HIGH,
      state: RiskState.RESOLVED,
      ownerProjectMembershipId: p1Dev.id,
      mitigation:
        'Configured TypeORM PostgreSQL connection-pool limits and connection timeout.',
    }),
  );

  // Project 1 Tasks
  log(
    '📋 Populating rich tasks for Project 1 (due today, overdue, upcoming)...',
  );

  // Task 1.1: DUE TODAY - URGENT - In Progress
  const t1_1 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      owningTeamId: engineeringTeam.id,
      statusId: p1Workflow.sInProgress.id,
      milestoneId: p1M3.id,
      title: 'Optimize Supabase Connection Pooling & Latency',
      description:
        'Benchmark database query latency against Supabase pooler, configure keep-alive and connection timeout for serverless environments.',
      priorityCode: 'URGENT',
      dueAt: relDate(0, 18, 0), // TODAY at 18:00
      manualProgress: 70,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: p1Owner.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t1_1.id,
      projectMembershipId: p1Dev.id,
      organizationId: organization.id,
      projectId: project1.id,
      assignedByProjectMembershipId: p1Owner.id,
      assignedAt: relDate(-1),
    }),
  );
  await checklistRepo.save(
    checklistRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      taskId: t1_1.id,
      text: 'Verify pool limits in production environment',
      position: 0,
      completedAt: relDate(0, 10, 0),
      completedByProjectMembershipId: p1Dev.id,
    }),
  );
  await checklistRepo.save(
    checklistRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      taskId: t1_1.id,
      text: 'Test connection retry logic on transient disconnects',
      position: 1,
      completedAt: null,
      completedByProjectMembershipId: null,
    }),
  );
  await commentRepo.save(
    commentRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      taskId: t1_1.id,
      authorProjectMembershipId: p1Dev.id,
      body: 'Testing connection pooling with pgBouncer transaction mode. Response time dropped to <25ms.',
    }),
  );

  // Task 1.2: DUE TODAY - HIGH - In Review with PENDING Approval Request
  const t1_2 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      owningTeamId: engineeringTeam.id,
      statusId: p1Workflow.sInReview.id,
      milestoneId: p1M3.id,
      title: 'Harden JWT Token Rotation & Session Revocation',
      description:
        'Implement single-use refresh token rotation, redis blacklisting on logout, and CSRF protection headers.',
      priorityCode: 'HIGH',
      dueAt: relDate(0, 20, 0), // TODAY at 20:00
      manualProgress: 100,
      requiresApproval: true,
      approverProjectMembershipId: p1Owner.id,
      creatorProjectMembershipId: p1Fullstack.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t1_2.id,
      projectMembershipId: p1Fullstack.id,
      organizationId: organization.id,
      projectId: project1.id,
      assignedByProjectMembershipId: p1Pm.id,
      assignedAt: relDate(-2),
    }),
  );
  for (const [idx, item] of [
    'Unit tests for token expiry and rotation',
    'Redis session revocation check on protected routes',
    'Security regression test against replay attacks',
  ].entries()) {
    await checklistRepo.save(
      checklistRepo.create({
        organizationId: organization.id,
        projectId: project1.id,
        taskId: t1_2.id,
        text: item,
        position: idx,
        completedAt: relDate(-1),
        completedByProjectMembershipId: p1Fullstack.id,
      }),
    );
  }
  await approvalRepo.save(
    approvalRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      taskId: t1_2.id,
      requestNumber: 1,
      requestedByMembershipId: fullstackMembership.id,
      approverProjectMembershipId: p1Owner.id,
      state: ApprovalRequestState.PENDING,
      requestReason:
        'All checklist security items completed and passed automated tests. Ready for Owner approval in Approval Queue!',
      resolutionReason: null,
      resolvedByMembershipId: null,
      requestedAt: relDate(0, 9, 30),
      resolvedAt: null,
    }),
  );

  // Task 1.3: DUE TOMORROW (+1 day) - HIGH - In Progress
  const t1_3 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      owningTeamId: productTeam.id,
      statusId: p1Workflow.sInProgress.id,
      milestoneId: p1M3.id,
      title: 'Refactor Dashboard 7-Day Work Schedule & Calendar Grid',
      description:
        'Support internationalized locales, responsive grid views, priority indicator badges, and direct navigation links.',
      priorityCode: 'HIGH',
      dueAt: relDate(1, 16, 0), // TOMORROW
      manualProgress: 85,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: p1Designer.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t1_3.id,
      projectMembershipId: p1Designer.id,
      organizationId: organization.id,
      projectId: project1.id,
      assignedByProjectMembershipId: p1Pm.id,
      assignedAt: relDate(-1),
    }),
  );

  // Task 1.4: DUE IN 2 DAYS (+2 days) - MEDIUM - To Do
  const t1_4 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      owningTeamId: engineeringTeam.id,
      statusId: p1Workflow.sTodo.id,
      milestoneId: p1M3.id,
      title: 'Automated CI Smoke Tests with Supabase & Docker',
      description:
        'Add pre-deploy health probe script to verify migration status and read/write availability.',
      priorityCode: 'MEDIUM',
      dueAt: relDate(2, 17, 0), // +2 days
      manualProgress: 0,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: p1Owner.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t1_4.id,
      projectMembershipId: p1Qa.id,
      organizationId: organization.id,
      projectId: project1.id,
      assignedByProjectMembershipId: p1Owner.id,
      assignedAt: relDate(0),
    }),
  );

  // Task 1.5: DUE IN 3 DAYS (+3 days) - HIGH - To Do
  await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      owningTeamId: engineeringTeam.id,
      statusId: p1Workflow.sTodo.id,
      milestoneId: p1M3.id,
      title: 'Rate Limiting & Tenant Quota Enforcement Filter',
      description:
        'Implement sliding-window rate limiter per organization slug to protect against API abuse.',
      priorityCode: 'HIGH',
      dueAt: relDate(3, 17, 0), // +3 days
      manualProgress: 0,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: p1Dev.id,
    }),
  );

  // Task 1.6: DUE IN 4 DAYS (+4 days) - MEDIUM - In Progress
  const t1_6 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      owningTeamId: productTeam.id,
      statusId: p1Workflow.sInProgress.id,
      milestoneId: p1M3.id,
      title: 'Audit Log Explorer & CSV Export Feature',
      description:
        'Deliver a secure audit log viewer for Organization Admins with date range filters and export capability.',
      priorityCode: 'MEDIUM',
      dueAt: relDate(4, 18, 0), // +4 days
      manualProgress: 40,
      requiresApproval: true,
      approverProjectMembershipId: p1Pm.id,
      creatorProjectMembershipId: p1Pm.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t1_6.id,
      projectMembershipId: p1Fullstack.id,
      organizationId: organization.id,
      projectId: project1.id,
      assignedByProjectMembershipId: p1Pm.id,
      assignedAt: relDate(0),
    }),
  );

  // Task 1.7: DUE IN 5 DAYS (+5 days) - LOW - Backlog
  await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      owningTeamId: engineeringTeam.id,
      statusId: p1Workflow.sBacklog.id,
      milestoneId: p1M3.id,
      title: 'Webhook Event Subscription Dispatcher',
      description:
        'Send HTTP POST payloads on project created, task status changed, and approval completed.',
      priorityCode: 'LOW',
      dueAt: relDate(5, 17, 0), // +5 days
      manualProgress: 0,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: p1Pm.id,
    }),
  );

  // Task 1.8: OVERDUE by 1 day (-1 day) - URGENT - In Review with PENDING Approval Request
  const t1_8 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      owningTeamId: engineeringTeam.id,
      statusId: p1Workflow.sInReview.id,
      milestoneId: p1M2.id,
      title: 'Fix Concurrent Assignee Race Condition in Task Update',
      description:
        'Add row-level locking on task assignee mutations to eliminate duplicate primary key collision under heavy concurrency.',
      priorityCode: 'URGENT',
      dueAt: relDate(-1, 15, 0), // OVERDUE (yesterday)
      manualProgress: 100,
      requiresApproval: true,
      approverProjectMembershipId: p1Pm.id,
      creatorProjectMembershipId: p1Dev.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t1_8.id,
      projectMembershipId: p1Dev.id,
      organizationId: organization.id,
      projectId: project1.id,
      assignedByProjectMembershipId: p1Pm.id,
      assignedAt: relDate(-3),
    }),
  );
  await approvalRepo.save(
    approvalRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      taskId: t1_8.id,
      requestNumber: 1,
      requestedByMembershipId: devMembership.id,
      approverProjectMembershipId: p1Pm.id,
      state: ApprovalRequestState.PENDING,
      requestReason:
        'High priority patch! Stress tests verified 500 concurrent assignee updates without deadlock.',
      resolutionReason: null,
      resolvedByMembershipId: null,
      requestedAt: relDate(-1, 14, 0),
      resolvedAt: null,
    }),
  );

  // Task 1.9 & 1.10: COMPLETED Tasks (Approved)
  const t1_9 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      owningTeamId: engineeringTeam.id,
      statusId: p1Workflow.sCompleted.id,
      milestoneId: p1M1.id,
      title: 'Implement PostgreSQL schema migrations and audit triggers',
      description:
        'Set up TypeORM migrations from clean database with immutable audit logs.',
      priorityCode: 'HIGH',
      dueAt: relDate(-16),
      manualProgress: 100,
      requiresApproval: true,
      approverProjectMembershipId: p1Owner.id,
      creatorProjectMembershipId: p1Owner.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t1_9.id,
      projectMembershipId: p1Dev.id,
      organizationId: organization.id,
      projectId: project1.id,
      assignedByProjectMembershipId: p1Owner.id,
      assignedAt: relDate(-20),
    }),
  );
  await approvalRepo.save(
    approvalRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      taskId: t1_9.id,
      requestNumber: 1,
      requestedByMembershipId: devMembership.id,
      approverProjectMembershipId: p1Owner.id,
      state: ApprovalRequestState.APPROVED,
      requestReason: 'All migration integration tests passed successfully.',
      resolutionReason: 'Approved. Migrations verified against clean database.',
      resolvedByMembershipId: ownerMembership.id,
      requestedAt: relDate(-16, 14, 0),
      resolvedAt: relDate(-16, 16, 30),
    }),
  );

  const t1_10 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      owningTeamId: engineeringTeam.id,
      statusId: p1Workflow.sCompleted.id,
      milestoneId: p1M2.id,
      title: 'Build Task Approval Queue and Atomic Transitions',
      description:
        'Implement atomic state resolution and approval request workflow in PostgreSQL.',
      priorityCode: 'URGENT',
      dueAt: relDate(-6),
      manualProgress: 100,
      requiresApproval: true,
      approverProjectMembershipId: p1Pm.id,
      creatorProjectMembershipId: p1Pm.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t1_10.id,
      projectMembershipId: p1Dev.id,
      organizationId: organization.id,
      projectId: project1.id,
      assignedByProjectMembershipId: p1Pm.id,
      assignedAt: relDate(-10),
    }),
  );
  await approvalRepo.save(
    approvalRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      taskId: t1_10.id,
      requestNumber: 1,
      requestedByMembershipId: devMembership.id,
      approverProjectMembershipId: p1Pm.id,
      state: ApprovalRequestState.APPROVED,
      requestReason: 'Approval queue queries and atomic transitions verified.',
      resolutionReason: 'LGTM. Atomic transition prevents completion bypass.',
      resolvedByMembershipId: pmMembership.id,
      requestedAt: relDate(-6, 10, 0),
      resolvedAt: relDate(-6, 15, 0),
    }),
  );

  // 7. Seed Project 2: Customer Mobile Companion App
  log('📁 Creating Project 2: Customer Mobile Companion App...');
  const project2 = await projectRepo.save(
    projectRepo.create({
      organizationId: organization.id,
      name: 'Customer Mobile Companion App',
      description:
        'Cross-platform mobile client for iOS and Android built with React Native and Tailwind CSS. Features offline SQLite task caching, real-time push notifications, and quick task status transitions.',
      state: ProjectState.ACTIVE,
      startDate: relDateString(-30),
      dueDate: relDateString(90),
      createdByMembershipId: pmMembership.id,
    }),
  );

  await projectTeamRepo.save(
    projectTeamRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      teamId: productTeam.id,
      addedByMembershipId: pmMembership.id,
      addedAt: new Date('2026-08-15T00:00:00Z'),
    }),
  );
  await projectTeamRepo.save(
    projectTeamRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      teamId: engineeringTeam.id,
      addedByMembershipId: pmMembership.id,
      addedAt: new Date('2026-08-15T00:00:00Z'),
    }),
  );

  const p2Pm = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      organizationMembershipId: pmMembership.id,
      role: ProjectRole.PROJECT_MANAGER,
      addedAt: new Date('2026-08-15T00:00:00Z'),
    }),
  );
  const p2Designer = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      organizationMembershipId: designerMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date('2026-08-15T00:00:00Z'),
    }),
  );
  const p2Fullstack = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      organizationMembershipId: fullstackMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date('2026-08-15T00:00:00Z'),
    }),
  );
  const p2Qa = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      organizationMembershipId: qaMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date('2026-08-15T00:00:00Z'),
    }),
  );

  const p2Workflow = await initProjectWorkflow(project2.id);

  // Milestones Project 2
  const p2M1 = await milestoneRepo.save(
    milestoneRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      name: 'Mobile MVP & Navigation Wireframes',
      description:
        'Deliver high-fidelity Figma components and initial navigation flow.',
      statusCode: MilestoneStatusCode.CLOSED,
      dueDate: relDateString(-10),
      closedAt: relDate(-10),
    }),
  );
  const p2M2 = await milestoneRepo.save(
    milestoneRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      name: 'Offline SQLite Cache & Sync Protocol',
      description:
        'Implement local mutation queue and conflict resolution algorithm.',
      statusCode: MilestoneStatusCode.OPEN,
      dueDate: relDateString(2), // In 2 days! (shows up in 7-day schedule!)
      closedAt: null,
    }),
  );

  // Documents Project 2
  await docRepo.save(
    docRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      title: 'Mobile Architecture & Offline Sync Protocol',
      content: `### Mobile Client Architecture
- Local DB: WatermelonDB / SQLite for fast offline queries.
- Sync strategy: Timestamp-based change tracking with server-wins conflict resolution.
- Auth: Secure enclave storage for refresh tokens with biometric unlocking.`,
      authorProjectMembershipId: p2Fullstack.id,
      lastEditedByProjectMembershipId: p2Fullstack.id,
    }),
  );

  // Risks Project 2
  await riskRepo.save(
    riskRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      title: 'Apple App Store Review Guidelines Compliance',
      description:
        'In-app account deletion and privacy policy disclosures required for review.',
      likelihoodCode: RiskScaleCode.HIGH,
      impactCode: RiskScaleCode.HIGH,
      state: RiskState.OPEN,
      ownerProjectMembershipId: p2Pm.id,
      mitigation:
        'Implement dedicated Delete Account self-service flow in settings before submission.',
    }),
  );

  // Tasks Project 2
  // Task 2.1: DUE TODAY - MEDIUM - In Progress
  const t2_1 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      owningTeamId: productTeam.id,
      statusId: p2Workflow.sInProgress.id,
      milestoneId: p2M2.id,
      title: 'Implement Offline Task Creation & Sync Queue',
      description:
        'Queue task mutations in SQLite when device is offline and replay requests upon network reconnection.',
      priorityCode: 'MEDIUM',
      dueAt: relDate(0, 19, 0), // TODAY
      manualProgress: 55,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: p2Pm.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t2_1.id,
      projectMembershipId: p2Fullstack.id,
      organizationId: organization.id,
      projectId: project2.id,
      assignedByProjectMembershipId: p2Pm.id,
      assignedAt: relDate(-3),
    }),
  );

  // Task 2.2: DUE IN 1 DAY (+1 day) - URGENT - To Do
  const t2_2 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      owningTeamId: productTeam.id,
      statusId: p2Workflow.sTodo.id,
      milestoneId: p2M2.id,
      title: 'Biometric Authentication (Face ID / Fingerprint)',
      description:
        'Protect app unlock with react-native-keychain and hardware biometric verification.',
      priorityCode: 'URGENT',
      dueAt: relDate(1, 14, 0), // TOMORROW
      manualProgress: 0,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: p2Fullstack.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t2_2.id,
      projectMembershipId: p2Fullstack.id,
      organizationId: organization.id,
      projectId: project2.id,
      assignedByProjectMembershipId: p2Pm.id,
      assignedAt: relDate(0),
    }),
  );

  // Task 2.3: DUE IN 2 DAYS (+2 days) - HIGH - In Review (PENDING Approval)
  const t2_3 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      owningTeamId: productTeam.id,
      statusId: p2Workflow.sInReview.id,
      milestoneId: p2M2.id,
      title: 'Push Notification Integration via Firebase Cloud Messaging',
      description:
        'Deliver background push notifications on task assignments, mentions, and approval requests.',
      priorityCode: 'HIGH',
      dueAt: relDate(2, 16, 0), // +2 days
      manualProgress: 100,
      requiresApproval: true,
      approverProjectMembershipId: p2Pm.id,
      creatorProjectMembershipId: p2Fullstack.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t2_3.id,
      projectMembershipId: p2Fullstack.id,
      organizationId: organization.id,
      projectId: project2.id,
      assignedByProjectMembershipId: p2Pm.id,
      assignedAt: relDate(-2),
    }),
  );
  await approvalRepo.save(
    approvalRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      taskId: t2_3.id,
      requestNumber: 1,
      requestedByMembershipId: fullstackMembership.id,
      approverProjectMembershipId: p2Pm.id,
      state: ApprovalRequestState.PENDING,
      requestReason:
        'Push notifications verified on both iOS Simulator (APNs sandbox) and Android Emulator (FCM).',
      resolutionReason: null,
      resolvedByMembershipId: null,
      requestedAt: relDate(0, 11, 0),
      resolvedAt: null,
    }),
  );

  // Task 2.4: DUE IN 3 DAYS (+3 days) - LOW - To Do
  const t2_4 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      owningTeamId: productTeam.id,
      statusId: p2Workflow.sTodo.id,
      milestoneId: p2M2.id,
      title: 'Haptic Feedback on Task Completion Gesture',
      description:
        'Add satisfying tactile haptic feedback when swiping a task to Complete on the mobile kanban.',
      priorityCode: 'LOW',
      dueAt: relDate(3, 17, 0), // +3 days
      manualProgress: 0,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: p2Designer.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t2_4.id,
      projectMembershipId: p2Qa.id,
      organizationId: organization.id,
      projectId: project2.id,
      assignedByProjectMembershipId: p2Pm.id,
      assignedAt: relDate(0),
    }),
  );

  // Task 2.5: COMPLETED
  const t2_5 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      owningTeamId: productTeam.id,
      statusId: p2Workflow.sCompleted.id,
      milestoneId: p2M1.id,
      title: 'Figma UI Kit & Tailwind React Native Theme Export',
      description:
        'Create matching mobile design system tokens for dark and light modes.',
      priorityCode: 'MEDIUM',
      dueAt: relDate(-10),
      manualProgress: 100,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: p2Designer.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t2_5.id,
      projectMembershipId: p2Designer.id,
      organizationId: organization.id,
      projectId: project2.id,
      assignedByProjectMembershipId: p2Pm.id,
      assignedAt: relDate(-15),
    }),
  );

  // 8. Seed Project 3: Marketing Website & Developer Portal
  log('📁 Creating Project 3: Marketing Website & Developer Portal...');
  const project3 = await projectRepo.save(
    projectRepo.create({
      organizationId: organization.id,
      name: 'Developer Portal & Public Documentation',
      description:
        'Interactive developer portal featuring OpenAPI documentation, API key management, interactive playground, and portfolio showcase.',
      state: ProjectState.ACTIVE,
      startDate: relDateString(-20),
      dueDate: relDateString(45),
      createdByMembershipId: ownerMembership.id,
    }),
  );

  await projectTeamRepo.save(
    projectTeamRepo.create({
      organizationId: organization.id,
      projectId: project3.id,
      teamId: devopsTeam.id,
      addedByMembershipId: ownerMembership.id,
      addedAt: new Date('2026-09-01T00:00:00Z'),
    }),
  );

  const p3Owner = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project3.id,
      organizationMembershipId: ownerMembership.id,
      role: ProjectRole.PROJECT_MANAGER,
      addedAt: new Date('2026-09-01T00:00:00Z'),
    }),
  );
  const p3Dev = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project3.id,
      organizationMembershipId: devMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date('2026-09-01T00:00:00Z'),
    }),
  );
  const p3Qa = await projectMemberRepo.save(
    projectMemberRepo.create({
      organizationId: organization.id,
      projectId: project3.id,
      organizationMembershipId: qaMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date('2026-09-01T00:00:00Z'),
    }),
  );

  const p3Workflow = await initProjectWorkflow(project3.id);

  // Project 3 Tasks
  // Task 3.1: DUE IN 1 DAY (+1 day) - MEDIUM - In Progress
  const t3_1 = await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project3.id,
      owningTeamId: devopsTeam.id,
      statusId: p3Workflow.sInProgress.id,
      milestoneId: null,
      title: 'Embed Swagger / OpenAPI Interactive Explorer',
      description:
        'Integrate @nestjs/swagger document generator with custom theme matching TaskForge branding.',
      priorityCode: 'MEDIUM',
      dueAt: relDate(1, 15, 0), // TOMORROW
      manualProgress: 65,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: p3Owner.id,
    }),
  );
  await assigneeRepo.save(
    assigneeRepo.create({
      taskId: t3_1.id,
      projectMembershipId: p3Dev.id,
      organizationId: organization.id,
      projectId: project3.id,
      assignedByProjectMembershipId: p3Owner.id,
      assignedAt: relDate(-1),
    }),
  );

  // Task 3.2: DUE IN 4 DAYS (+4 days) - LOW - To Do
  await taskRepo.save(
    taskRepo.create({
      organizationId: organization.id,
      projectId: project3.id,
      owningTeamId: devopsTeam.id,
      statusId: p3Workflow.sTodo.id,
      milestoneId: null,
      title: 'Setup Automated Lighthouse CI Performance Audits',
      description:
        'Ensure 95+ score on Performance, Accessibility, Best Practices, and SEO.',
      priorityCode: 'LOW',
      dueAt: relDate(4, 16, 0), // +4 days
      manualProgress: 0,
      requiresApproval: false,
      approverProjectMembershipId: null,
      creatorProjectMembershipId: p3Qa.id,
    }),
  );

  // 9. Timeline Activity Feed
  log('⚡ Creating rich timeline activity entries...');
  await activityRepo.save(
    activityRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      actorMembershipId: ownerMembership.id,
      actionCode: 'PROJECT_CREATED',
      subjectType: 'PROJECT',
      subjectId: project1.id,
      safeMetadata: { projectName: project1.name },
      occurredAt: relDate(-45),
    }),
  );
  await activityRepo.save(
    activityRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      actorMembershipId: fullstackMembership.id,
      actionCode: 'APPROVAL_REQUESTED',
      subjectType: 'TASK',
      subjectId: t1_2.id,
      safeMetadata: { taskTitle: t1_2.title, requestNumber: 1 },
      occurredAt: relDate(0, 9, 30),
    }),
  );
  await activityRepo.save(
    activityRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      actorMembershipId: devMembership.id,
      actionCode: 'APPROVAL_REQUESTED',
      subjectType: 'TASK',
      subjectId: t1_8.id,
      safeMetadata: { taskTitle: t1_8.title, requestNumber: 1 },
      occurredAt: relDate(-1, 14, 0),
    }),
  );
  await activityRepo.save(
    activityRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      actorMembershipId: fullstackMembership.id,
      actionCode: 'APPROVAL_REQUESTED',
      subjectType: 'TASK',
      subjectId: t2_3.id,
      safeMetadata: { taskTitle: t2_3.title, requestNumber: 1 },
      occurredAt: relDate(0, 11, 0),
    }),
  );

  // 10. Seed Notifications
  log(
    '🔔 Creating in-app notifications for pending approvals and assignments...',
  );
  await notifRepo.save(
    notifRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      recipientUserId: ownerUser.id,
      typeCode: 'TASK_APPROVAL_REQUESTED',
      resourceType: 'TASK',
      resourceId: t1_2.id,
      deliveryStateCode: 'DELIVERED',
      safePayload: {
        taskTitle: t1_2.title,
        projectName: project1.name,
        requestedByName: fullstackUser.name,
        message: `${fullstackUser.name} requested approval for task "${t1_2.title}"`,
      },
      readAt: null,
      deliveredAt: relDate(0, 9, 30),
    }),
  );

  await notifRepo.save(
    notifRepo.create({
      organizationId: organization.id,
      projectId: project1.id,
      recipientUserId: pmUser.id,
      typeCode: 'TASK_APPROVAL_REQUESTED',
      resourceType: 'TASK',
      resourceId: t1_8.id,
      deliveryStateCode: 'DELIVERED',
      safePayload: {
        taskTitle: t1_8.title,
        projectName: project1.name,
        requestedByName: devUser.name,
        message: `${devUser.name} requested approval for task "${t1_8.title}"`,
      },
      readAt: null,
      deliveredAt: relDate(-1, 14, 0),
    }),
  );

  await notifRepo.save(
    notifRepo.create({
      organizationId: organization.id,
      projectId: project2.id,
      recipientUserId: pmUser.id,
      typeCode: 'TASK_APPROVAL_REQUESTED',
      resourceType: 'TASK',
      resourceId: t2_3.id,
      deliveryStateCode: 'DELIVERED',
      safePayload: {
        taskTitle: t2_3.title,
        projectName: project2.name,
        requestedByName: fullstackUser.name,
        message: `${fullstackUser.name} requested approval for task "${t2_3.title}"`,
      },
      readAt: null,
      deliveredAt: relDate(0, 11, 0),
    }),
  );

  log('✅ Rich portfolio seed completed successfully!\n');
  log('================================================================');
  log('🎉 TaskForge Rich Portfolio Dataset Ready');
  log('----------------------------------------------------------------');
  log('Organization : Acme Cloud Technologies');
  log('Projects (3) :');
  log('  1. TaskForge Multi-tenant SaaS v0.3 (Platform Engineering)');
  log('  2. Customer Mobile Companion App (iOS & Android)');
  log('  3. Developer Portal & Public Documentation (OpenAPI & Docs)');
  log('----------------------------------------------------------------');
  log('Demo User Accounts (Password for all: Password123!):');
  log('  1. owner@taskforge.dev     (Alex Morgan)    - Organization Owner');
  log(
    '  2. pm@taskforge.dev        (Taylor Swift)   - Organization Admin / PM',
  );
  log(
    '  3. dev@taskforge.dev       (Jordan Lee)     - Senior Backend Engineer',
  );
  log('  4. designer@taskforge.dev  (Morgan Chen)    - Lead Product Designer');
  log(
    '  5. fullstack@taskforge.dev (Sam Rivera)     - Senior Fullstack Engineer',
  );
  log(
    '  6. qa@taskforge.dev        (Elena Rostova)  - QA & Site Reliability Engineer',
  );
  log('================================================================');

  return {
    organization,
    projects: [project1, project2, project3],
    users: [ownerUser, pmUser, devUser, designerUser, fullstackUser, qaUser],
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
        await runRichPortfolioSeed(dataSource);
        await dataSource.destroy();
        process.exit(0);
      } catch (err: unknown) {
        console.error(
          '❌ Rich seeding failed:',
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
