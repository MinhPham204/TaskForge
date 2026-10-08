import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P11-02 additive RBAC schema and legacy data backfill.
 *
 * Until P11-05 removes the enum runtime contract, legacy role columns remain
 * the write input and database triggers mirror them into role_id. No custom
 * role is assignable during this compatibility interval.
 */
export class PrepareOrganizationRbac20260917000000 implements MigrationInterface {
  name = 'PrepareOrganizationRbac20260917000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM organization_invitations WHERE invited_role = 'OWNER'
        ) THEN
          RAISE EXCEPTION 'RBAC migration blocked: an invitation targets OWNER';
        END IF;

        IF EXISTS (
          SELECT organization.id
            FROM organizations organization
            LEFT JOIN organization_memberships membership
              ON membership.organization_id = organization.id
             AND membership.role = 'OWNER'
             AND membership.state = 'ACTIVE'
           GROUP BY organization.id
          HAVING count(membership.id) <> 1
        ) THEN
          RAISE EXCEPTION 'RBAC migration blocked: each Organization must have exactly one active OWNER Membership';
        END IF;
      END $$;

      CREATE TABLE organization_permissions (
        code varchar(96) PRIMARY KEY,
        name varchar(120) NOT NULL,
        description text NOT NULL,
        resource_group varchar(64) NOT NULL,
        is_assignable boolean NOT NULL DEFAULT true
      );

      INSERT INTO organization_permissions
        (code, name, description, resource_group, is_assignable)
      VALUES
        ('org.settings.update', 'Update workspace settings', 'Change Organization name and logo.', 'Workspace', true),
        ('org.members.read', 'View members', 'Read Organization Memberships.', 'Members', true),
        ('org.members.invite', 'Invite members', 'Create invitations for eligible non-Owner roles.', 'Members', true),
        ('org.members.suspend', 'Suspend members', 'Suspend an active non-Owner Membership.', 'Members', true),
        ('org.members.revoke', 'Revoke members', 'Revoke a non-Owner Membership.', 'Members', true),
        ('org.invitations.read', 'View invitations', 'Read Organization invitations.', 'Invitations', true),
        ('org.invitations.revoke', 'Revoke invitations', 'Revoke a pending Organization invitation.', 'Invitations', true),
        ('team.create', 'Create teams', 'Create a Team in this Organization.', 'Teams', true),
        ('team.update', 'Update teams', 'Update Team details in this Organization.', 'Teams', true),
        ('team.archive', 'Archive teams', 'Archive a Team under existing membership constraints.', 'Teams', true),
        ('team.members.manage', 'Manage team membership', 'Add or remove Organization Members from Teams.', 'Teams', true),
        ('org.projects.create', 'Create projects', 'Create a Project in this Organization.', 'Projects', true),
        ('org.projects.read_all', 'View all projects and tasks', 'Read Projects and Tasks across this Organization, subject to resource rules.', 'Projects', true),
        ('org.roles.read', 'Read Organization roles', 'Read role definitions and permission catalog.', 'Roles', false),
        ('org.roles.manage', 'Manage Organization roles', 'Create, update, archive roles and edit role permissions.', 'Roles', false),
        ('org.members.role.assign', 'Assign Organization roles', 'Assign a non-Owner role to an active Membership.', 'Roles', false),
        ('org.owner.transfer', 'Transfer ownership', 'Transfer the protected Organization owner position.', 'Ownership', false),
        ('org.archive', 'Archive workspace', 'Archive this Organization.', 'Ownership', false);

      CREATE TABLE organization_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        name varchar(80) NOT NULL,
        description text NOT NULL DEFAULT '',
        system_code varchar(32) NULL,
        is_default boolean NOT NULL DEFAULT false,
        is_protected boolean NOT NULL DEFAULT false,
        archived_at timestamptz NULL,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_organization_roles_organization_id UNIQUE (organization_id, id),
        CONSTRAINT chk_organization_roles_system_code
          CHECK (system_code IS NULL OR system_code IN ('OWNER', 'ADMIN', 'MEMBER')),
        CONSTRAINT chk_organization_roles_default_system
          CHECK (is_default = (system_code IS NOT NULL)),
        CONSTRAINT chk_organization_roles_protected_owner
          CHECK (NOT is_protected OR system_code = 'OWNER'),
        CONSTRAINT chk_organization_roles_owner_is_protected
          CHECK (system_code <> 'OWNER' OR is_protected),
        CONSTRAINT chk_organization_roles_default_not_archived
          CHECK (NOT is_default OR archived_at IS NULL),
        CONSTRAINT chk_organization_roles_version_positive CHECK (version > 0)
      );
      CREATE UNIQUE INDEX uq_organization_roles_system_code
        ON organization_roles (organization_id, system_code)
        WHERE system_code IS NOT NULL;
      CREATE UNIQUE INDEX uq_organization_roles_name_ci
        ON organization_roles (organization_id, lower(name));
      CREATE INDEX idx_organization_roles_active
        ON organization_roles (organization_id, archived_at, name);

      CREATE TABLE organization_role_permissions (
        organization_id uuid NOT NULL,
        role_id uuid NOT NULL,
        permission_code varchar(96) NOT NULL,
        CONSTRAINT pk_organization_role_permissions
          PRIMARY KEY (organization_id, role_id, permission_code),
        CONSTRAINT fk_organization_role_permissions_role_same_organization
          FOREIGN KEY (organization_id, role_id)
          REFERENCES organization_roles (organization_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_organization_role_permissions_permission
          FOREIGN KEY (permission_code)
          REFERENCES organization_permissions (code) ON DELETE RESTRICT
      );

      INSERT INTO organization_roles
        (organization_id, name, description, system_code, is_default, is_protected)
      SELECT organization.id, defaults.name, defaults.description,
             defaults.system_code, true, defaults.system_code = 'OWNER'
        FROM organizations organization
        CROSS JOIN (VALUES
          ('OWNER', 'Owner', 'Protected Organization ownership role.'),
          ('ADMIN', 'Admin', 'Default Organization administration role.'),
          ('MEMBER', 'Member', 'Default Organization member role.')
        ) AS defaults(system_code, name, description);

      INSERT INTO organization_role_permissions (organization_id, role_id, permission_code)
      SELECT role.organization_id, role.id, permission.code
        FROM organization_roles role
        CROSS JOIN organization_permissions permission
       WHERE role.system_code = 'ADMIN'
         AND permission.is_assignable;

      ALTER TABLE organizations
        ADD COLUMN owner_membership_id uuid NULL;
      ALTER TABLE organization_memberships
        ADD COLUMN role_id uuid NULL;
      ALTER TABLE organization_invitations
        ADD COLUMN role_id uuid NULL;

      UPDATE organization_memberships membership
         SET role_id = role.id
        FROM organization_roles role
       WHERE role.organization_id = membership.organization_id
         AND role.system_code = membership.role::text;

      UPDATE organization_invitations invitation
         SET role_id = role.id
        FROM organization_roles role
       WHERE role.organization_id = invitation.organization_id
         AND role.system_code = invitation.invited_role::text;

      UPDATE organizations organization
         SET owner_membership_id = membership.id
        FROM organization_memberships membership
       WHERE membership.organization_id = organization.id
         AND membership.role = 'OWNER'
         AND membership.state = 'ACTIVE';

      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM organization_memberships WHERE role_id IS NULL) THEN
          RAISE EXCEPTION 'RBAC migration blocked: a Membership could not be mapped to a default role';
        END IF;
        IF EXISTS (SELECT 1 FROM organization_invitations WHERE role_id IS NULL) THEN
          RAISE EXCEPTION 'RBAC migration blocked: an invitation could not be mapped to a default role';
        END IF;
        IF EXISTS (SELECT 1 FROM organizations WHERE owner_membership_id IS NULL) THEN
          RAISE EXCEPTION 'RBAC migration blocked: an Organization has no active Owner';
        END IF;
      END $$;

      ALTER TABLE organization_memberships
        ALTER COLUMN role_id SET NOT NULL,
        ADD CONSTRAINT fk_organization_memberships_role_same_organization
          FOREIGN KEY (organization_id, role_id)
          REFERENCES organization_roles (organization_id, id) ON DELETE RESTRICT;
      ALTER TABLE organization_invitations
        ALTER COLUMN role_id SET NOT NULL,
        ADD CONSTRAINT fk_organization_invitations_role_same_organization
          FOREIGN KEY (organization_id, role_id)
          REFERENCES organization_roles (organization_id, id) ON DELETE RESTRICT;
      ALTER TABLE organizations
        ADD CONSTRAINT fk_organizations_owner_membership_same_organization
          FOREIGN KEY (id, owner_membership_id)
          REFERENCES organization_memberships (organization_id, id)
          ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

      CREATE FUNCTION provision_organization_default_roles()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        v_admin_role_id uuid;
      BEGIN
        INSERT INTO organization_roles
          (organization_id, name, description, system_code, is_default, is_protected)
        VALUES
          (NEW.id, 'Owner', 'Protected Organization ownership role.', 'OWNER', true, true),
          (NEW.id, 'Admin', 'Default Organization administration role.', 'ADMIN', true, false),
          (NEW.id, 'Member', 'Default Organization member role.', 'MEMBER', true, false);

        SELECT id INTO v_admin_role_id FROM organization_roles
         WHERE organization_id = NEW.id AND system_code = 'ADMIN';
        INSERT INTO organization_role_permissions (organization_id, role_id, permission_code)
        SELECT NEW.id, v_admin_role_id, code
          FROM organization_permissions WHERE is_assignable;
        RETURN NEW;
      END $$;

      CREATE TRIGGER trg_provision_organization_default_roles
        AFTER INSERT ON organizations
        FOR EACH ROW EXECUTE FUNCTION provision_organization_default_roles();

      CREATE FUNCTION mirror_legacy_membership_role_to_role_id()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        SELECT role.id INTO NEW.role_id
          FROM organization_roles role
         WHERE role.organization_id = NEW.organization_id
           AND role.system_code = NEW.role::text
           AND role.is_default
           AND role.archived_at IS NULL;
        IF NEW.role_id IS NULL THEN
          RAISE EXCEPTION 'Legacy Organization role % has no active default role mapping', NEW.role;
        END IF;
        RETURN NEW;
      END $$;

      CREATE TRIGGER trg_mirror_legacy_membership_role_to_role_id
        BEFORE INSERT OR UPDATE OF organization_id, role ON organization_memberships
        FOR EACH ROW EXECUTE FUNCTION mirror_legacy_membership_role_to_role_id();

      CREATE FUNCTION mirror_legacy_invitation_role_to_role_id()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        SELECT role.id INTO NEW.role_id
          FROM organization_roles role
         WHERE role.organization_id = NEW.organization_id
           AND role.system_code = NEW.invited_role::text
           AND role.is_default
           AND role.archived_at IS NULL;
        IF NEW.role_id IS NULL THEN
          RAISE EXCEPTION 'Legacy invitation role % has no active default role mapping', NEW.invited_role;
        END IF;
        RETURN NEW;
      END $$;

      CREATE TRIGGER trg_mirror_legacy_invitation_role_to_role_id
        BEFORE INSERT OR UPDATE OF organization_id, invited_role ON organization_invitations
        FOR EACH ROW EXECUTE FUNCTION mirror_legacy_invitation_role_to_role_id();

      CREATE FUNCTION set_organization_owner_membership_pointer()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.role::text = 'OWNER' AND NEW.state = 'ACTIVE' THEN
          UPDATE organizations
             SET owner_membership_id = NEW.id
           WHERE id = NEW.organization_id;
        ELSIF TG_OP = 'UPDATE' AND OLD.role::text = 'OWNER'
              AND (NEW.role::text <> 'OWNER' OR NEW.state <> 'ACTIVE') THEN
          UPDATE organizations
             SET owner_membership_id = NULL
           WHERE id = OLD.organization_id
             AND owner_membership_id = OLD.id;
        END IF;
        RETURN NEW;
      END $$;

      CREATE TRIGGER trg_set_organization_owner_membership_pointer
        AFTER INSERT OR UPDATE OF role, state ON organization_memberships
        FOR EACH ROW EXECUTE FUNCTION set_organization_owner_membership_pointer();

      CREATE FUNCTION assert_organization_owner_membership(p_organization_id uuid)
      RETURNS void LANGUAGE plpgsql AS $$
      DECLARE
        v_owner_membership_id uuid;
        v_active_owner_id uuid;
        v_owner_count integer;
      BEGIN
        SELECT owner_membership_id INTO v_owner_membership_id
          FROM organizations WHERE id = p_organization_id;
        IF NOT FOUND THEN RETURN; END IF;

        SELECT count(*), (array_agg(membership.id))[1]
          INTO v_owner_count, v_active_owner_id
          FROM organization_memberships membership
          JOIN organization_roles role
            ON role.organization_id = membership.organization_id
           AND role.id = membership.role_id
         WHERE membership.organization_id = p_organization_id
           AND membership.state = 'ACTIVE'
           AND role.system_code = 'OWNER'
           AND role.is_protected
           AND role.archived_at IS NULL;

        IF v_owner_count <> 1 OR v_owner_membership_id IS DISTINCT FROM v_active_owner_id THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = format('Organization %s must reference exactly one active protected Owner Membership', p_organization_id);
        END IF;
      END $$;

      CREATE FUNCTION enforce_organization_owner_membership()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME = 'organizations' THEN
          PERFORM assert_organization_owner_membership(NEW.id);
        ELSE
          IF TG_OP = 'DELETE' THEN
            PERFORM assert_organization_owner_membership(OLD.organization_id);
          ELSE
            PERFORM assert_organization_owner_membership(NEW.organization_id);
            IF TG_OP = 'UPDATE' AND OLD.organization_id <> NEW.organization_id THEN
              PERFORM assert_organization_owner_membership(OLD.organization_id);
            END IF;
          END IF;
        END IF;
        RETURN NULL;
      END $$;

      CREATE CONSTRAINT TRIGGER ctr_organization_owner_pointer
        AFTER INSERT OR UPDATE OF owner_membership_id ON organizations
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
        EXECUTE FUNCTION enforce_organization_owner_membership();
      CREATE CONSTRAINT TRIGGER ctr_organization_membership_owner_invariant
        AFTER INSERT OR UPDATE OF role, role_id, state OR DELETE ON organization_memberships
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
        EXECUTE FUNCTION enforce_organization_owner_membership();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM organization_roles WHERE system_code IS NULL
        ) THEN
          RAISE EXCEPTION 'Cannot revert Organization RBAC while custom roles exist';
        END IF;
      END $$;

      DROP TRIGGER IF EXISTS ctr_organization_membership_owner_invariant ON organization_memberships;
      DROP TRIGGER IF EXISTS ctr_organization_owner_pointer ON organizations;
      DROP TRIGGER IF EXISTS trg_set_organization_owner_membership_pointer ON organization_memberships;
      DROP TRIGGER IF EXISTS trg_provision_organization_default_roles ON organizations;
      DROP TRIGGER IF EXISTS trg_mirror_legacy_invitation_role_to_role_id ON organization_invitations;
      DROP TRIGGER IF EXISTS trg_mirror_legacy_membership_role_to_role_id ON organization_memberships;
      DROP FUNCTION IF EXISTS enforce_organization_owner_membership();
      DROP FUNCTION IF EXISTS assert_organization_owner_membership(uuid);
      DROP FUNCTION IF EXISTS set_organization_owner_membership_pointer();
      DROP FUNCTION IF EXISTS provision_organization_default_roles();
      DROP FUNCTION IF EXISTS mirror_legacy_invitation_role_to_role_id();
      DROP FUNCTION IF EXISTS mirror_legacy_membership_role_to_role_id();

      ALTER TABLE organizations
        DROP CONSTRAINT fk_organizations_owner_membership_same_organization,
        DROP COLUMN owner_membership_id;
      ALTER TABLE organization_invitations
        DROP CONSTRAINT fk_organization_invitations_role_same_organization,
        DROP COLUMN role_id;
      ALTER TABLE organization_memberships
        DROP CONSTRAINT fk_organization_memberships_role_same_organization,
        DROP COLUMN role_id;
      DROP TABLE organization_role_permissions;
      DROP TABLE organization_roles;
      DROP TABLE organization_permissions;
    `);
  }
}
