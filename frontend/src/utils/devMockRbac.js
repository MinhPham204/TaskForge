import { ORGANIZATION_PERMISSION_LABELS } from './organizationPermissions.js';

const protectedCodes = ['org.roles.read', 'org.roles.manage', 'org.members.role.assign', 'org.owner.transfer', 'org.archive'];
const catalog = Object.entries(ORGANIZATION_PERMISSION_LABELS).map(([code, name]) => ({
  code, name, description: name, resourceGroup: code.startsWith('team.') ? 'Teams' : code.startsWith('org.projects.') ? 'Projects' : code.startsWith('org.members.') || code.startsWith('org.invitations.') ? 'Members and invitations' : 'Workspace',
  isAssignable: !protectedCodes.includes(code),
}));
const stores = new Map();
const fail = (status, message) => ({ error: { status, data: { message } } });
const snapshot = (data) => ({ data: structuredClone(data) });
const roleId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function storeFor(organizationId) {
  if (!stores.has(organizationId)) {
    const roles = ['Owner', 'Admin', 'Member'].map((name, index) => ({
      id: roleId(index + 1), name, description: `${name} workspace role`, systemCode: name.toUpperCase(),
      isDefault: true, isProtected: index === 0, archivedAt: null, version: 1,
      permissionCodes: index === 0 ? catalog.map((item) => item.code) : index === 1 ? catalog.filter((item) => item.isAssignable).map((item) => item.code) : [],
    }));
    const members = ['Alex Johnson', 'Sarah Miller', 'David Chen'].map((name, index) => ({
      membershipId: `m-dev-${index + 1}`, userId: `u-dev-${index + 1}`, name,
      email: `${name.split(' ')[0].toLowerCase()}@taskforge.dev`, profileImageUrl: null,
      roleId: roles[index].id, isOwner: index === 0, state: 'ACTIVE', joinedAt: '2026-09-01T08:00:00.000Z',
    }));
    stores.set(organizationId, { roles, members, invitations: [], nextRole: 4, nextInvitation: 1 });
  }
  return stores.get(organizationId);
}

