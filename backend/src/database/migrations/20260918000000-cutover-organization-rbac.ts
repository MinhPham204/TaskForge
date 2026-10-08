import { ORGANIZATION_RBAC_LEGACY_BRIDGE_SQL } from '../organization-rbac-legacy-bridge';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/** P11-05: roleId becomes the sole Organization authorization source. */
export class CutoverOrganizationRbac20260918000000 implements MigrationInterface {
  name = 'CutoverOrganizationRbac20260918000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT organization.id
            FROM organizations organization
            LEFT JOIN organization_memberships membership
              ON membership.organization_id = organization.id
             AND membership.id = organization.owner_membership_id
             AND membership.state = 'ACTIVE'
            LEFT JOIN organization_roles role
              ON role.organization_id = membership.organization_id
             AND role.id = membership.role_id
             AND role.system_code = 'OWNER'
             AND role.is_protected
           GROUP BY organization.id
          HAVING count(role.id) <> 1
        ) THEN
          RAISE EXCEPTION 'RBAC cutover blocked: owner pointer does not reference exactly one active protected Owner Membership';
        END IF;
        IF EXISTS (SELECT 1 FROM organization_memberships WHERE role_id IS NULL)
           OR EXISTS (SELECT 1 FROM organization_invitations WHERE role_id IS NULL) THEN
          RAISE EXCEPTION 'RBAC cutover blocked: unresolved roleId reference';
        END IF;
      END $$;

      DROP TRIGGER IF EXISTS trg_mirror_legacy_membership_role_to_role_id ON organization_memberships;
      DROP TRIGGER IF EXISTS trg_mirror_legacy_invitation_role_to_role_id ON organization_invitations;
      DROP FUNCTION IF EXISTS mirror_legacy_membership_role_to_role_id();
      DROP FUNCTION IF EXISTS mirror_legacy_invitation_role_to_role_id();
      DROP TRIGGER IF EXISTS trg_set_organization_owner_membership_pointer ON organization_memberships;
      DROP FUNCTION IF EXISTS set_organization_owner_membership_pointer();
      DROP INDEX IF EXISTS uq_organization_memberships_active_owner;
      DROP INDEX IF EXISTS idx_organization_memberships_organization_state_role;

      DROP TRIGGER IF EXISTS ctr_organization_membership_owner_invariant ON organization_memberships;
      ALTER TABLE organizations ALTER COLUMN owner_membership_id SET NOT NULL;
      ALTER TABLE organization_memberships ALTER COLUMN role_id SET NOT NULL;
      ALTER TABLE organization_invitations ALTER COLUMN role_id SET NOT NULL;
      CREATE INDEX idx_organization_memberships_organization_state_role_id
        ON organization_memberships (organization_id, state, role_id);

      ALTER TABLE organization_memberships DROP COLUMN role;
      ALTER TABLE organization_invitations DROP COLUMN invited_role;
      DROP TYPE IF EXISTS organization_role;

      CREATE CONSTRAINT TRIGGER ctr_organization_membership_owner_invariant
        AFTER INSERT OR UPDATE OF role_id, state OR DELETE ON organization_memberships
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
        EXECUTE FUNCTION enforce_organization_owner_membership();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM organization_roles WHERE system_code IS NULL)
           OR EXISTS (
             SELECT 1 FROM organization_memberships membership
              JOIN organization_roles role ON role.id = membership.role_id
             WHERE role.system_code IS NULL
           ) OR EXISTS (
             SELECT 1 FROM organization_invitations invitation
              JOIN organization_roles role ON role.id = invitation.role_id
             WHERE role.system_code IS NULL
           ) THEN
          RAISE EXCEPTION 'Cannot restore enum Organization roles while custom roles are in use';
        END IF;
      END $$;
      DROP TRIGGER IF EXISTS ctr_organization_membership_owner_invariant ON organization_memberships;
      CREATE TYPE organization_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
      ALTER TABLE organization_memberships ADD COLUMN role organization_role;
      ALTER TABLE organization_invitations ADD COLUMN invited_role organization_role;
      UPDATE organization_memberships membership SET role = role.system_code::organization_role
        FROM organization_roles role WHERE role.id = membership.role_id;
      UPDATE organization_invitations invitation SET invited_role = role.system_code::organization_role
        FROM organization_roles role WHERE role.id = invitation.role_id;
      ALTER TABLE organization_memberships ALTER COLUMN role SET NOT NULL;
      ALTER TABLE organization_invitations ALTER COLUMN invited_role SET NOT NULL;
      ALTER TABLE organizations ALTER COLUMN owner_membership_id DROP NOT NULL;
      CREATE UNIQUE INDEX uq_organization_memberships_active_owner
        ON organization_memberships (organization_id)
        WHERE role = 'OWNER' AND state = 'ACTIVE';
      DROP INDEX IF EXISTS idx_organization_memberships_organization_state_role_id;
      CREATE INDEX idx_organization_memberships_organization_state_role
        ON organization_memberships (organization_id, state, role);
      ${ORGANIZATION_RBAC_LEGACY_BRIDGE_SQL}
      CREATE TRIGGER trg_set_organization_owner_membership_pointer
        AFTER INSERT OR UPDATE OF role, state ON organization_memberships
        FOR EACH ROW EXECUTE FUNCTION set_organization_owner_membership_pointer();
      CREATE TRIGGER trg_mirror_legacy_membership_role_to_role_id
        BEFORE INSERT OR UPDATE OF organization_id, role ON organization_memberships
        FOR EACH ROW EXECUTE FUNCTION mirror_legacy_membership_role_to_role_id();
      CREATE TRIGGER trg_mirror_legacy_invitation_role_to_role_id
        BEFORE INSERT OR UPDATE OF organization_id, invited_role ON organization_invitations
        FOR EACH ROW EXECUTE FUNCTION mirror_legacy_invitation_role_to_role_id();
      CREATE CONSTRAINT TRIGGER ctr_organization_membership_owner_invariant
        AFTER INSERT OR UPDATE OF role, role_id, state OR DELETE ON organization_memberships
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
        EXECUTE FUNCTION enforce_organization_owner_membership();
    `);
  }
}
