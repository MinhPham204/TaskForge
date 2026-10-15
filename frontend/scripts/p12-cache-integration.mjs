import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
assert.match(fixture.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/);
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
globalThis.window = { location: { href: '' } };
const { store } = await import('../src/store/index.js');
const { setCredentials } = await import('../src/store/authSlice.js');
const { default: client } = await import('../src/utils/axiosInstance.js');
const { taskApi } = await import('../src/services/taskApi.js');
const { projectApi } = await import('../src/services/projectApi.js');
const { dashboardApi } = await import('../src/services/dashboardApi.js');
const { collaborationApi } = await import('../src/services/collaborationApi.js');
store.dispatch(setCredentials({ user: { id: fixture.userId }, accessToken: fixture.accessToken }));
localStorage.setItem('activeOrganizationId', fixture.organizationId);
client.defaults.baseURL = fixture.baseURL;
const { projectId, taskId, checklistTaskId } = fixture;
const subscriptions = [];
async function read(api, name, args) {
  const request = store.dispatch(api.endpoints[name].initiate(args));
  subscriptions.push(request);
  await request.unwrap();
  return () => api.endpoints[name].select(args)(store.getState());
}
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Card } = await server.ssrLoadModule('/src/pages/Projects/components/board/BoardTaskCard.jsx');
  const list = await read(taskApi, 'getProjectTasks', { projectId });
  const board = await read(taskApi, 'getProjectTaskBoard', { projectId });
  const filtered = await read(taskApi, 'getProjectTaskBoard', { projectId, search: 'manual' });
  const detail = await read(taskApi, 'getProjectTaskDetail', { projectId, taskId });
  const checklist = await read(taskApi, 'getProjectTaskDetail', { projectId, taskId: checklistTaskId });
  const mine = await read(taskApi, 'getMyTasks', {});
  const overview = await read(taskApi, 'getProjectTaskOverview', { projectId });
  const report = await read(taskApi, 'getProjectTaskReport', { projectId });
  const dashboard = await read(dashboardApi, 'getDashboard', undefined);
  const members = await read(projectApi, 'getProjectMembers', projectId);
  const wait = async () => {
    for (let attempt = 0; attempt < 150; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      if (![taskApi, dashboardApi, collaborationApi].some(api => Object.values(store.getState()[api.reducerPath].queries).some(query => query.status === 'pending'))) return;
    }
    assert.fail('HTTP cache reconciliation timed out');
  };
  const flatten = query => query().data.flatMap(column => column.tasks);
  const check = (id, progress) => {
    for (const tasks of [list().data, flatten(board), mine().data]) {
      assert.equal(tasks.find(task => task.id === id)?.effectiveProgress, progress);
    }
    const task = id === taskId ? detail().data : checklist().data;
    assert.equal(task.effectiveProgress, progress);
    assert.match(renderToStaticMarkup(React.createElement(Card, { task, members: members().data })), new RegExp(`>${progress}%<`));
  };
  check(taskId, 45); check(checklistTaskId, 33);
  const aggregates = [overview, report, dashboard];
  const previous = aggregates.map(select => select().requestId);
  await store.dispatch(taskApi.endpoints.setTaskManualProgress.initiate({ projectId, taskId, manualProgress: 0 })).unwrap();
  await wait(); check(taskId, 0);
  assert.equal(flatten(filtered).find(task => task.id === taskId).effectiveProgress, 0);
  aggregates.forEach((select, i) => assert.notEqual(select().requestId, previous[i]));
  await store.dispatch(taskApi.endpoints.setTaskManualProgress.initiate({ projectId, taskId, manualProgress: 45 })).unwrap();
  await wait(); check(taskId, 45);
  const item = checklist().data.checklist.find(entry => !entry.completedAt);
  await store.dispatch(taskApi.endpoints.setChecklistItemCompletion.initiate({ projectId, taskId: checklistTaskId, itemId: item.id, completed: true })).unwrap();
  await wait(); check(checklistTaskId, 66);
  // Forbidden checklist/manual combination is an authoritative 409, then the
  // consumers reconcile to the persisted checklist progress rather than 90.
  const denied = await store.dispatch(taskApi.endpoints.setTaskManualProgress.initiate({ projectId, taskId: checklistTaskId, manualProgress: 90 }));
  assert.equal(denied.error.status, 409);
  await wait(); check(checklistTaskId, 66);
  await store.dispatch(taskApi.endpoints.transitionTaskStatus.initiate({ projectId, taskId, statusId: fixture.completedStatusId })).unwrap();
  await wait(); check(taskId, 100);
  subscriptions.forEach(request => request.unsubscribe());
  store.dispatch(taskApi.util.resetApiState());
  const reload = await read(taskApi, 'getProjectTaskDetail', { projectId, taskId });
  assert.equal(reload().data.effectiveProgress, 100);
  console.log('P12 frontend-to-Nest cache/progress/Card persisted acceptance passed (45/0/66/100, 409, aggregates, filtered Board, reload)');
} catch (error) {
  // Never print request objects, authorization headers or connection URLs.
  console.error(`P12 cache acceptance failed: ${error instanceof assert.AssertionError ? error.message : 'HTTP/runtime failure'}; status=${error.status || 'n/a'}`);
  process.exitCode = 1;
} finally {
  subscriptions.forEach(request => request.unsubscribe());
  for (const api of [taskApi, projectApi, dashboardApi, collaborationApi]) store.dispatch(api.util.resetApiState());
  await server.close();
}
