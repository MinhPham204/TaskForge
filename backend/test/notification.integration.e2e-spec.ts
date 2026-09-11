import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PostgresNotificationService } from '../src/modules/collaboration/application/notification.service';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import {
  ProjectMembershipEntity,
  ProjectRole,
} from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL in-app notification integration', () => {
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let notifications: PostgresNotificationService;
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PostgresOnboardingTestModule] }).compile();
    dataSource = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    projects = module.get(PostgresProjectService);
    notifications = module.get(PostgresNotificationService);
  });

  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(`
      TRUNCATE TABLE notifications, audit_logs, activity_entries, comments,
        task_approval_requests, task_checklist_items, task_assignees, tasks,
        project_module_settings, project_task_statuses, project_memberships,
        project_teams, team_members, organization_invitations,
        organization_memberships, teams, organizations, users RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => dataSource.destroy());

  it('delivers only to active recipients with the required Project relation and owns the read lifecycle', async () => {
    const owner = await workspace('owner');
    const otherTenant = await workspace('other');
    const project = await projects.create(
      { organizationId: owner.organizationId, membershipId: owner.membershipId },
      { name: 'Notification project' },
    );
    const participant = await user('participant');
    const inactive = await user('inactive');
    const outsideProject = await user('outside-project');

    const participantMembership = await addMembership(owner.organizationId, participant.id, OrganizationMembershipState.ACTIVE);
    await addMembership(owner.organizationId, inactive.id, OrganizationMembershipState.REVOKED);
    await addMembership(owner.organizationId, outsideProject.id, OrganizationMembershipState.ACTIVE);
    await dataSource.getRepository(ProjectMembershipEntity).save({
      organizationId: owner.organizationId,
      projectId: project.id,
      organizationMembershipId: participantMembership.id,
      role: ProjectRole.CONTRIBUTOR,
      addedAt: new Date(),
      removedAt: null,
    });

    const created = await notifications.createForRecipient(owner.organizationId, {
      recipientUserId: participant.id,
      projectId: project.id,
      typeCode: 'TASK_ASSIGNED',
      resourceType: 'TASK',
      safePayload: { taskTitle: 'Safe task title' },
      deduplicationKey: `assignment-${sequence}`,
    });
    expect(created).toEqual(expect.objectContaining({ deliveryStateCode: 'IN_APP', readAt: null }));
    await expect(notifications.createForRecipient(owner.organizationId, {
      recipientUserId: participant.id, projectId: project.id, typeCode: 'TASK_ASSIGNED', deduplicationKey: `assignment-${sequence}`,
    })).resolves.toBeNull();
    await expect(notifications.createForRecipient(owner.organizationId, {
      recipientUserId: inactive.id, projectId: project.id, typeCode: 'TASK_ASSIGNED',
    })).resolves.toBeNull();
    await expect(notifications.createForRecipient(owner.organizationId, {
      recipientUserId: outsideProject.id, projectId: project.id, typeCode: 'TASK_ASSIGNED',
    })).resolves.toBeNull();
    await expect(notifications.createForRecipient(owner.organizationId, {
      recipientUserId: otherTenant.userId, projectId: project.id, typeCode: 'TASK_ASSIGNED',
    })).resolves.toBeNull();

    const actor = { organizationId: owner.organizationId, membershipId: participantMembership.id };
    await expect(notifications.listInbox(actor)).resolves.toEqual([expect.objectContaining({ id: created?.id })]);
    await expect(notifications.markRead(actor, created!.id)).resolves.toEqual(expect.objectContaining({ readAt: expect.any(Date) }));
    await expect(notifications.markUnread(actor, created!.id)).resolves.toEqual(expect.objectContaining({ readAt: null }));
  });

  async function workspace(prefix: string) {
    const createdUser = await user(prefix);
    const createdWorkspace = await onboarding.createOrganization(createdUser.id, { name: `${prefix} workspace` });
    return { ...createdWorkspace, userId: createdUser.id };
  }

  function user(prefix: string) {
    return dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`, name: prefix, passwordHash: 'test-hash',
      profileImageUrl: null, emailVerifiedAt: new Date(), refreshTokenHash: null, disabledAt: null,
    });
  }

  function addMembership(organizationId: string, userId: string, state: OrganizationMembershipState) {
    return dataSource.getRepository(OrganizationMembershipEntity).save({
      organizationId, userId, role: OrganizationRole.MEMBER, state,
      joinedAt: new Date(), stateChangedAt: new Date(),
    });
  }
});
