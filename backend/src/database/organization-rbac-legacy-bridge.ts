/** Recreate the compatibility functions removed by the roleId cutover on rollback. */
export const ORGANIZATION_RBAC_LEGACY_BRIDGE_SQL = `
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
`;
