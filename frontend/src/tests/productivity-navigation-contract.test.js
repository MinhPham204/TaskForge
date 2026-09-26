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
import { API_PATHS } from '../utils/apiPaths.js';
import {
  getNotificationDestination,
  getResourceDestination,
  getRecentStorageKey,
  getRecentDestinations,
  addRecentDestination,
  clearRecentDestinations,
} from '../utils/navigation.js';
import { store } from '../store/index.js';
import { searchApi } from '../services/searchApi.js';
import { fetchMyOrganizations, switchOrganization, logout } from '../store/authSlice.js';

console.log('Starting Scoped Productivity Navigation (P8-09) verification...');

// 1. Contract & Paths
assert.equal(API_PATHS.SEARCH, '/api/search');
assert.equal(isTenantScopedRequest('/api/search'), true);
assert.equal(isTenantScopedRequest('/api/search?query=audit&limit=10'), true);

// 2. Tenant header injection on search endpoint
const captureRequest = async (config) => ({
  data: null,
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});

localStorage.setItem('token', 'valid-jwt-token');
localStorage.setItem(ACTIVE_ORG_KEY, '  workspace-alpha  ');

let response = await axiosInstance.get('/api/search?query=test', { adapter: captureRequest });
assert.equal(response.config.headers.get('x-organization-id'), 'workspace-alpha');

// Negative tenant headers: when invalid or missing active org, header should not be applied
for (const invalidOrg of ['', '   ', 'null', 'undefined']) {
  localStorage.setItem(ACTIVE_ORG_KEY, invalidOrg);
  const config = applyTenantHeader({
    url: '/api/search',
    headers: { 'x-organization-id': 'stale-org' },
  });
  assert.equal(config.headers['x-organization-id'], undefined, `Invalid org '${invalidOrg}' must clear tenant header`);
}

// 3. Resource Destinations
assert.equal(getResourceDestination('PROJECT', 'proj-101'), '/projects/proj-101');
assert.equal(getResourceDestination('PROJECT', null), null);
assert.equal(
  getResourceDestination('TASK', 'task-202', 'proj-101'),
  '/projects/proj-101?tab=tasks&task=task-202'
);
assert.equal(getResourceDestination('TASK', 'task-202', null), null, 'Task requires owning projectId');
assert.equal(getResourceDestination('TEAM', 'team-303'), '/teams/team-303');
assert.equal(getResourceDestination('UNKNOWN', 'x-1'), null);

// 4. Notification Destination & Target Contract
// Null target must yield null (safe, no wrong navigation triggered)
assert.equal(getNotificationDestination(null), null);
assert.equal(getNotificationDestination({}), null);
assert.equal(getNotificationDestination({ target: null }), null);
assert.equal(getNotificationDestination({ target: undefined }), null);

// Valid targets
assert.equal(
  getNotificationDestination({
    id: 'notif-1',
    target: { resourceType: 'PROJECT', resourceId: 'proj-1' },
  }),
  '/projects/proj-1'
);

assert.equal(
  getNotificationDestination({
    id: 'notif-2',
    target: { resourceType: 'TASK', resourceId: 'task-1', projectId: 'proj-1' },
  }),
  '/projects/proj-1?tab=tasks&task=task-1'
);

assert.equal(
  getNotificationDestination({
    id: 'notif-3',
    target: { resourceType: 'TEAM', resourceId: 'team-1' },
  }),
  '/teams/team-1'
);

// Malformed target objects
assert.equal(
  getNotificationDestination({
    target: { resourceType: 'TASK', resourceId: 'task-1' }, // missing projectId
  }),
  null
);
assert.equal(
  getNotificationDestination({
    target: { resourceType: 'UNKNOWN', resourceId: '123' },
  }),
  null
);

// 5. Recent Destinations Namespacing and Cross-Workspace Isolation
storage.clear();

const u1 = 'user-alice';
const u2 = 'user-bob';
const orgA = 'org-engineering';
const orgB = 'org-marketing';

assert.equal(getRecentStorageKey(u1, orgA), `taskforge:recent:${u1}:${orgA}`);
assert.equal(getRecentStorageKey('  ' + u1 + '  ', '  ' + orgA + '  '), `taskforge:recent:${u1}:${orgA}`);
assert.equal(getRecentStorageKey('', orgA), null);
assert.equal(getRecentStorageKey(u1, ''), null);
assert.equal(getRecentStorageKey(null, orgA), null);

// Adding destinations
addRecentDestination(u1, orgA, {
  kind: 'PROJECT',
  id: 'proj-a1',
  title: 'Backend Refactor',
  description: 'PostgreSQL migration',
});

addRecentDestination(u1, orgA, {
  kind: 'TASK',
  id: 'task-t1',
  projectId: 'proj-a1',
  title: 'Write P8-09 tests',
});

const recentU1OrgA = getRecentDestinations(u1, orgA);
assert.equal(recentU1OrgA.length, 2);
assert.equal(recentU1OrgA[0].id, 'task-t1', 'Most recent item must be at index 0');
assert.equal(recentU1OrgA[1].id, 'proj-a1');

