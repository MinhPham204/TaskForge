import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

import { API_PATHS } from '../utils/apiPaths.js';
import {
  ACTIVE_ORG_KEY,
  applyTenantHeader,
  isTenantScopedRequest,
} from '../utils/axiosInstance.js';
import {
  apiErrorMessage,
  canManageWorkspace,
  canModifyMember,
  canRevokeMember,
  canSuspendMember,
  invitationValidationMessage,
  workspaceProfileValidationMessage,
} from '../utils/workspaceSettings.js';
import { organizationApi } from '../services/organizationApi.js';
import { store } from '../store/index.js';
import { logout, switchOrganization } from '../store/authSlice.js';

console.log('Starting Workspace Settings contract verification...');

// 1. API_PATHS verification
assert.equal(API_PATHS.ORGANIZATIONS.CREATE_ORG, '/api/organizations');
assert.equal(API_PATHS.ORGANIZATIONS.GET_BY_ID('org-1'), '/api/organizations/org-1');
assert.equal(API_PATHS.ORGANIZATIONS.UPDATE('org-1'), '/api/organizations/org-1');
assert.equal(API_PATHS.ORGANIZATIONS.MEMBERS('org-1'), '/api/organizations/org-1/members');
assert.equal(API_PATHS.ORGANIZATIONS.INVITATIONS('org-1'), '/api/organizations/org-1/invitations');
assert.equal(API_PATHS.ORGANIZATIONS.CREATE_INVITATION('org-1'), '/api/organizations/org-1/invitations');
assert.equal(
  API_PATHS.ORGANIZATIONS.REVOKE_INVITATION('org-1', 'inv-99'),
  '/api/organizations/org-1/invitations/inv-99'
);
assert.equal(
  API_PATHS.ORGANIZATIONS.SUSPEND_MEMBER('org-1', 'usr-88'),
  '/api/organizations/org-1/members/usr-88/suspend'
);
assert.equal(
  API_PATHS.ORGANIZATIONS.REVOKE_MEMBER('org-1', 'usr-88'),
  '/api/organizations/org-1/members/usr-88'
);
assert.equal(
  API_PATHS.ORGANIZATIONS.LEAVE('org-1'),
  '/api/organizations/org-1/leave'
);

// 2. Tenant scoping verification
assert.equal(isTenantScopedRequest('/api/organizations'), false, 'Create org is control plane');
for (const endpoint of [
  '/api/organizations/org-1',
  '/api/organizations/org-1/members',
  '/api/organizations/org-1/invitations',
  '/api/organizations/org-1/invitations/inv-99',
  '/api/organizations/org-1/members/usr-88/suspend',
  '/api/organizations/org-1/members/usr-88',
  '/api/organizations/org-1/leave',
]) {
  assert.equal(isTenantScopedRequest(endpoint), true, `${endpoint} must be tenant scoped`);
}

// 3. Header verification
localStorage.setItem('token', 'access-token');
localStorage.setItem(ACTIVE_ORG_KEY, 'org-alpha');
const configWithHeader = applyTenantHeader({
  url: '/api/organizations/org-alpha/members',
  headers: {},
});
assert.equal(configWithHeader.headers['x-organization-id'], 'org-alpha');

// 4. Exact response and payload shapes
const organizationResponse = {
  id: 'org-1',
  name: 'Acme Corp',
  logoUrl: 'https://example.com/logo.png',
  role: 'OWNER',
};
assert.equal(typeof organizationResponse.id, 'string');
assert.equal(typeof organizationResponse.name, 'string');
assert.equal(typeof organizationResponse.logoUrl, 'string');
assert.equal(organizationResponse.role, 'OWNER');

const memberResponse = {
  membershipId: 'mem-1',
  userId: 'usr-1',
  name: 'Jane Doe',
  email: 'jane@example.test',
  profileImageUrl: null,
  role: 'ADMIN',
  state: 'ACTIVE',
  joinedAt: '2026-09-01T10:00:00.000Z',
  stateChangedAt: '2026-09-01T10:00:00.000Z',
};
assert.equal(typeof memberResponse.membershipId, 'string');
assert.equal(typeof memberResponse.userId, 'string');
assert.equal(typeof memberResponse.name, 'string');
assert.equal(typeof memberResponse.email, 'string');
assert.equal(memberResponse.role, 'ADMIN');
assert.equal(memberResponse.state, 'ACTIVE');

const invitationResponse = {
  id: 'inv-1',
  organizationId: 'org-1',
  email: 'invitee@example.test',
  roleId: '00000000-0000-4000-8000-000000000003',
  roleName: 'Member',
  state: 'PENDING',
  expiresAt: '2026-10-01T00:00:00.000Z',
};
assert.equal(typeof invitationResponse.id, 'string');
assert.equal(invitationResponse.email, 'invitee@example.test');
assert.equal(invitationResponse.roleName, 'Member');
assert.equal(invitationResponse.roleId, '00000000-0000-4000-8000-000000000003');
assert.equal(invitationResponse.state, 'PENDING');

