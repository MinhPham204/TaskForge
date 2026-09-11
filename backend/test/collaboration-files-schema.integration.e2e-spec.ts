import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { PostgresMilestoneService } from '../src/modules/projects/application/milestone.service';
import { OrganizationMembershipEntity, TeamEntity, UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { ProjectEntity, ProjectMembershipEntity, ProjectModuleCode, ProjectModuleSettingEntity, ProjectRole, ProjectState, ProjectTaskStatusEntity, ProjectTeamEntity, TaskStatusSemanticCategory } from '../src/modules/projects/persistence/typeorm/project.entities';
import { TaskEntity } from '../src/modules/task/persistence/typeorm/task.entities';
import { ActivityEntryEntity, AuditLogEntity, NotificationEntity, ProjectFileEntity, StoredFileEntity, TaskAttachmentEntity } from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';
import { DocumentEntity, MilestoneEntity, MilestoneStatusCode, RiskEntity, RiskScaleCode, RiskState, RiskTaskLinkEntity } from '../src/modules/projects/persistence/typeorm/optional-module.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import { redactAuditData, writePostgresAudit } from '../src/modules/collaboration/application/audit.writer';

describe('PostgreSQL collaboration and files schema integration', () => {
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let milestones: PostgresMilestoneService;
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PostgresOnboardingTestModule] }).compile();
    dataSource = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    milestones = module.get(PostgresMilestoneService);
  });

  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(`
      TRUNCATE TABLE notifications, audit_logs, activity_entries, risk_task_links,
        risks, documents, project_files,
        milestones,
        task_attachments, stored_files, comments, task_approval_requests,
        task_checklist_items, task_assignees, tasks, project_module_settings,
        project_task_statuses, project_memberships, project_teams, team_members,
        organization_invitations, organization_memberships, teams, organizations,
        users RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => dataSource.destroy());

  it('enforces same-tenant and same-project file relations plus storage checks', async () => {
    const first = await fixture('first');
    const second = await fixture('second');
    const files = dataSource.getRepository(StoredFileEntity);
    const stored = await files.save(fileValues(first));

    await expect(files.insert({ ...fileValues(first), objectKey: `negative-${sequence}`, sizeBytes: '-1' })).rejects.toThrow();

    await expect(dataSource.getRepository(TaskAttachmentEntity).insert({
      organizationId: first.organizationId,
      projectId: first.projectId,
      taskId: second.taskId,
      storedFileId: stored.id,
      attachedByProjectMembershipId: first.projectMembershipId,
      removedAt: null,
    })).rejects.toThrow();

    await expect(dataSource.getRepository(ProjectFileEntity).insert({
      organizationId: first.organizationId,
      projectId: first.projectId,
      storedFileId: stored.id,
      addedByProjectMembershipId: second.projectMembershipId,
      displayName: null,
      removedAt: null,
    })).rejects.toThrow();
  });

  it('enforces activity/audit tenant context and notification deduplication', async () => {
    const first = await fixture('activity-first');
    const second = await fixture('activity-second');

    await expect(dataSource.getRepository(ActivityEntryEntity).insert({
      organizationId: first.organizationId,
      projectId: first.projectId,
      actorMembershipId: second.organizationMembershipId,
      actionCode: 'TASK_CREATED',
      subjectType: 'TASK',
      subjectId: first.taskId,
      safeMetadata: {},
      sourceEventId: null,
      occurredAt: new Date(),
    })).rejects.toThrow();

    await expect(dataSource.getRepository(AuditLogEntity).insert({
      organizationId: null,
      projectId: first.projectId,
      actorUserId: first.userId,
      actorMembershipId: null,
      actionCode: 'PROJECT_READ',
      targetType: 'PROJECT',
      targetId: first.projectId,
      outcomeCode: 'SUCCESS',
      reason: null,
      beforeData: null,
      afterData: null,
      correlationId: null,
      occurredAt: new Date(),
    })).rejects.toThrow();

    const notifications = dataSource.getRepository(NotificationEntity);
    const notification = {
      organizationId: first.organizationId,
      projectId: first.projectId,
      recipientUserId: first.userId,
      typeCode: 'TASK_ASSIGNED',
      resourceType: 'TASK',
      resourceId: first.taskId,
      safePayload: {},
      deliveryStateCode: 'PENDING',
      deduplicationKey: 'task-assigned-1',
      readAt: null,
      deliveredAt: null,
      failedAt: null,
      expiresAt: null,
    };
    await notifications.insert(notification);
    await expect(notifications.insert(notification)).rejects.toThrow();
  });

  it('enforces optional module vocabulary and same-project resource links', async () => {
    const first = await fixture('optional-first');
    const second = await fixture('optional-second');
    const milestones = dataSource.getRepository(MilestoneEntity);
    const milestone = await milestones.save({
      organizationId: first.organizationId,
      projectId: first.projectId,
      name: 'Launch',
      description: '',
      statusCode: MilestoneStatusCode.OPEN,
      dueDate: '2026-12-01',
      closedAt: null,
      archivedAt: null,
    });

    await expect(dataSource.query(`INSERT INTO milestones (organization_id, project_id, name, description, status_code, due_date, closed_at) VALUES ($1, $2, 'bad', '', 'INVALID', '2026-12-01', NULL)`, [first.organizationId, first.projectId])).rejects.toThrow();
    await expect(dataSource.query(`INSERT INTO milestones (organization_id, project_id, name, description, status_code, due_date, closed_at) VALUES ($1, $2, 'bad close', '', 'CLOSED', '2026-12-01', NULL)`, [first.organizationId, first.projectId])).rejects.toThrow();

    await dataSource.getRepository(TaskEntity).update(first.taskId, { milestoneId: milestone.id });
    await expect(dataSource.getRepository(TaskEntity).update(second.taskId, { milestoneId: milestone.id })).rejects.toThrow();

    await expect(dataSource.getRepository(DocumentEntity).insert({
      organizationId: first.organizationId,
      projectId: first.projectId,
      title: 'Cross-project author',
      content: 'content',
      authorProjectMembershipId: second.projectMembershipId,
      lastEditedByProjectMembershipId: second.projectMembershipId,
      archivedAt: null,
    })).rejects.toThrow();

    await expect(dataSource.getRepository(RiskEntity).insert({
      organizationId: first.organizationId,
      projectId: first.projectId,
      title: 'Cross-project owner',
      description: '',
      likelihoodCode: RiskScaleCode.LOW,
      impactCode: RiskScaleCode.HIGH,
      ownerProjectMembershipId: second.projectMembershipId,
      mitigation: '',
      state: RiskState.OPEN,
      archivedAt: null,
    })).rejects.toThrow();

    const risk = await dataSource.getRepository(RiskEntity).save({
      organizationId: first.organizationId,
      projectId: first.projectId,
      title: 'Capacity risk',
      description: '',
      likelihoodCode: RiskScaleCode.MEDIUM,
      impactCode: RiskScaleCode.HIGH,
      ownerProjectMembershipId: first.projectMembershipId,
      mitigation: '',
      state: RiskState.OPEN,
      archivedAt: null,
    });
    await expect(dataSource.query(`UPDATE risks SET impact_code = 'INVALID' WHERE id = $1`, [risk.id])).rejects.toThrow();
    await expect(dataSource.getRepository(RiskTaskLinkEntity).insert({
      organizationId: first.organizationId,
      projectId: first.projectId,
      riskId: risk.id,
      taskId: second.taskId,
    })).rejects.toThrow();
  });

  it('keeps Milestone close explicit and aggregates linked Task progress', async () => {
    const first = await fixture('milestone-lifecycle');
    await dataSource.getRepository(ProjectModuleSettingEntity).insert({ organizationId: first.organizationId, projectId: first.projectId, moduleCode: ProjectModuleCode.MILESTONES, enabled: true, version: '0' });
    const actor = { organizationId: first.organizationId, membershipId: first.organizationMembershipId };
    const milestone = await milestones.create(actor, first.projectId, { name: 'Release', dueDate: '2026-12-01' });
    await dataSource.getRepository(TaskEntity).update(first.taskId, { milestoneId: milestone.id, manualProgress: 60 });
    const listed = await milestones.list(actor, first.projectId);
    expect(listed).toEqual(expect.arrayContaining([expect.objectContaining({ id: milestone.id, progress: { taskCount: 1, percent: 60 } })]));
    await milestones.close(actor, first.projectId, milestone.id);
    await expect(milestones.update(actor, first.projectId, milestone.id, { name: 'Changed' })).rejects.toThrow('Reopen');
    await milestones.reopen(actor, first.projectId, milestone.id);
    await expect(milestones.update(actor, first.projectId, milestone.id, { name: 'Changed' })).resolves.toEqual(expect.objectContaining({ name: 'Changed', statusCode: 'OPEN' }));
  });

  it('persists only redacted append-only audit records in their tenant scope', async () => {
    const first = await fixture('audit-first');
    const second = await fixture('audit-second');
    const redacted = redactAuditData({ password: 'plain-text', nested: { refreshToken: 'token-value', visible: 'safe' } });
    expect(redacted).toEqual({ password: '[REDACTED]', nested: { refreshToken: '[REDACTED]', visible: 'safe' } });

    const audit = await dataSource.transaction(async (manager) => {
      await writePostgresAudit(manager, {
        organizationId: first.organizationId,
        projectId: first.projectId,
        actorUserId: first.userId,
        actorMembershipId: first.organizationMembershipId,
        actionCode: 'AUTH_LOGIN_SUCCEEDED',
        targetType: 'USER',
        targetId: first.userId,
        afterData: { password: 'plain-text', nested: { refreshToken: 'token-value', visible: 'safe' } },
      });
      return manager.getRepository(AuditLogEntity).findOneByOrFail({ actionCode: 'AUTH_LOGIN_SUCCEEDED' });
    });
    expect(audit.afterData).toEqual(redacted);
    expect(JSON.stringify(audit)).not.toContain('plain-text');
    expect(JSON.stringify(audit)).not.toContain('token-value');

    await expect(dataSource.getRepository(AuditLogEntity).insert({
      organizationId: first.organizationId,
      projectId: first.projectId,
      actorUserId: first.userId,
      actorMembershipId: second.organizationMembershipId,
      actionCode: 'PROJECT_ARCHIVE',
      targetType: 'PROJECT',
      targetId: first.projectId,
      outcomeCode: 'SUCCESS',
      reason: null,
      beforeData: null,
      afterData: null,
      correlationId: null,
      occurredAt: new Date(),
    })).rejects.toThrow();

    audit.reason = 'tampered';
    await expect(dataSource.getRepository(AuditLogEntity).save(audit)).rejects.toThrow('append-only');
    await expect(dataSource.getRepository(AuditLogEntity).remove(audit)).rejects.toThrow('append-only');
  });

  async function fixture(prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`, name: prefix, passwordHash: 'test-only-password-hash',
      profileImageUrl: null, emailVerifiedAt: new Date(), refreshTokenHash: null, disabledAt: null,
    });
    const workspace = await onboarding.createOrganization(user.id, { name: `${prefix} workspace` });
    const team = await dataSource.getRepository(TeamEntity).findOneByOrFail({ id: workspace.generalTeamId });
    const project = await dataSource.getRepository(ProjectEntity).save({
      organizationId: workspace.organizationId, name: `${prefix} project`, description: '', state: ProjectState.DRAFT,
      startDate: null, dueDate: null, createdByMembershipId: workspace.membershipId, completedAt: null, archivedAt: null, version: '0',
    });
    await dataSource.getRepository(ProjectTeamEntity).insert({
      organizationId: workspace.organizationId, projectId: project.id, teamId: team.id,
      addedByMembershipId: workspace.membershipId, addedAt: new Date(), removedAt: null,
    });
    const projectMembership = await dataSource.getRepository(ProjectMembershipEntity).save({
      organizationId: workspace.organizationId, projectId: project.id, organizationMembershipId: workspace.membershipId,
      role: ProjectRole.PROJECT_MANAGER, addedAt: new Date(), removedAt: null,
    });
    const status = await dataSource.getRepository(ProjectTaskStatusEntity).save({
      organizationId: workspace.organizationId, projectId: project.id, name: 'To do',
      semanticCategory: TaskStatusSemanticCategory.NOT_STARTED, position: 0, archivedAt: null, version: '0',
    });
    const task = await dataSource.getRepository(TaskEntity).save({
      organizationId: workspace.organizationId, projectId: project.id, owningTeamId: team.id, statusId: status.id,
      creatorProjectMembershipId: projectMembership.id, milestoneId: null, title: 'Schema task', description: '',
      priorityCode: 'MEDIUM', dueAt: null, manualProgress: 0, requiresApproval: false,
      approverProjectMembershipId: null, version: '0', archivedAt: null,
    });
    const membership = await dataSource.getRepository(OrganizationMembershipEntity).findOneByOrFail({ id: workspace.membershipId });
    return { organizationId: workspace.organizationId, organizationMembershipId: membership.id, projectId: project.id, projectMembershipId: projectMembership.id, taskId: task.id, userId: user.id };
  }

  function fileValues(fixtureData: Awaited<ReturnType<typeof fixture>>) {
    return {
      organizationId: fixtureData.organizationId, storageProviderCode: 'local-test', objectKey: `object-${sequence}-${fixtureData.userId}`,
      originalName: 'evidence.txt', mediaType: 'text/plain', sizeBytes: '12', checksumSha256: null,
      uploadedByMembershipId: fixtureData.organizationMembershipId, deletedAt: null,
    };
  }
});
