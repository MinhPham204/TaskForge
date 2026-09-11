import { IsNull } from 'typeorm';
import type { DeepPartial, EntityManager } from 'typeorm';
import {
  InvitationState,
  OrganizationEntity,
  OrganizationInvitationEntity,
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  TeamEntity,
  TeamMemberEntity,
  UserEntity,
} from './onboarding.entities';
import type { OrganizationRole } from './onboarding.entities';

/**
 * These repositories are deliberately manager-scoped. P2 onboarding commands
 * will create them from the transaction manager so the Organization, owner
 * Membership, General Team, and TeamMember writes share one transaction.
 */
export class PostgresUserRepository {
  constructor(private readonly manager: EntityManager) {}

  findById(id: string): Promise<UserEntity | null> {
    return this.manager.getRepository(UserEntity).findOneBy({ id });
  }

  findByIdForUpdate(id: string): Promise<UserEntity | null> {
    return this.manager
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.id = :id', { id })
      .getOne();
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.manager.getRepository(UserEntity).findOneBy({ email });
  }

  findByEmailWithCredentials(email: string): Promise<UserEntity | null> {
    return this.manager
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .addSelect(['user.passwordHash', 'user.refreshTokenHash'])
      .where('user.email = :email', { email })
      .getOne();
  }

  findByIdWithRefreshTokenHash(id: string): Promise<UserEntity | null> {
    return this.manager
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .addSelect('user.refreshTokenHash')
      .where('user.id = :id', { id })
      .getOne();
  }

  create(values: DeepPartial<UserEntity>): UserEntity {
    return this.manager.getRepository(UserEntity).create(values);
  }

  save(user: UserEntity): Promise<UserEntity> {
    return this.manager.getRepository(UserEntity).save(user);
  }
}

export class PostgresOrganizationRepository {
  constructor(private readonly manager: EntityManager) {}

  findActiveById(id: string): Promise<OrganizationEntity | null> {
    return this.manager.getRepository(OrganizationEntity).findOneBy({
      id,
      archivedAt: IsNull(),
    });
  }

  findByIdForUpdate(id: string): Promise<OrganizationEntity | null> {
    return this.manager
      .getRepository(OrganizationEntity)
      .createQueryBuilder('organization')
      .setLock('pessimistic_write')
      .where('organization.id = :id', { id })
      .getOne();
  }

  create(values: DeepPartial<OrganizationEntity>): OrganizationEntity {
    return this.manager.getRepository(OrganizationEntity).create(values);
  }

  save(organization: OrganizationEntity): Promise<OrganizationEntity> {
    return this.manager.getRepository(OrganizationEntity).save(organization);
  }
}

export class PostgresOrganizationMembershipRepository {
  constructor(private readonly manager: EntityManager) {}

  findByIdForUpdate(
    organizationId: string,
    id: string,
  ): Promise<OrganizationMembershipEntity | null> {
    return this.manager
      .getRepository(OrganizationMembershipEntity)
      .createQueryBuilder('membership')
      .setLock('pessimistic_write')
      .where('membership.id = :id', { id })
      .andWhere('membership.organization_id = :organizationId', {
        organizationId,
      })
      .getOne();
  }

