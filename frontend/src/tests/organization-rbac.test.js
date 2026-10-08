import assert from 'node:assert/strict';
import axiosInstance from '../utils/axiosInstance.js';
import { API_PATHS } from '../utils/apiPaths.js';
import { store } from '../store/index.js';
import { organizationApi } from '../services/organizationApi.js';
import { searchApi } from '../services/searchApi.js';
import {
  invalidateOrganizationCapabilities, selectOrganizationCapabilities,
  setOrganizationCapabilities, setSessionFromDev, switchOrganization, logout,
} from '../store/authSlice.js';
import {
  hasOrganizationPermission, organizationRoleName, invitableOrganizationRoles,
} from '../utils/organizationPermissions.js';
import { canManageWorkspace, canSuspendMember, canRevokeMember } from '../utils/workspaceSettings.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
const scope = { userId: 'user-a', organizationId: 'org-a' };
const roleId = '00000000-0000-4000-8000-000000000003';
const makeCapabilities = (permissions, version = 1) => ({
  isOwner: false,
  role: { id: roleId, name: 'HR', systemCode: null, isDefault: false, isProtected: false, archivedAt: null, version, permissionCodes: permissions, membershipCount: 1 },
  permissions,
});
let capabilities = makeCapabilities(['org.members.read', 'org.members.invite']);
const records = [];
let deferredRead;
let denyCapabilities = false;
let denyUpdates = false;
const originalAdapter = axiosInstance.defaults.adapter;
axiosInstance.defaults.adapter = async (config) => {
  records.push({ url: config.url, method: config.method, data: config.data ? JSON.parse(config.data) : undefined });
  if (config.url.endsWith('/permissions/me')) {
    if (deferredRead) {
      const deferred = deferredRead;
      deferredRead = null;
      deferred.started();
      const data = await deferred.response;
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    }
    if (denyCapabilities) throw { config, response: { status: 403, data: { message: 'Membership is suspended' } } };
    return { data: capabilities, status: 200, statusText: 'OK', headers: {}, config };
  }
  if (denyUpdates && config.method === 'patch') throw { config, response: { status: 403, data: { message: 'Permission was revoked' } } };
  return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
};
const readCapabilities = (options = {}) => store.dispatch(
  organizationApi.endpoints.getMyOrganizationPermissions.initiate(scope, options),
);
const permissionReadCount = () => records.filter((record) => record.url.endsWith('/permissions/me')).length;
const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Expected capability refresh did not complete');
};

