import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { taskAssignmentSelection, requireEligibleNewAssignees } from '../utils/taskAssignments.js';
import { getTaskEditorAccess } from '../utils/taskCapabilities.js';
assert.deepEqual(taskAssignmentSelection(['inactive', 'a'], ['a', 'b'], ['b']), ['inactive', 'b']);
assert.doesNotThrow(() => requireEligibleNewAssignees(['inactive'], ['inactive', 'a'], [{ projectMembershipId: 'a' }]));
assert.throws(() => requireEligibleNewAssignees([], ['stale'], [{ projectMembershipId: 'a' }]), /no longer eligible/);
assert.equal(getTaskEditorAccess({ capabilities: {} }).allowed, false);
assert.equal(getTaskEditorAccess({ capabilities: { assign: { allowed: true } } }).allowed, true);
const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Picker } = await server.ssrLoadModule('/src/components/task/TaskAssigneePicker.jsx');
  const { default: Edit } = await server.ssrLoadModule('/src/components/task/TaskEditButton.jsx');
  let selected, edited;
  const props = { ids: ['inactive', 'a'], candidates: [{ projectMembershipId: 'a', name: 'Alice' }, { projectMembershipId: 'b', name: 'Bob' }],
    members: [{ projectMembershipId: 'inactive', user: { name: 'Old member' } }], canAssign: true, canUnassign: true, onChange: ids => { selected = ids; } };
  const children = element => [element, ...React.Children.toArray(element?.props?.children).flatMap(child => typeof child === 'object' ? children(child) : [])];
  const tree = children(Picker(props));
  const select = tree.find(element => element.type === 'select');
  select.props.onChange({ target: { selectedOptions: [{ value: 'b' }] } });
  assert.deepEqual(selected, ['inactive', 'b']);
  tree.find(element => element.props?.['aria-label'] === 'Remove Old member').props.onClick();
  assert.deepEqual(selected, ['a']);
  const html = renderToStaticMarkup(React.createElement(Picker, props));
  for (const text of ['Old member', 'no longer eligible', 'Alice', 'Bob', 'multiple']) assert.ok(html.includes(text));
  assert.ok(renderToStaticMarkup(React.createElement(Picker, { ...props, error: true })).includes('Could not load eligible members'));
  assert.ok(renderToStaticMarkup(React.createElement(Picker, { ...props, loading: true })).includes('Loading eligible members'));
  assert.ok(renderToStaticMarkup(React.createElement(Picker, { ...props, candidates: [], ids: [] })).includes('No eligible members'));
  const completedPm = { id: 'task', projectId: 'project', semanticCategory: 'COMPLETED', capabilities: { assign: { allowed: true } } };
  const button = Edit({ task: completedPm, onEditTask: task => { edited = task; } });
  assert.equal(button.props.disabled, false); button.props.onClick(); assert.equal(edited, completedPm);
  const contributor = { ...completedPm, capabilities: { editContent: { allowed: true }, assign: { allowed: false, reason: 'PROJECT_MANAGER_REQUIRED' } } };
  assert.equal(Edit({ task: contributor, onEditTask: () => {} }).props.disabled, false);
  const readOnly = { capabilities: { editContent: { allowed: false, reason: 'PROJECT_READ_ONLY' } } };
  const blocked = Edit({ task: readOnly, onEditTask: () => assert.fail('Read-only Edit must not run') });
  assert.equal(blocked.props.disabled, true); blocked.props.onClick(); assert.match(blocked.props.title, /read-only/);
  assert.equal(Edit({ task: contributor }).props.disabled, true);
  console.log('task-assignment.test.js passed (multiple selections, explicit inactive removal, stale IDs, actual picker/Edit SSR and callback/capability guards)');
} finally { await server.close(); }

// Exercise the production middleware: candidates in another Project/Team must
// not refetch when unrelated memberships change, or after a workspace switch.
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
const { store } = await import('../store/index.js');
const { setSessionFromDev, setActiveOrganization } = await import('../store/authSlice.js');
const { taskApi } = await import('../services/taskApi.js');
const { teamApi } = await import('../services/teamApi.js');
const { projectApi } = await import('../services/projectApi.js');
const { organizationApi } = await import('../services/organizationApi.js');
const { default: client } = await import('../utils/axiosInstance.js');
store.dispatch(setSessionFromDev({ user: { id: 'test-user' }, organizations: [{ organizationId: 'one' }, { organizationId: 'two' }] }));
const response = config => ({ config, data: [{ projectMembershipId: 'candidate', name: 'Test' }], status: 200, statusText: 'OK', headers: {} });
let handler = async config => response(config);
client.defaults.adapter = config => handler(config);
const subscriptions = [];
const subscribe = async args => {
  const request = store.dispatch(taskApi.endpoints.getTaskAssignmentCandidates.initiate(args));
  subscriptions.push(request); await request.unwrap();
  return () => taskApi.endpoints.getTaskAssignmentCandidates.select(args)(store.getState()).requestId;
};
const queryArgs = [{ projectId: 'p', teamId: 't' }, { projectId: 'p', teamId: 'other-team' }, { projectId: 'other-project', teamId: 't' }];
const queries = [];
for (const args of queryArgs) queries.push(await subscribe(args));
const wait = async () => {
  for (let i = 0; i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
    if (!Object.values(store.getState().taskApi.queries).some(query => query.status === 'pending')) return;
  }
  assert.fail('Candidate refetch did not settle');
};
try {
  for (const [api, command, args, affected] of [
    [projectApi, 'removeProjectMember', { projectId: 'p', projectMembershipId: 'member' }, [0, 1]],
    [teamApi, 'removeTeamMember', { teamId: 't', organizationMembershipId: 'member' }, [0, 2]],
    [organizationApi, 'suspendOrganizationMember', { organizationId: 'one', userId: 'member' }, [0, 1, 2]],
  ]) {
    const before = queries.map(query => query());
    await store.dispatch(api.endpoints[command].initiate(args)).unwrap(); await wait();
    queries.forEach((query, index) => affected.includes(index) ? assert.notEqual(query(), before[index]) : assert.equal(query(), before[index]));
  }
  let release;
  const beforeDenial = queries.map(query => query());
  handler = async config => {
    if (config.method === 'get') return response(config);
    throw { response: { status: 409, data: { code: 'TASK_MEMBER_INELIGIBLE', message: 'Inactive member' } } };
  };
  const denied = await store.dispatch(taskApi.endpoints.assignTask.initiate({ projectId: 'p', taskId: 'task', projectMembershipId: 'stale' }));
  assert.equal(denied.error.status, 409); await wait();
  queries.forEach((query, index) => index < 2 ? assert.notEqual(query(), beforeDenial[index]) : assert.equal(query(), beforeDenial[index]));
  handler = config => config.method === 'get' ? Promise.resolve(response(config)) : new Promise(resolve => { release = () => resolve(response(config)); });
  const late = store.dispatch(teamApi.endpoints.removeTeamMember.initiate({ teamId: 't', organizationMembershipId: 'member' }));
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  store.dispatch(setActiveOrganization('two'));
  const current = await subscribe(queryArgs[0]); const currentId = current();
  release(); await late; await wait(); assert.equal(current(), currentId);
  console.log('task-assignment.test.js candidate middleware passed (Project/Team scopes, Organization invalidation, late workspace response)');
} finally {
  subscriptions.forEach(request => request.unsubscribe());
  for (const api of [taskApi, teamApi, projectApi, organizationApi]) store.dispatch(api.util.resetApiState());
}
