import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import { runPortfolioSeed } from '../src/database/seed/portfolio-seed';
import {
  OrganizationEntity,
  OrganizationMembershipEntity,
  TeamEntity,
  TeamMemberEntity,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import {
  ProjectEntity,
  ProjectMembershipEntity,
  ProjectModuleSettingEntity,
  ProjectTaskStatusEntity,
  ProjectTeamEntity,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import {
  DocumentEntity,
  MilestoneEntity,
  MilestoneStatusCode,
  RiskEntity,
} from '../src/modules/projects/persistence/typeorm/optional-module.entities';
import {
  ApprovalRequestEntity,
  ApprovalRequestState,
  CommentEntity,
  TaskAssigneeEntity,
  TaskChecklistItemEntity,
  TaskEntity,
} from '../src/modules/task/persistence/typeorm/task.entities';
import {
  ActivityEntryEntity,
  NotificationEntity,
} from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';

describe('PostgreSQL Deterministic Portfolio Seed Integration', () => {
  let db: DataSource;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    db = module.get(DataSource);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('safeguard rejects execution without explicit confirmation', async () => {
    const originalEnv = process.env.ALLOW_DEMO_SEED;
    delete process.env.ALLOW_DEMO_SEED;

    await expect(
      runPortfolioSeed(db, {
        confirmSeed: false,
        log: () => {},
      }),
    ).rejects.toThrow(/Refusing to seed database without explicit confirmation/);

    if (originalEnv !== undefined) {
      process.env.ALLOW_DEMO_SEED = originalEnv;
    }
  });

  it('safeguard rejects execution in production without ALLOW_PRODUCTION_DEMO_SEED', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevProdSeed = process.env.ALLOW_PRODUCTION_DEMO_SEED;

    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_PRODUCTION_DEMO_SEED;

    await expect(
      runPortfolioSeed(db, {
        confirmSeed: true,
        log: () => {},
      }),
    ).rejects.toThrow(/Target is configured as production/);

    process.env.NODE_ENV = prevNodeEnv;
    if (prevProdSeed !== undefined) {
      process.env.ALLOW_PRODUCTION_DEMO_SEED = prevProdSeed;
    }
  });

  it('populates deterministic portfolio accounts, workspace, project, tasks, approvals, and modules', async () => {
    const result = await runPortfolioSeed(db, {
      confirmSeed: true,
      log: () => {},
    });

    expect(result.organization).toBeDefined();
    expect(result.organization.name).toBe('Acme Cloud Technologies');
    expect(result.project).toBeDefined();
    expect(result.project.name).toBe('TaskForge Multi-tenant SaaS v0.3');

    const orgId = result.organization.id;
    const projectId = result.project.id;

    // Verify 4 users and hashed passwords
    const users = await db
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email IN (:...emails)', {
        emails: [
          'owner@taskforge.dev',
          'pm@taskforge.dev',
          'dev@taskforge.dev',
          'designer@taskforge.dev',
        ],
      })
      .getMany();
    expect(users).toHaveLength(4);
    for (const u of users) {
      expect(bcrypt.compareSync('Password123!', u.passwordHash)).toBe(true);
      expect(u.emailVerifiedAt).not.toBeNull();
    }

    // Verify 4 Organization Memberships
    const orgMemberships = await db
      .getRepository(OrganizationMembershipEntity)
      .find({ where: { organizationId: orgId } });
    expect(orgMemberships).toHaveLength(4);

    // Verify 3 Teams
    const teams = await db
      .getRepository(TeamEntity)
      .find({ where: { organizationId: orgId } });
    expect(teams).toHaveLength(3);
    const teamNames = teams.map((t) => t.name).sort();
    expect(teamNames).toEqual([
      'Core Platform Engineering',
      'General',
      'Product & Design',
    ]);

    // Verify Team Members
    const teamMembers = await db.getRepository(TeamMemberEntity).find();
    expect(teamMembers.length).toBeGreaterThanOrEqual(9);

    // Verify Project Teams & Memberships
    const projectTeams = await db
      .getRepository(ProjectTeamEntity)
      .find({ where: { projectId } });
    expect(projectTeams).toHaveLength(2);

    const projectMembers = await db
      .getRepository(ProjectMembershipEntity)
      .find({ where: { projectId } });
    expect(projectMembers).toHaveLength(4);

    // Verify 6 Configured Statuses
    const statuses = await db
      .getRepository(ProjectTaskStatusEntity)
      .find({ where: { projectId }, order: { position: 'ASC' } });
    expect(statuses).toHaveLength(6);
    expect(statuses.map((s) => s.name)).toEqual([
      'Backlog',
      'To Do',
      'In Progress',
      'In Review',
      'Completed',
      'Cancelled',
    ]);

    // Verify 4 Module Settings
    const moduleSettings = await db
      .getRepository(ProjectModuleSettingEntity)
      .find({ where: { projectId, enabled: true } });
    expect(moduleSettings).toHaveLength(4);

    // Verify 3 Milestones
    const milestones = await db
      .getRepository(MilestoneEntity)
      .find({ where: { projectId } });
    expect(milestones).toHaveLength(3);
    const closedMilestones = milestones.filter(
      (m) => m.statusCode === MilestoneStatusCode.CLOSED,
    );
    const openMilestones = milestones.filter(
      (m) => m.statusCode === MilestoneStatusCode.OPEN,
    );
    expect(closedMilestones).toHaveLength(2);
    expect(openMilestones).toHaveLength(1);

    // Verify 2 Documents
    const docs = await db
      .getRepository(DocumentEntity)
      .find({ where: { projectId } });
    expect(docs).toHaveLength(2);

    // Verify 2 Risks
    const risks = await db
      .getRepository(RiskEntity)
      .find({ where: { projectId } });
    expect(risks).toHaveLength(2);

    // Verify 6 Tasks
    const tasks = await db
      .getRepository(TaskEntity)
      .find({ where: { projectId } });
    expect(tasks).toHaveLength(6);

    // Verify Task Assignees and Checklists
    const assignees = await db
      .getRepository(TaskAssigneeEntity)
      .find({ where: { projectId } });
    expect(assignees.length).toBeGreaterThanOrEqual(4);

    const checklistItems = await db
      .getRepository(TaskChecklistItemEntity)
      .find({ where: { projectId } });
    expect(checklistItems.length).toBeGreaterThanOrEqual(9);

    // Verify Approval Requests (including PENDING review)
    const approvals = await db
      .getRepository(ApprovalRequestEntity)
      .find({ where: { projectId } });
    expect(approvals).toHaveLength(3);
    const pendingApprovals = approvals.filter(
      (a) => a.state === ApprovalRequestState.PENDING,
    );
    const approvedApprovals = approvals.filter(
      (a) => a.state === ApprovalRequestState.APPROVED,
    );
    expect(pendingApprovals).toHaveLength(1);
    expect(approvedApprovals).toHaveLength(2);

    // Verify Comments, Activities, and Notifications
    const comments = await db
      .getRepository(CommentEntity)
      .find({ where: { projectId } });
    expect(comments).toHaveLength(1);

    const activities = await db
      .getRepository(ActivityEntryEntity)
      .find({ where: { projectId } });
    expect(activities).toHaveLength(2);

    const notifications = await db
      .getRepository(NotificationEntity)
      .find({ where: { organizationId: orgId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].typeCode).toBe('TASK_APPROVAL_REQUESTED');
  });

  it('is idempotent: re-running seed cleans up prior demo org and recreates cleanly', async () => {
    // Run 1st time
    await runPortfolioSeed(db, {
      confirmSeed: true,
      log: () => {},
    });

    // Run 2nd time immediately
    const result2 = await runPortfolioSeed(db, {
      confirmSeed: true,
      log: () => {},
    });

    expect(result2.organization.name).toBe('Acme Cloud Technologies');

    // Counts should remain exactly as expected without duplicates
    const orgs = await db.getRepository(OrganizationEntity).find({
      where: { name: 'Acme Cloud Technologies' },
    });
    expect(orgs).toHaveLength(1);

    const projects = await db.getRepository(ProjectEntity).find({
      where: { organizationId: result2.organization.id },
    });
    expect(projects).toHaveLength(1);

    const tasks = await db.getRepository(TaskEntity).find({
      where: { organizationId: result2.organization.id },
    });
    expect(tasks).toHaveLength(6);

    const approvals = await db.getRepository(ApprovalRequestEntity).find({
      where: { organizationId: result2.organization.id },
    });
    expect(approvals).toHaveLength(3);
  });
});
