import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P2 onboarding persistence only. Later phases own their Project and Task
 * tables. All tenant relationships use explicit organization keys so a row
 * cannot reference a Team or Membership from another Organization.
 */
export class CreateOnboardingSchema20260905000000 implements MigrationInterface {
  name = 'CreateOnboardingSchema20260905000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE organization_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
      CREATE TYPE organization_membership_state AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'LEFT');
      CREATE TYPE invitation_state AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED', 'EXPIRED');

      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email citext NOT NULL UNIQUE,
        name text NOT NULL,
        password_hash text NOT NULL,
        profile_image_url text NULL,
        email_verified_at timestamptz NULL,
        refresh_token_hash text NULL,
        disabled_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        logo_url text NULL,
        archived_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE organization_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        role organization_role NOT NULL,
        state organization_membership_state NOT NULL DEFAULT 'ACTIVE',
        joined_at timestamptz NOT NULL DEFAULT now(),
        state_changed_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_organization_memberships_user_organization UNIQUE (user_id, organization_id),
        CONSTRAINT uq_organization_memberships_organization_id UNIQUE (organization_id, id)
      );

      CREATE UNIQUE INDEX uq_organization_memberships_active_owner
        ON organization_memberships (organization_id)
        WHERE role = 'OWNER' AND state = 'ACTIVE';
      CREATE INDEX idx_organization_memberships_user_state
        ON organization_memberships (user_id, state);
      CREATE INDEX idx_organization_memberships_organization_state_role
        ON organization_memberships (organization_id, state, role);

      CREATE TABLE organization_invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        email citext NOT NULL,
        invited_role organization_role NOT NULL DEFAULT 'MEMBER',
        invited_by_membership_id uuid NOT NULL,
        token_hash text NOT NULL,
        state invitation_state NOT NULL DEFAULT 'PENDING',
        expires_at timestamptz NOT NULL,
        responded_at timestamptz NULL,
        accepted_user_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_organization_invitations_token_hash UNIQUE (token_hash),
        CONSTRAINT fk_organization_invitations_inviter_same_organization
          FOREIGN KEY (organization_id, invited_by_membership_id)
          REFERENCES organization_memberships (organization_id, id)
          ON DELETE RESTRICT
      );

      CREATE UNIQUE INDEX uq_organization_invitations_pending_email
        ON organization_invitations (organization_id, email)
        WHERE state = 'PENDING';
      CREATE INDEX idx_organization_invitations_email_state_expires_at
        ON organization_invitations (email, state, expires_at);

      CREATE TABLE teams (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        logo_url text NULL,
        archived_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_teams_organization_id UNIQUE (organization_id, id)
      );

      CREATE INDEX idx_teams_organization_archived_name
        ON teams (organization_id, archived_at, name);

      CREATE TABLE team_members (
        team_id uuid NOT NULL,
        organization_membership_id uuid NOT NULL,
        organization_id uuid NOT NULL,
        joined_at timestamptz NOT NULL DEFAULT now(),
        removed_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (team_id, organization_membership_id),
        CONSTRAINT fk_team_members_team_same_organization
          FOREIGN KEY (organization_id, team_id)
          REFERENCES teams (organization_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_team_members_membership_same_organization
          FOREIGN KEY (organization_id, organization_membership_id)
          REFERENCES organization_memberships (organization_id, id)
          ON DELETE RESTRICT
      );

      CREATE INDEX idx_team_members_organization_membership_removed
        ON team_members (organization_id, organization_membership_id, removed_at);
      CREATE INDEX idx_team_members_organization_team_removed
        ON team_members (organization_id, team_id, removed_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE team_members;
      DROP TABLE teams;
      DROP TABLE organization_invitations;
      DROP TABLE organization_memberships;
      DROP TABLE organizations;
      DROP TABLE users;
      DROP TYPE invitation_state;
      DROP TYPE organization_membership_state;
      DROP TYPE organization_role;
    `);
  }
}
