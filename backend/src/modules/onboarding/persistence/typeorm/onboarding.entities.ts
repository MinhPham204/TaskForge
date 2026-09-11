import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum OrganizationRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum OrganizationMembershipState {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
  LEFT = 'LEFT',
}

export enum InvitationState {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext', unique: true })
  email!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;

  @Column({ name: 'profile_image_url', type: 'text', nullable: true })
  profileImageUrl!: string | null;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({
    name: 'refresh_token_hash',
    type: 'text',
    nullable: true,
    select: false,
  })
  refreshTokenHash!: string | null;

  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true })
  disabledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'organizations' })
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'organization_memberships' })
@Index('uq_organization_memberships_user_organization', ['userId', 'organizationId'], {
  unique: true,
})
@Index('uq_organization_memberships_organization_id', ['organizationId', 'id'], {
  unique: true,
})
@Index('uq_organization_memberships_active_owner', ['organizationId'], {
  unique: true,
  where: `"role" = 'OWNER' AND "state" = 'ACTIVE'`,
})
@Index('idx_organization_memberships_user_state', ['userId', 'state'])
@Index('idx_organization_memberships_organization_state_role', [
  'organizationId',
  'state',
  'role',
])
export class OrganizationMembershipEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'enum', enum: OrganizationRole, enumName: 'organization_role' })
  role!: OrganizationRole;

  @Column({
    type: 'enum',
    enum: OrganizationMembershipState,
    enumName: 'organization_membership_state',
  })
  state!: OrganizationMembershipState;

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;

  @Column({ name: 'state_changed_at', type: 'timestamptz' })
  stateChangedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'organization_invitations' })
@Index('uq_organization_invitations_token_hash', ['tokenHash'], { unique: true })
@Index('uq_organization_invitations_pending_email', ['organizationId', 'email'], {
  unique: true,
  where: `"state" = 'PENDING'`,
})
@Index('idx_organization_invitations_email_state_expires_at', [
  'email',
  'state',
  'expiresAt',
])
export class OrganizationInvitationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'citext' })
  email!: string;

  @Column({
    name: 'invited_role',
    type: 'enum',
    enum: OrganizationRole,
    enumName: 'organization_role',
  })
  invitedRole!: OrganizationRole;

  @Column({ name: 'invited_by_membership_id', type: 'uuid' })
  invitedByMembershipId!: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ type: 'enum', enum: InvitationState, enumName: 'invitation_state' })
  state!: InvitationState;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  @Column({ name: 'accepted_user_id', type: 'uuid', nullable: true })
  acceptedUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'teams' })
@Index('uq_teams_organization_id', ['organizationId', 'id'], { unique: true })
@Index('idx_teams_organization_archived_name', [
  'organizationId',
  'archivedAt',
  'name',
])
export class TeamEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'team_members' })
@Index('idx_team_members_organization_membership_removed', [
  'organizationId',
  'organizationMembershipId',
  'removedAt',
])
@Index('idx_team_members_organization_team_removed', [
  'organizationId',
  'teamId',
  'removedAt',
])
export class TeamMemberEntity {
  @PrimaryColumn({ name: 'team_id', type: 'uuid' })
  teamId!: string;

  @PrimaryColumn({ name: 'organization_membership_id', type: 'uuid' })
  organizationMembershipId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
