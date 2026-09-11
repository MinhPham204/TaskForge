import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

import axiosInstance, {
  ACTIVE_ORG_KEY,
  applyTenantHeader,
  isTenantScopedRequest,
} from '../utils/axiosInstance.js';
import authReducer, {
  fetchMyOrganizations,
  logout,
  selectActiveOrganization,
  selectActiveOrganizationId,
  selectOrganizationId,
  selectOrganizations,
  selectRole,
  switchOrganization,
} from '../store/authSlice.js';
import { store } from '../store/index.js';
import { taskApi } from '../services/taskApi.js';
import { teamApi } from '../services/teamApi.js';
import { organizationApi } from '../services/organizationApi.js';
import { projectApi } from '../services/projectApi.js';
import { collaborationApi } from '../services/collaborationApi.js';
import { API_PATHS } from '../utils/apiPaths.js';

console.log('Starting PostgreSQL workspace compatibility verification...');

assert.equal(API_PATHS.AUTH.GET_PROFILE, '/api/auth/me');
assert.equal(API_PATHS.AUTH.MY_ORGANIZATIONS, '/api/auth/my-organizations');
assert.equal(API_PATHS.INVITATIONS.LIST, '/api/invitations');
assert.equal(API_PATHS.INVITATIONS.ACCEPT, '/api/invitations/accept');
assert.equal(API_PATHS.TASKS.MY, '/api/tasks/my');
assert.equal(API_PATHS.TASKS.APPROVAL_QUEUE, '/api/tasks/approval-queue');

for (const url of [
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/my-organizations',
  '/api/invitations',
  '/api/invitations/accept',
  '/api/organizations',
]) {
  assert.equal(isTenantScopedRequest(url), false, `${url} must remain control-plane`);
}

for (const url of [
  '/api/projects',
  '/api/projects/project-1/tasks',
  '/api/tasks/my',
  '/api/tasks/approval-queue',
  '/api/teams',
  '/api/organizations/org-1/invitations',
  '/api/notifications',
]) {
  assert.equal(isTenantScopedRequest(url), true, `${url} must be tenant-scoped`);
}

const captureRequest = async (config) => ({
  data: null,
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});

localStorage.setItem('token', 'access-token');
localStorage.setItem(ACTIVE_ORG_KEY, '  org-1  ');
let response = await axiosInstance.get('/api/projects', { adapter: captureRequest });
assert.equal(response.config.headers.get('x-organization-id'), 'org-1');

response = await axiosInstance.get('/api/invitations', {
  adapter: captureRequest,
  headers: { 'x-organization-id': 'stale-org' },
});
assert.equal(response.config.headers.get('x-organization-id'), undefined);

for (const invalidId of ['', '   ', 'null', 'undefined']) {
  localStorage.setItem(ACTIVE_ORG_KEY, invalidId);
  const config = applyTenantHeader({
    url: '/api/projects',
    headers: { 'x-organization-id': 'stale-org' },
  });
  assert.equal(config.headers['x-organization-id'], undefined);
}

const organizations = [
  {
    organizationId: 'org-1',
    name: 'Engineering',
    slug: 'engineering',
    logoUrl: null,
    role: 'admin',
    joinedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    organizationId: 'org-2',
    name: 'Design',
    slug: 'design',
    logoUrl: null,
    role: 'member',
    joinedAt: '2026-09-02T00:00:00.000Z',
  },
];

localStorage.setItem(ACTIVE_ORG_KEY, 'org-2');
let state = authReducer(undefined, {
  type: fetchMyOrganizations.fulfilled.type,
  payload: organizations,
});
assert.equal(state.activeOrganizationId, 'org-2');
assert.equal(state.activeOrganization.role, 'member');

localStorage.setItem(ACTIVE_ORG_KEY, 'missing-org');
state = authReducer(undefined, {
  type: fetchMyOrganizations.fulfilled.type,
  payload: organizations,
});
assert.equal(state.activeOrganizationId, 'org-1');
assert.equal(localStorage.getItem(ACTIVE_ORG_KEY), 'missing-org', 'reducers must stay pure');

state = authReducer(
  {
    user: { id: 'user-1', email: 'user@example.com' },
    organizations: [],
    activeOrganizationId: null,
    activeOrganization: null,
  },
  { type: fetchMyOrganizations.fulfilled.type, payload: [] },
);
assert.equal(state.activeOrganizationId, null);
assert.equal(state.activeOrganization, null);

const selectorState = {
  auth: {
    organizations,
    activeOrganizationId: 'org-1',
    activeOrganization: organizations[0],
  },
};
assert.deepEqual(selectOrganizations(selectorState), organizations);
assert.equal(selectActiveOrganization(selectorState), organizations[0]);
assert.equal(selectActiveOrganizationId(selectorState), 'org-1');
assert.equal(selectOrganizationId(selectorState), 'org-1');
assert.equal(selectRole(selectorState), 'admin');

store.dispatch({
  type: fetchMyOrganizations.fulfilled.type,
  payload: organizations,
});
await Promise.all([
  store.dispatch(taskApi.util.upsertQueryData('getMyTasks', undefined, [{ id: 'task-1' }])),
  store.dispatch(teamApi.util.upsertQueryData('getTeams', undefined, [{ id: 'team-1' }])),
  store.dispatch(organizationApi.util.upsertQueryData('getPendingInvitations', undefined, [])),
  store.dispatch(projectApi.util.upsertQueryData('getProjects', undefined, [{ id: 'project-1' }])),
  store.dispatch(collaborationApi.util.upsertQueryData('getNotifications', undefined, [])),
]);

const queryCount = (api) => Object.keys(store.getState()[api.reducerPath].queries).length;
for (const api of [taskApi, teamApi, organizationApi, projectApi, collaborationApi]) {
  assert.ok(queryCount(api) > 0, `${api.reducerPath} should contain seeded tenant data`);
}

store.dispatch(switchOrganization('org-2'));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(localStorage.getItem(ACTIVE_ORG_KEY), 'org-2');
for (const api of [taskApi, teamApi, organizationApi, projectApi, collaborationApi]) {
  assert.equal(queryCount(api), 0, `${api.reducerPath} must reset on workspace switch`);
}

localStorage.setItem('refreshToken', 'refresh-token');
localStorage.setItem('authUser', JSON.stringify({ id: 'user-1' }));
store.dispatch(logout());
await new Promise((resolve) => setTimeout(resolve, 0));
for (const key of ['token', 'refreshToken', 'authUser', ACTIVE_ORG_KEY]) {
  assert.equal(localStorage.getItem(key), null, `${key} must be removed on logout`);
}

console.log('PostgreSQL workspace compatibility verification PASSED.');