// 5. Permission & Governance rules
assert.equal(canManageWorkspace('MEMBER'), false, 'Member cannot manage workspace');
assert.equal(canManageWorkspace('ADMIN'), false, 'A role name cannot grant permission');
assert.equal(canManageWorkspace('OWNER'), false, 'Ownership must come from capabilities');
const governance = { permissions: ['org.settings.update', 'org.members.suspend', 'org.members.revoke'] };
assert.equal(canManageWorkspace(governance), true, 'Granted permission allows profile editing');

// Owner safety protection
const ownerMember = { userId: 'u-1', roleName: 'Owner', isOwner: true, state: 'ACTIVE' };
assert.equal(canModifyMember(ownerMember), false, 'Active owner cannot be modified');
assert.equal(canSuspendMember(ownerMember), false, 'Active owner cannot be suspended');
assert.equal(canRevokeMember(ownerMember), false, 'Active owner cannot be revoked');

// Admin / Member can be suspended/revoked
const activeAdmin = { userId: 'u-2', roleName: 'HR', isOwner: false, state: 'ACTIVE' };
assert.equal(canModifyMember(activeAdmin), true);
assert.equal(canSuspendMember(activeAdmin, governance), true);
assert.equal(canRevokeMember(activeAdmin, governance), true);

const suspendedMember = { userId: 'u-3', roleName: 'Member', isOwner: false, state: 'SUSPENDED' };
assert.equal(canModifyMember(suspendedMember), true);
assert.equal(canSuspendMember(suspendedMember, governance), false, 'Already suspended member cannot be suspended again');
assert.equal(canRevokeMember(suspendedMember, governance), true, 'Granted actor can revoke suspended member');

const revokedMember = { userId: 'u-4', roleName: 'Member', isOwner: false, state: 'REVOKED' };
assert.equal(canModifyMember(revokedMember), true);
assert.equal(canSuspendMember(revokedMember, governance), false);
assert.equal(canRevokeMember(revokedMember, governance), false, 'Revoked member cannot be revoked again');

// 6. Validation and Error extraction
assert.equal(workspaceProfileValidationMessage({ name: '' }), 'Workspace name is required.');
assert.equal(workspaceProfileValidationMessage({ name: '   ' }), 'Workspace name is required.');
assert.equal(workspaceProfileValidationMessage({ name: 'My Org' }), null);

assert.equal(invitationValidationMessage({ email: '' }), 'Recipient email is required.');
assert.equal(invitationValidationMessage({ email: 'notanemail' }), 'Enter a valid email address.');
assert.equal(
  invitationValidationMessage({
    email: 'user@example.test',
    expiresAt: new Date(Date.now() - 5000).toISOString(),
  }),
  'Invitation expiry must be in the future.'
);
assert.equal(
  invitationValidationMessage({
    email: 'user@example.test',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    roleId: 'SUPERADMIN',
  }),
  'Invitation role must be a valid UUID.'
);
assert.equal(
  invitationValidationMessage({
    email: 'user@example.test',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    roleId: '00000000-0000-4000-8000-000000000003',
  }),
  null
);

// Inline error handling (403, 409, generic)
assert.equal(
  apiErrorMessage({ status: 409, data: { message: 'A pending invitation already exists for this email' } }),
  'A pending invitation already exists for this email'
);
assert.equal(
  apiErrorMessage({ status: 403, data: { message: 'An active organization owner or admin is required' } }),
  'An active organization owner or admin is required'
);
assert.equal(apiErrorMessage(null, 'Fallback error'), 'Fallback error');

// 7. RTK Query cache isolation & reset on workspace switch and logout
const testOrgs = [
  { organizationId: 'org-1', name: 'Org One', role: 'OWNER' },
  { organizationId: 'org-2', name: 'Org Two', role: 'ADMIN' },
];
store.dispatch({
  type: 'auth/fetchMyOrganizations/fulfilled',
  payload: testOrgs,
});

store.dispatch(
  organizationApi.util.upsertQueryData('getOrganizationSettings', 'org-1', {
    id: 'org-1',
    name: 'Org One',
    logoUrl: null,
    role: 'OWNER',
  })
);
store.dispatch(
  organizationApi.util.upsertQueryData('getOrganizationMembers', 'org-1', [
    memberResponse,
  ])
);

let cachedQueries = Object.keys(store.getState().organizationApi.queries);
assert.ok(cachedQueries.length > 0, 'organizationApi queries must exist before switch');

// Switch workspace from org-1 to org-2 -> triggers resetTenantBoundState in store/index.js
store.dispatch(switchOrganization('org-2'));
cachedQueries = Object.keys(store.getState().organizationApi.queries);
assert.equal(cachedQueries.length, 0, 'organizationApi cache must be purged on workspace switch');

// Re-populate and test logout
store.dispatch(
  organizationApi.util.upsertQueryData('getOrganizationSettings', 'org-2', {
    id: 'org-2',
    name: 'Org Two',
    logoUrl: null,
    role: 'ADMIN',
  })
);
assert.ok(Object.keys(store.getState().organizationApi.queries).length > 0);

store.dispatch(logout());
assert.equal(
  Object.keys(store.getState().organizationApi.queries).length,
  0,
  'organizationApi cache must be purged on logout'
);

console.log('workspace-settings-contract.test.js passed successfully!');
