import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
} from '../../onboarding/persistence/typeorm/onboarding.entities';
import { ProjectMembershipEntity } from '../../projects/persistence/typeorm/project.entities';
import { NotificationEntity } from '../persistence/typeorm/collaboration.entities';
import { PostgresNotificationRepository } from '../persistence/typeorm/collaboration.repositories';

export interface PostgresNotificationActor {
  organizationId: string;
  membershipId: string;
}

export interface CreatePostgresNotificationInput {
  recipientUserId: string;
  projectId?: string | null;
  typeCode: string;
  resourceType?: string | null;
  resourceId?: string | null;
  safePayload?: Record<string, unknown>;
  deduplicationKey?: string | null;
  expiresAt?: Date | null;
}

/**
 * In-app inbox persistence. Producers call createForRecipient from their own
 * transaction; recipient eligibility is checked again at creation time.
 */
export class PostgresNotificationService {
  constructor(private readonly transactions: PostgresTransactionRunner) {}

  createForRecipient(
    organizationId: string,
    input: CreatePostgresNotificationInput,
  ): Promise<NotificationEntity | null> {
    return this.transactions.run(async (manager) => {
      const recipient = await this.requireEligibleRecipient(
        manager,
        organizationId,
        input.recipientUserId,
        input.projectId ?? null,
      );
      if (!recipient) return null;

      const notifications = new PostgresNotificationRepository(manager);
      const notification = notifications.create({
        organizationId,
        projectId: input.projectId ?? null,
        recipientUserId: input.recipientUserId,
        typeCode: input.typeCode,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        safePayload: input.safePayload ?? {},
        deliveryStateCode: 'IN_APP',
        deduplicationKey: input.deduplicationKey ?? null,
        readAt: null,
        deliveredAt: new Date(),
        failedAt: null,
        expiresAt: input.expiresAt ?? null,
      });
      try {
        return await notifications.save(notification);
      } catch (error) {
        if (isDeduplicationConflict(error)) return null;
        throw error;
      }
    });
  }

  listInbox(actor: PostgresNotificationActor): Promise<NotificationEntity[]> {
    return this.transactions.run(async (manager) => {
      const membership = await this.requireActiveMembership(manager, actor);
      return manager.getRepository(NotificationEntity).find({
        where: {
          organizationId: actor.organizationId,
          recipientUserId: membership.userId,
        },
        order: { readAt: 'ASC', createdAt: 'DESC' },
      });
    });
  }

  markRead(
    actor: PostgresNotificationActor,
    notificationId: string,
  ): Promise<NotificationEntity> {
    return this.setReadState(actor, notificationId, true);
  }

  markUnread(
    actor: PostgresNotificationActor,
    notificationId: string,
  ): Promise<NotificationEntity> {
    return this.setReadState(actor, notificationId, false);
  }

  private async setReadState(
    actor: PostgresNotificationActor,
    notificationId: string,
    read: boolean,
  ): Promise<NotificationEntity> {
    return this.transactions.run(async (manager) => {
      const membership = await this.requireActiveMembership(manager, actor);
      const notification = await manager.getRepository(NotificationEntity).findOne({
        where: {
          id: notificationId,
          organizationId: actor.organizationId,
          recipientUserId: membership.userId,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!notification) throw new NotFoundException('Notification not found');
      notification.readAt = read ? new Date() : null;
      return manager.getRepository(NotificationEntity).save(notification);
    });
  }

  private async requireActiveMembership(
    manager: EntityManager,
    actor: PostgresNotificationActor,
  ): Promise<OrganizationMembershipEntity> {
    const membership = await manager.getRepository(OrganizationMembershipEntity).findOneBy({
      id: actor.membershipId,
      organizationId: actor.organizationId,
      state: OrganizationMembershipState.ACTIVE,
    });
    if (!membership) throw new ForbiddenException('Active organization membership is required');
    return membership;
  }

  private async requireEligibleRecipient(
    manager: EntityManager,
    organizationId: string,
    recipientUserId: string,
    projectId: string | null,
  ): Promise<OrganizationMembershipEntity | null> {
    const membership = await manager.getRepository(OrganizationMembershipEntity).findOneBy({
      organizationId,
      userId: recipientUserId,
      state: OrganizationMembershipState.ACTIVE,
    });
    if (!membership) return null;
    if (!projectId) return membership;

    if (membership.role === OrganizationRole.OWNER || membership.role === OrganizationRole.ADMIN) {
      return membership;
    }
    const projectMembership = await manager.getRepository(ProjectMembershipEntity).findOneBy({
      organizationId,
      projectId,
      organizationMembershipId: membership.id,
      removedAt: IsNull(),
    });
    return projectMembership ? membership : null;
  }
}

function isDeduplicationConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}
