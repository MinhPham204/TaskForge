import type { EntityManager } from 'typeorm';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
  UserPreferenceEntity,
} from '../../onboarding/persistence/typeorm/onboarding.entities';
import { ProjectMembershipEntity } from '../../projects/persistence/typeorm/project.entities';
import { NotificationEntity } from '../persistence/typeorm/collaboration.entities';
import { PostgresNotificationService } from './notification.service';

describe('PostgresNotificationService', () => {
  it('does not create an inbox record when the recipient opts out of in-app notifications', async () => {
    const notificationCreate = jest.fn();
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === OrganizationMembershipEntity) {
          return { findOneBy: jest.fn().mockResolvedValue({ userId: 'recipient-user' }) };
        }
        if (entity === UserPreferenceEntity) {
          return { findOneBy: jest.fn().mockResolvedValue({ inAppNotificationsEnabled: false }) };
        }
        if (entity === NotificationEntity) {
          return { create: notificationCreate, save: jest.fn() };
        }
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    const transactions = { run: async (work: (transactionManager: EntityManager) => Promise<unknown>) => work(manager) } as never;
    const service = new PostgresNotificationService(transactions);

    await expect(
      service.createForRecipient('organization-id', {
        recipientUserId: 'recipient-user',
        typeCode: 'RISK_CREATED',
      }),
    ).resolves.toBeNull();

    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it('does not expose a Task deep-link after the recipient loses Project visibility', async () => {
    const membership = {
      id: 'membership-id',
      organizationId: 'organization-id',
      userId: 'recipient-user',
      role: OrganizationRole.MEMBER,
      state: OrganizationMembershipState.ACTIVE,
    } as OrganizationMembershipEntity;
    const notification = {
      id: 'notification-id',
      organizationId: membership.organizationId,
      recipientUserId: membership.userId,
      projectId: 'project-id',
      resourceType: 'TASK',
      resourceId: 'task-id',
    } as NotificationEntity;
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === OrganizationMembershipEntity) {
          return { findOneBy: jest.fn().mockResolvedValue(membership) };
        }
        if (entity === NotificationEntity) {
          return { find: jest.fn().mockResolvedValue([notification]) };
        }
        if (entity === ProjectMembershipEntity) {
          return { findOneBy: jest.fn().mockResolvedValue(null) };
        }
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    const service = new PostgresNotificationService({
      run: async (work: (transactionManager: EntityManager) => Promise<unknown>) =>
        work(manager),
    } as never);

    await expect(
      service.listInbox({
        organizationId: membership.organizationId,
        membershipId: membership.id,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: notification.id, target: null }),
    ]);
  });
});
