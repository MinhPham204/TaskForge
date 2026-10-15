import type { EntityManager } from 'typeorm';

// Shared by the candidate read and command rechecks. Project/Team relations are
// checked separately; surviving relations cannot reactivate a revoked identity.
export const ACTIVE_TASK_IDENTITY =
  "om.state = 'ACTIVE' AND u.disabled_at IS NULL";

export async function activeTaskIdentity(
  manager: EntityManager,
  organizationId: string,
  membershipId: string,
  lock = false,
): Promise<boolean> {
  const rows = await manager.query<Array<{ id: string }>>(
    `SELECT om.id FROM organization_memberships om
       JOIN users u ON u.id = om.user_id
      WHERE om.organization_id = $1 AND om.id = $2
        AND ${ACTIVE_TASK_IDENTITY}
      ${lock ? 'FOR SHARE OF om, u' : ''}`,
    [organizationId, membershipId],
  );
  return rows.length > 0;
}