// Called only after the Dev Mock gate; all state is isolated by Organization.
export function handleDevMockRbac({ url, method, data = {} }) {
  const match = url.match(/^\/api\/organizations\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const [, organizationId, path] = match;
  const store = storeFor(organizationId);
  const summary = (role) => ({ ...role, membershipCount: store.members.filter((member) => member.roleId === role.id).length, pendingInvitationCount: store.invitations.filter((item) => item.roleId === role.id && item.state === 'PENDING').length });
  const roleFor = (id) => store.roles.find((role) => role.id === id);
  const validCodes = (codes) => Array.isArray(codes) && codes.length <= 64 && new Set(codes).size === codes.length && codes.every((code) => catalog.some((item) => item.code === code && item.isAssignable));
  const validName = (name, except) => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 80 && !store.roles.some((role) => role.id !== except && role.name.toLowerCase() === name.trim().toLowerCase());
  if (path === 'permissions/me' && method === 'get') return snapshot({ isOwner: true, role: summary(store.roles[0]), permissions: store.roles[0].permissionCodes });
  if (path === 'permissions' && method === 'get') return snapshot(catalog);
  if (path === 'invitation-roles' && method === 'get') return snapshot(store.roles.filter((role) => !role.isProtected && !role.archivedAt).map(summary));
  if (path === 'roles' && method === 'get') return snapshot(store.roles.map(summary));
  if (path === 'roles' && method === 'post') {
    if (!validName(data.name)) return fail(409, 'Role name must be unique and non-empty (maximum 80 characters).');
    if (!validCodes(data.permissionCodes) || typeof (data.description ?? '') !== 'string' || (data.description || '').length > 500) return fail(400, 'Invalid description or unknown/non-assignable permission.');
    const role = { id: roleId(store.nextRole++), name: data.name.trim(), description: (data.description || '').trim(), systemCode: null, isDefault: false, isProtected: false, archivedAt: null, version: 1, permissionCodes: [...data.permissionCodes].sort() };
    store.roles.push(role); return snapshot(summary(role));
  }
  const roleMatch = path.match(/^roles\/([^/]+)(?:\/(permissions|archive))?$/);
  if (roleMatch) {
    const role = roleFor(roleMatch[1]);
    if (!role) return fail(404, 'Role not found in this Organization.');
    if (role.isProtected || role.archivedAt) return fail(409, 'Protected or archived role cannot be edited.');
    if (role.version !== data.expectedVersion) return fail(409, 'Role has changed; reload before saving.');
    const action = roleMatch[2];
    if (action === 'permissions' && method === 'put') {
      if (!validCodes(data.permissionCodes)) return fail(400, 'Unknown or non-assignable permission.');
      const codes = [...data.permissionCodes].sort();
      if (JSON.stringify(codes) !== JSON.stringify([...role.permissionCodes].sort())) { role.permissionCodes = codes; role.version++; }
    } else if (action === 'archive' && method === 'post') {
      if (role.isDefault || summary(role).membershipCount || store.invitations.some((item) => item.roleId === role.id && item.state === 'PENDING')) return fail(409, 'Default or in-use role cannot be archived.');
      role.archivedAt = new Date().toISOString(); role.version++;
    } else if (!action && method === 'patch') {
      if (role.isDefault) return fail(409, 'Default roles cannot be renamed.');
      if (!validName(data.name, role.id)) return fail(409, 'Role name is invalid or already exists.');
      if (typeof data.description !== 'string' || data.description.length > 500) return fail(400, 'Invalid description.');
      const name = data.name.trim(), description = data.description.trim();
      if (name !== role.name || description !== role.description) { role.name = name; role.description = description; role.version++; }
    } else return null;
    return snapshot(summary(role));
  }
  if (path === 'members' && method === 'get') return snapshot(store.members.map((member) => ({ ...member, roleName: roleFor(member.roleId).name, role: roleFor(member.roleId).systemCode })));
  const memberMatch = path.match(/^members\/([^/]+)(?:\/(role|suspend))?$/);
  if (memberMatch) {
    const member = store.members.find((item) => item.userId === memberMatch[1]);
    if (!member) return fail(404, 'Member not found.');
    if (member.isOwner || member.state !== 'ACTIVE') return fail(409, 'Only active non-Owner members can be changed.');
    if (memberMatch[2] === 'role' && method === 'patch') {
      const role = roleFor(data.roleId);
      if (!role) return fail(404, 'Role not found in this Organization.');
      if (role.archivedAt || role.isProtected) return fail(409, 'Select an active non-Owner role.');
      member.roleId = role.id; return snapshot(summary(role));
    }
    if (memberMatch[2] === 'suspend' && method === 'post') { member.state = 'SUSPENDED'; return snapshot(member); }
    if (!memberMatch[2] && method === 'delete') { member.state = 'REVOKED'; return snapshot(member); }
  }
  if (path === 'invitations') {
    if (method === 'get') return snapshot(store.invitations.filter((item) => item.state === 'PENDING').map((item) => ({ ...item, roleName: roleFor(item.roleId).name })));
    if (method === 'post') {
      const role = roleFor(data.roleId || roleId(3));
      if (!role) return fail(404, 'Role not found in this Organization.');
      if (role.isProtected || role.archivedAt) return fail(409, 'Select an active non-Owner role.');
      const invitation = { id: `inv-dev-${store.nextInvitation++}`, email: data.email, roleId: role.id, state: 'PENDING', expiresAt: data.expiresAt, createdAt: new Date().toISOString() };
      store.invitations.push(invitation); return snapshot(invitation);
    }
  }
  const invitationMatch = path.match(/^invitations\/([^/]+)$/);
  if (invitationMatch && method === 'delete') {
    const invitation = store.invitations.find((item) => item.id === invitationMatch[1]);
    if (!invitation) return fail(404, 'Invitation not found.');
    invitation.state = 'REVOKED'; return snapshot(invitation);
  }
  return null;
}