  findActiveByIdForUpdate(
    organizationId: string,
    id: string,
  ): Promise<OrganizationMembershipEntity | null> {
    return this.manager
      .getRepository(OrganizationMembershipEntity)
      .createQueryBuilder('membership')
      .setLock('pessimistic_write')
      .where('membership.id = :id', { id })
      .andWhere('membership.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('membership.state = :state', {
        state: OrganizationMembershipState.ACTIVE,
      })
      .getOne();
  }

  async listActiveWorkspaces(userId: string): Promise<
    Array<{
      organizationId: string;
      name: string;
      logoUrl: string | null;
      role: OrganizationRole;
      joinedAt: Date;
    }>
  > {
    return this.manager
      .getRepository(OrganizationMembershipEntity)
      .createQueryBuilder('membership')
      .innerJoin(
        OrganizationEntity,
        'organization',
        'organization.id = membership.organization_id',
      )
      .select('organization.id', 'organizationId')
      .addSelect('organization.name', 'name')
      .addSelect('organization.logo_url', 'logoUrl')
      .addSelect('membership.role', 'role')
      .addSelect('membership.joined_at', 'joinedAt')
      .where('membership.user_id = :userId', { userId })
      .andWhere('membership.state = :state', {
        state: OrganizationMembershipState.ACTIVE,
      })
      .andWhere('organization.archived_at IS NULL')
      .orderBy('membership.joined_at', 'ASC')
      .getRawMany();
  }

  findActiveByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembershipEntity | null> {
    return this.manager.getRepository(OrganizationMembershipEntity).findOneBy({
      userId,
      organizationId,
      state: OrganizationMembershipState.ACTIVE,
    });
  }

  findVerifiedTenantMembership(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembershipEntity | null> {
    return this.manager
      .getRepository(OrganizationMembershipEntity)
      .createQueryBuilder('membership')
      .innerJoin(
        OrganizationEntity,
        'organization',
        'organization.id = membership.organization_id',
      )
      .where('membership.user_id = :userId', { userId })
      .andWhere('membership.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('membership.state = :state', {
        state: OrganizationMembershipState.ACTIVE,
      })
      .andWhere('organization.archived_at IS NULL')
      .getOne();
  }

  findActiveOwnerForUpdate(
    organizationId: string,
  ): Promise<OrganizationMembershipEntity | null> {
    return this.manager
      .getRepository(OrganizationMembershipEntity)
      .createQueryBuilder('membership')
      .setLock('pessimistic_write')
      .where('membership.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('membership.role = :role', { role: 'OWNER' })
      .andWhere('membership.state = :state', {
        state: OrganizationMembershipState.ACTIVE,
      })
      .getOne();
  }

  findActiveByUserAndOrganizationForUpdate(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembershipEntity | null> {
    return this.manager
      .getRepository(OrganizationMembershipEntity)
      .createQueryBuilder('membership')
      .setLock('pessimistic_write')
      .where('membership.user_id = :userId', { userId })
      .andWhere('membership.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('membership.state = :state', {
        state: OrganizationMembershipState.ACTIVE,
      })
      .getOne();
  }

  findByUserAndOrganizationForUpdate(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembershipEntity | null> {
    return this.manager
      .getRepository(OrganizationMembershipEntity)
      .createQueryBuilder('membership')
      .setLock('pessimistic_write')
      .where('membership.user_id = :userId', { userId })
      .andWhere('membership.organization_id = :organizationId', {
        organizationId,
      })
      .getOne();
  }

  create(
    values: DeepPartial<OrganizationMembershipEntity>,
  ): OrganizationMembershipEntity {
    return this.manager
      .getRepository(OrganizationMembershipEntity)
      .create(values);
  }

  save(
    membership: OrganizationMembershipEntity,
  ): Promise<OrganizationMembershipEntity> {
    return this.manager
      .getRepository(OrganizationMembershipEntity)
      .save(membership);
  }
}

export class PostgresOrganizationInvitationRepository {
  constructor(private readonly manager: EntityManager) {}

  findPendingByOrganizationAndEmail(
    organizationId: string,
    email: string,
  ): Promise<OrganizationInvitationEntity | null> {
    return this.manager.getRepository(OrganizationInvitationEntity).findOneBy({
      organizationId,
      email,
      state: InvitationState.PENDING,
    });
  }

  findPendingByOrganizationAndEmailForUpdate(
    organizationId: string,
    email: string,
  ): Promise<OrganizationInvitationEntity | null> {
    return this.manager
      .getRepository(OrganizationInvitationEntity)
      .createQueryBuilder('invitation')
      .setLock('pessimistic_write')
      .where('invitation.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('invitation.email = :email', { email })
      .andWhere('invitation.state = :state', {
        state: InvitationState.PENDING,
      })
      .getOne();
  }

  findByIdForUpdate(id: string): Promise<OrganizationInvitationEntity | null> {
    return this.manager
      .getRepository(OrganizationInvitationEntity)
      .createQueryBuilder('invitation')
      .setLock('pessimistic_write')
      .where('invitation.id = :id', { id })
      .getOne();
  }

  findByTokenHashForUpdate(
    tokenHash: string,
  ): Promise<OrganizationInvitationEntity | null> {
    return this.manager
      .getRepository(OrganizationInvitationEntity)
      .createQueryBuilder('invitation')
      .setLock('pessimistic_write')
      .where('invitation.token_hash = :tokenHash', { tokenHash })
      .getOne();
  }

  listPendingByOrganization(
    organizationId: string,
  ): Promise<OrganizationInvitationEntity[]> {
    return this.manager.getRepository(OrganizationInvitationEntity).find({
      where: {
        organizationId,
        state: InvitationState.PENDING,
      },
      order: { createdAt: 'DESC' },
    });
  }

  listPendingByEmail(email: string): Promise<OrganizationInvitationEntity[]> {
    return this.manager.getRepository(OrganizationInvitationEntity).find({
      where: {
        email,
        state: InvitationState.PENDING,
      },
      order: { createdAt: 'DESC' },
    });
  }

  create(
    values: DeepPartial<OrganizationInvitationEntity>,
  ): OrganizationInvitationEntity {
    return this.manager
      .getRepository(OrganizationInvitationEntity)
      .create(values);
  }

  save(
    invitation: OrganizationInvitationEntity,
  ): Promise<OrganizationInvitationEntity> {
    return this.manager
      .getRepository(OrganizationInvitationEntity)
      .save(invitation);
  }
}

export class PostgresTeamRepository {
  constructor(private readonly manager: EntityManager) {}

  findActiveByNameForUpdate(
    organizationId: string,
    name: string,
  ): Promise<TeamEntity | null> {
    return this.manager
      .getRepository(TeamEntity)
      .createQueryBuilder('team')
      .setLock('pessimistic_write')
      .where('team.organization_id = :organizationId', { organizationId })
      .andWhere('team.name = :name', { name })
      .andWhere('team.archived_at IS NULL')
      .getOne();
  }

  findActiveById(
    organizationId: string,
    id: string,
  ): Promise<TeamEntity | null> {
    return this.manager.getRepository(TeamEntity).findOneBy({
      id,
      organizationId,
      archivedAt: IsNull(),
    });
  }

  listActiveByOrganization(organizationId: string): Promise<TeamEntity[]> {
    return this.manager.getRepository(TeamEntity).find({
      where: { organizationId, archivedAt: IsNull() },
      order: { name: 'ASC', createdAt: 'ASC' },
    });
  }

  findActiveByIdForUpdate(
    organizationId: string,
    id: string,
  ): Promise<TeamEntity | null> {
    return this.manager
      .getRepository(TeamEntity)
      .createQueryBuilder('team')
      .setLock('pessimistic_write')
      .where('team.id = :id', { id })
      .andWhere('team.organization_id = :organizationId', { organizationId })
      .andWhere('team.archived_at IS NULL')
      .getOne();
  }

  findByNameForUpdate(
    organizationId: string,
    name: string,
  ): Promise<TeamEntity | null> {
    return this.manager
      .getRepository(TeamEntity)
      .createQueryBuilder('team')
      .setLock('pessimistic_write')
      .where('team.organization_id = :organizationId', { organizationId })
      .andWhere('team.name = :name', { name })
      .getOne();
  }

  create(values: DeepPartial<TeamEntity>): TeamEntity {
    return this.manager.getRepository(TeamEntity).create(values);
  }

  save(team: TeamEntity): Promise<TeamEntity> {
    return this.manager.getRepository(TeamEntity).save(team);
  }
}

export class PostgresTeamMemberRepository {
  constructor(private readonly manager: EntityManager) {}

  findByTeamAndMembershipForUpdate(
    organizationId: string,
    teamId: string,
    organizationMembershipId: string,
  ): Promise<TeamMemberEntity | null> {
    return this.manager
      .getRepository(TeamMemberEntity)
      .createQueryBuilder('teamMember')
      .setLock('pessimistic_write')
      .where('teamMember.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('teamMember.team_id = :teamId', { teamId })
      .andWhere(
        'teamMember.organization_membership_id = :organizationMembershipId',
        { organizationMembershipId },
      )
      .getOne();
  }

  findActiveByTeamAndMembershipForUpdate(
    organizationId: string,
    teamId: string,
    organizationMembershipId: string,
  ): Promise<TeamMemberEntity | null> {
    return this.manager.getRepository(TeamMemberEntity).findOne({
      where: {
        organizationId,
        teamId,
        organizationMembershipId,
        removedAt: IsNull(),
      },
      lock: { mode: 'pessimistic_write' },
    });
  }

  listActiveForTeam(organizationId: string, teamId: string) {
    return this.manager
      .getRepository(TeamMemberEntity)
      .createQueryBuilder('teamMember')
      .innerJoin(
        OrganizationMembershipEntity,
        'membership',
        'membership.id = teamMember.organization_membership_id AND membership.organization_id = teamMember.organization_id',
      )
      .innerJoin(UserEntity, 'user', 'user.id = membership.user_id')
      .select('membership.id', 'organizationMembershipId')
      .addSelect('membership.role', 'organizationRole')
      .addSelect('teamMember.joined_at', 'joinedAt')
      .addSelect('user.id', 'userId')
      .addSelect('user.name', 'userName')
      .addSelect('user.email', 'userEmail')
      .addSelect('user.profile_image_url', 'userProfileImageUrl')
      .where('teamMember.organization_id = :organizationId', { organizationId })
      .andWhere('teamMember.team_id = :teamId', { teamId })
      .andWhere('teamMember.removed_at IS NULL')
      .andWhere('membership.state = :state', {
        state: OrganizationMembershipState.ACTIVE,
      })
      .orderBy('teamMember.joined_at', 'ASC')
      .getRawMany<{
        organizationMembershipId: string;
        organizationRole: OrganizationRole;
        joinedAt: Date;
        userId: string;
        userName: string;
        userEmail: string;
        userProfileImageUrl: string | null;
      }>();
  }

  create(values: DeepPartial<TeamMemberEntity>): TeamMemberEntity {
    return this.manager.getRepository(TeamMemberEntity).create(values);
  }

  save(teamMember: TeamMemberEntity): Promise<TeamMemberEntity> {
    return this.manager.getRepository(TeamMemberEntity).save(teamMember);
  }
}
