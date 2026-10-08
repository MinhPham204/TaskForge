// Role names and system codes are display metadata, never authorization inputs.
export const hasOrganizationPermission = (capabilities, code) =>
  Array.isArray(capabilities?.permissions) && capabilities.permissions.includes(code);

export const organizationRoleName = (value) => {
  if (typeof value === 'string') return value || 'Unknown role';
  return value?.roleSummary?.name || value?.roleName ||
    (typeof value?.role === 'object' ? value.role?.name : value?.role) ||
    value?.name || 'Unknown role';
};

export const sameCapabilities = (before, after) =>
  before?.isOwner === after?.isOwner &&
  before?.role?.id === after?.role?.id &&
  before?.role?.version === after?.role?.version &&
  JSON.stringify([...(before?.permissions || [])].sort()) ===
    JSON.stringify([...(after?.permissions || [])].sort());

export const matchesCapabilityScope = (auth, scope) =>
  Boolean(scope?.userId && scope?.organizationId &&
    auth.user?.id === scope.userId && auth.activeOrganizationId === scope.organizationId);

export const invitableOrganizationRoles = (roles, capabilities) => (roles || []).filter((role) =>
  !role.archivedAt && !role.isProtected && role.systemCode !== 'OWNER' &&
  (capabilities?.isOwner === true || (role.permissionCodes || []).every((code) =>
    hasOrganizationPermission(capabilities, code))));

export const ORGANIZATION_PERMISSION_LABELS = {
  'org.settings.update': 'Edit workspace profile',
  'org.members.read': 'View workspace members',
  'org.members.invite': 'Invite workspace members',
  'org.members.suspend': 'Suspend workspace members',
  'org.members.revoke': 'Revoke workspace memberships',
  'org.invitations.read': 'View pending invitations',
  'org.invitations.revoke': 'Revoke pending invitations',
  'team.create': 'Create teams',
  'team.update': 'Edit teams',
  'team.archive': 'Archive teams',
  'team.members.manage': 'Manage team members',
  'org.projects.create': 'Create projects',
  'org.projects.read_all': 'View all workspace projects and tasks',
  'org.roles.read': 'View workspace roles and permission catalog',
  'org.roles.manage': 'Manage roles and their permissions',
  'org.members.role.assign': 'Assign member roles',
  'org.owner.transfer': 'Transfer workspace ownership',
  'org.archive': 'Archive workspace',
};