// Verify cross-workspace isolation: Org B must have zero recents for user 1
assert.deepEqual(getRecentDestinations(u1, orgB), []);
// Verify cross-user isolation: User 2 must have zero recents in Org A
assert.deepEqual(getRecentDestinations(u2, orgA), []);

// Deduplication on re-adding same resource
addRecentDestination(u1, orgA, {
  kind: 'PROJECT',
  id: 'proj-a1',
  title: 'Backend Refactor (Updated)',
});
const dedupedRecents = getRecentDestinations(u1, orgA);
assert.equal(dedupedRecents.length, 2, 'Must not duplicate items with same kind and id');
assert.equal(dedupedRecents[0].id, 'proj-a1', 'Re-visited item moved to front');

// Maximum 8 items kept
for (let i = 1; i <= 10; i++) {
  addRecentDestination(u1, orgA, {
    kind: 'TASK',
    id: `task-${i}`,
    projectId: 'proj-a1',
    title: `Task item ${i}`,
  });
}
const cappedRecents = getRecentDestinations(u1, orgA);
assert.equal(cappedRecents.length, 8, 'Recent destinations must be capped at 8');

// Clear recents for specific user + workspace
clearRecentDestinations(u1, orgA);
assert.deepEqual(getRecentDestinations(u1, orgA), []);

// 6. Quick Create capability logic verification
const computeQuickActions = (caps) => {
  if (!caps) return [];
  const actions = [];
  if (caps.canCreateProject) {
    actions.push({ type: 'PROJECT', path: '/projects?create=true' });
  }
  if (caps.canCreateTeam) {
    actions.push({ type: 'TEAM', path: '/teams?create=true' });
  }
  if (Array.isArray(caps.taskProjectIds) && caps.taskProjectIds.length > 0) {
    actions.push({
      type: 'TASK',
      path: `/projects/${caps.taskProjectIds[0]}?createTask=true`,
    });
  }
  return actions;
};

// Admin / Owner capabilities
const privilegedCaps = {
  canCreateProject: true,
  canCreateTeam: true,
  taskProjectIds: ['proj-lead-1', 'proj-lead-2'],
};
const adminActions = computeQuickActions(privilegedCaps);
assert.equal(adminActions.length, 3);
assert.equal(adminActions[0].path, '/projects?create=true');
assert.equal(adminActions[1].path, '/teams?create=true');
assert.equal(adminActions[2].path, '/projects/proj-lead-1?createTask=true');

// Member without project manager role
const memberWithoutLeadCaps = {
  canCreateProject: false,
  canCreateTeam: false,
  taskProjectIds: [],
};
assert.deepEqual(computeQuickActions(memberWithoutLeadCaps), [], 'Member must see NO quick-create actions');

// Member who is project manager on one project
const memberLeadCaps = {
  canCreateProject: false,
  canCreateTeam: false,
  taskProjectIds: ['proj-managed-3'],
};
const memberLeadActions = computeQuickActions(memberLeadCaps);
assert.equal(memberLeadActions.length, 1);
assert.equal(memberLeadActions[0].type, 'TASK');
assert.equal(memberLeadActions[0].path, '/projects/proj-managed-3?createTask=true');

// 7. Redux RTK Query searchApi cache lifecycle
const testOrganizations = [
  { organizationId: 'org-alpha', name: 'Alpha Org', role: 'admin' },
  { organizationId: 'org-beta', name: 'Beta Org', role: 'member' },
];

store.dispatch({
  type: fetchMyOrganizations.fulfilled.type,
  payload: testOrganizations,
});

store.dispatch(
  searchApi.util.upsertQueryData('search', { query: 'test', limit: 8 }, {
    query: 'test',
    results: [
      {
        kind: 'PROJECT',
        id: 'proj-1',
        projectId: 'proj-1',
        title: 'Alpha',
        description: null,
        updatedAt: new Date().toISOString(),
      },
    ],
    quickCreate: privilegedCaps,
  })
);

const getSearchQueriesCount = () =>
  Object.keys(store.getState()[searchApi.reducerPath]?.queries || {}).length;

assert.ok(getSearchQueriesCount() > 0, 'searchApi should contain cached search query before switch');

// Switch workspace -> must clear searchApi cache
store.dispatch(switchOrganization('org-beta'));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(getSearchQueriesCount(), 0, 'searchApi queries must be cleared on workspace switch');

// Add cached search data again
store.dispatch(
  searchApi.util.upsertQueryData('search', { query: 'another', limit: 8 }, {
    query: 'another',
    results: [],
    quickCreate: memberWithoutLeadCaps,
  })
);
assert.ok(getSearchQueriesCount() > 0, 'searchApi should contain cached search query before logout');

// Logout -> must clear searchApi cache
store.dispatch(logout());
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(getSearchQueriesCount(), 0, 'searchApi queries must be cleared on logout');

console.log('Scoped Productivity Navigation (P8-09) verification PASSED.');