try {
  // A custom role can receive one action without receiving related actions.
  assert.equal(hasOrganizationPermission(capabilities, 'org.members.invite'), true);
  assert.equal(canManageWorkspace(capabilities), false);
  assert.equal(hasOrganizationPermission({ role: { name: 'ADMIN', systemCode: 'ADMIN' } }, 'team.create'), false);
  assert.equal(organizationRoleName(capabilities), 'HR');
  assert.equal(organizationRoleName(null), 'Unknown role');
  const target = { isOwner: false, state: 'ACTIVE' };
  assert.equal(canSuspendMember(target, capabilities), false);
  assert.equal(canRevokeMember(target, makeCapabilities(['org.members.revoke'])), true);
  assert.equal(canRevokeMember({ ...target, isOwner: true }, makeCapabilities(['org.members.revoke'])), false);
  const roles = [
    { id: 'hr', name: 'HR', permissionCodes: ['org.members.invite'] },
    { id: 'admin', name: 'ADMIN', permissionCodes: ['team.create'] },
    { id: 'owner', systemCode: 'OWNER', isProtected: true, permissionCodes: [] },
    { id: 'archived', archivedAt: '2026-10-01', permissionCodes: [] },
  ];
  assert.deepEqual(invitableOrganizationRoles(roles, capabilities).map((role) => role.id), ['hr']);

  store.dispatch(setSessionFromDev({ user: { id: scope.userId }, organizations: [
    { organizationId: 'org-a', name: 'Alpha', role: 'ADMIN' },
    { organizationId: 'org-b', name: 'Beta', role: 'OWNER' },
  ], activeOrganizationId: scope.organizationId }));
  const initialRead = readCapabilities({ subscriptionOptions: { refetchOnFocus: true, refetchOnReconnect: true } });
  await initialRead.unwrap();
  assert.deepEqual(selectOrganizationCapabilities(store.getState()), capabilities);

  // A real HTTP 403 goes through baseQuery, clears rights and purges tenant data.
  await store.dispatch(organizationApi.util.upsertQueryData('getOrganizationMembers', 'org-a', [{ name: 'Private member' }]));
  denyUpdates = true;
  const forbidden = await store.dispatch(organizationApi.endpoints.updateOrganization.initiate({ organizationId: 'org-a', name: 'Denied change' }));
  denyUpdates = false;
  assert.equal(forbidden.error.status, 403);
  assert.equal(selectOrganizationCapabilities(store.getState()), null);
  assert.equal(Object.keys(store.getState().organizationApi.queries).length, 0);
  await readCapabilities({ forceRefetch: true, subscriptionOptions: { refetchOnFocus: true, refetchOnReconnect: true } }).unwrap();
  assert.equal(store.getState().auth.activeOrganization.roleName, 'HR');

  // The API retains version/UUID bodies and never sends the obsolete enum.
  await store.dispatch(organizationApi.endpoints.createOrganizationInvitation.initiate({
    organizationId: scope.organizationId, email: 'hr@example.test', roleId,
    role: 'ADMIN', expiresAt: '2027-01-01T00:00:00Z',
  })).unwrap();
  const invitation = records.find((record) => record.url.endsWith('/invitations'));
  assert.equal(invitation.data.roleId, roleId);
  assert.equal('role' in invitation.data, false);
  assert.equal(API_PATHS.ORGANIZATIONS.ROLE_PERMISSIONS('org-a', roleId), `/api/organizations/org-a/roles/${roleId}/permissions`);

  // Focus and successful role mutation re-read actor capabilities.
  let beforeReads = permissionReadCount();
  store.dispatch(organizationApi.internalActions.onFocus());
  await waitFor(() => permissionReadCount() > beforeReads);
  await waitFor(() => !organizationApi.endpoints.getMyOrganizationPermissions.select(scope)(store.getState()).isLoading);
  beforeReads = permissionReadCount();
  await store.dispatch(organizationApi.endpoints.replaceOrganizationRolePermissions.initiate({
    organizationId: scope.organizationId, roleId, expectedVersion: 1, permissionCodes: ['org.members.read'],
  })).unwrap();
  await waitFor(() => permissionReadCount() > beforeReads);
  await readCapabilities().unwrap();
  assert.deepEqual(records.find((record) => record.method === 'put').data, { expectedVersion: 1, permissionCodes: ['org.members.read'] });

  // Revoking a read permission removes previously cached governance and search data.
  await store.dispatch(organizationApi.util.upsertQueryData('getOrganizationMembers', 'org-a', [{ name: 'Private member' }]));
  await store.dispatch(searchApi.util.upsertQueryData('search', { query: 'private' }, { results: [{ id: 'private-task' }] }));
  capabilities = makeCapabilities(['org.members.invite'], 2);
  await readCapabilities({ forceRefetch: true }).unwrap();
  assert.equal(hasOrganizationPermission(selectOrganizationCapabilities(store.getState()), 'org.members.read'), false);
  assert.equal(Object.keys(store.getState().organizationApi.queries).length, 0);
  assert.equal(Object.keys(store.getState().searchApi.queries).length, 0);

  // A pre-403 response for the same User + Org cannot restore stale rights.
  let responseResolve;
  let startedResolve;
  const started = new Promise((resolve) => { startedResolve = resolve; });
  deferredRead = { started: startedResolve, response: new Promise((resolve) => { responseResolve = resolve; }) };
  const staleRead = readCapabilities({ forceRefetch: true });
  await started;
  store.dispatch(invalidateOrganizationCapabilities(scope));
  assert.equal(selectOrganizationCapabilities(store.getState()), null);
  const refreshedRead = readCapabilities({ forceRefetch: true });
  await waitFor(() => selectOrganizationCapabilities(store.getState()) !== null);
  responseResolve(makeCapabilities(['org.members.read', 'org.members.invite'], 1));
  await staleRead;
  await refreshedRead.unwrap();
  assert.deepEqual(selectOrganizationCapabilities(store.getState()), capabilities);

  // Another account or workspace never inherits the active snapshot.
  store.dispatch(switchOrganization('org-b'));
  assert.equal(selectOrganizationCapabilities(store.getState()), null);
  store.dispatch(setOrganizationCapabilities({ scope, capabilities }));
  assert.equal(selectOrganizationCapabilities(store.getState()), null);
  store.dispatch(switchOrganization('org-a'));
  await readCapabilities({ forceRefetch: true }).unwrap();
  store.dispatch(setSessionFromDev({ user: { id: 'user-b' }, organizations: [{ organizationId: 'org-a' }], activeOrganizationId: 'org-a' }));
  assert.equal(selectOrganizationCapabilities(store.getState()), null);
  store.dispatch(setOrganizationCapabilities({ scope, capabilities }));
  assert.equal(selectOrganizationCapabilities(store.getState()), null);

  // A denied capability read stays closed and does not recursively retry.
  store.dispatch(setSessionFromDev({ user: { id: scope.userId }, organizations: [{ organizationId: 'org-a' }], activeOrganizationId: 'org-a' }));
  denyCapabilities = true;
  beforeReads = permissionReadCount();
  const denied = await readCapabilities({ forceRefetch: true });
  assert.equal(denied.error.status, 403);
  assert.equal(selectOrganizationCapabilities(store.getState()), null);
  assert.equal(permissionReadCount(), beforeReads + 1);
  console.log('organization-rbac.test.js passed (permission isolation, contracts, refresh, revocation, stale-response and account/workspace isolation)');
} finally {
  axiosInstance.defaults.adapter = originalAdapter;
  store.dispatch(logout());
}
