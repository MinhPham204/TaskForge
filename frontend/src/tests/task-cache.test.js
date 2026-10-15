import assert from 'node:assert/strict';
import axios from 'axios';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
const { store } = await import('../store/index.js');
const { setSessionFromDev, setActiveOrganization } = await import('../store/authSlice.js');
const { taskApi } = await import('../services/taskApi.js');
const { collaborationApi } = await import('../services/collaborationApi.js');
const { dashboardApi } = await import('../services/dashboardApi.js');
const { default: client } = await import('../utils/axiosInstance.js');
store.dispatch(setSessionFromDev({ user: { id: 'cache-user' }, token: 'test', organizations: [{ organizationId: 'cache-org' }, { organizationId: 'new-org' }] }));
store.dispatch(setActiveOrganization('cache-org'));
const ok = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
let progress = 0;
const counts = new Map();
let mutationHandler = async config => ok(config, { id: 't' });
client.defaults.adapter = async config => {
  if (config.method !== 'get') return mutationHandler(config);
  const key = `${config.url}:${JSON.stringify(config.params || {})}`;
  counts.set(key, (counts.get(key) || 0) + 1);
  return ok(config, { id: 't', effectiveProgress: progress, checklist: [{ id: 'i', completedAt: progress ? '2026-10-13' : null }] });
};
const subscriptions = [];
async function subscribe(api, name, args) {
  const request = store.dispatch(api.endpoints[name].initiate(args));
  subscriptions.push(request);
  await request.unwrap();
  return () => api.endpoints[name].select(args)(store.getState());
}
const selectors = [];
for (const name of ['getProjectTasks', 'getProjectTaskBoard', 'getProjectTaskOverview', 'getProjectTaskReport']) {
  selectors.push(await subscribe(taskApi, name, { projectId: 'p' }));
  selectors.push(await subscribe(taskApi, name, { projectId: 'p', search: 'filtered' }));
  await subscribe(taskApi, name, { projectId: 'other' });
}
selectors.push(await subscribe(taskApi, 'getProjectTaskDetail', { projectId: 'p', taskId: 't' }));
const otherDetail = await subscribe(taskApi, 'getProjectTaskDetail', { projectId: 'p', taskId: 'other-task' });
selectors.push(await subscribe(taskApi, 'getMyTasks', {}));
selectors.push(await subscribe(taskApi, 'getApprovalQueue', undefined));
selectors.push(await subscribe(dashboardApi, 'getDashboard', undefined));
const activity = await subscribe(collaborationApi, 'getProjectActivities', 'p');
await subscribe(collaborationApi, 'getProjectActivities', 'other');
const attachments = await subscribe(collaborationApi, 'getTaskAttachments', { projectId: 'p', taskId: 't' });
const waitForReads = async () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5));
    if (![taskApi, collaborationApi, dashboardApi].some(api => Object.values(store.getState()[api.reducerPath].queries).some(query => query.status === 'pending'))) return;
  }
  assert.fail('Refetch did not settle');
};
try {
  // Every business command must refresh even reads that no longer contain the
  // task, such as filtered boards and the previous assignee/approver queue.
  const commands = ['createProjectTask', 'updateProjectTask', 'archiveProjectTask', 'transitionTaskStatus', 'setTaskManualProgress', 'addChecklistItem', 'setChecklistItemCompletion', 'assignTask', 'unassignTask', 'configureApproval', 'requestApproval', 'resolveApproval'];
  for (const [index, name] of commands.entries()) {
    const before = selectors.map(select => select().requestId);
    const unrelated = otherDetail().requestId;
    const isolated = [...counts].filter(([key]) => key.includes('/other/'));
    progress = index === 4 ? 45 : index === 6 ? 33 : index;
    await store.dispatch(taskApi.endpoints[name].initiate({ projectId: 'p', taskId: 't', itemId: 'i', completed: true, statusId: 's', action: 'approve' })).unwrap();
    await waitForReads();
    selectors.forEach((select, i) => {
      assert.notEqual(select().requestId, before[i], `${name}: affected read ${i}`);
      assert.equal(select().data.effectiveProgress, progress);
    });
    assert.equal(otherDetail().requestId, unrelated);
    assert.deepEqual([...counts].filter(([key]) => key.includes('/other/')), isolated);
  }
  // Failed/ambiguous writes refetch; no inverse optimistic patch can overwrite
  // a newer successful checklist completion.
  let release;
  mutationHandler = config => new Promise((resolve, reject) => { release = () => reject(new axios.AxiosError('timeout', 'ECONNABORTED', config)); });
  const failed = store.dispatch(taskApi.endpoints.setChecklistItemCompletion.initiate({ projectId: 'p', taskId: 't', itemId: 'i', completed: false }));
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  mutationHandler = async config => { progress = 67; return ok(config, {}); };
  await store.dispatch(taskApi.endpoints.setChecklistItemCompletion.initiate({ projectId: 'p', taskId: 't', itemId: 'i', completed: true })).unwrap();
  release(); await failed; await waitForReads();
  assert.equal(selectors[8]().data.effectiveProgress, 67);
  assert.ok(selectors[8]().data.checklist[0].completedAt);
  for (const name of ['uploadTaskAttachment', 'unlinkTaskAttachment']) {
    const beforeAttachment = selectors.map(select => select().requestId);
    const beforeActivity = activity().requestId, beforeFiles = attachments().requestId;
    await store.dispatch(collaborationApi.endpoints[name].initiate({ projectId: 'p', taskId: 't', attachmentId: 'a', formData: new FormData() })).unwrap();
    await waitForReads();
    selectors.forEach((select, i) => i === 8 ? assert.notEqual(select().requestId, beforeAttachment[i]) : assert.equal(select().requestId, beforeAttachment[i]));
    assert.notEqual(activity().requestId, beforeActivity);
    assert.notEqual(attachments().requestId, beforeFiles);
  }
  for (const name of ['createComment', 'editComment', 'deleteComment']) {
    const before = selectors.map(select => select().requestId);
    const beforeActivity = activity().requestId;
    await store.dispatch(taskApi.endpoints[name].initiate({ projectId: 'p', taskId: 't', commentId: 'c', body: 'Test' })).unwrap();
    await waitForReads();
    selectors.forEach((select, i) => i === 8 ? assert.notEqual(select().requestId, before[i]) : assert.equal(select().requestId, before[i]));
    assert.notEqual(activity().requestId, beforeActivity);
  }
  // Reload with no subscription/cache fetches the same authoritative value.
  store.dispatch(taskApi.util.resetApiState());
  const reloaded = await subscribe(taskApi, 'getProjectTaskDetail', { projectId: 'p', taskId: 't' });
  assert.equal(reloaded().data.effectiveProgress, 67);
  // A late previous-workspace mutation must not invalidate the new workspace.
  mutationHandler = config => new Promise(resolve => { release = () => resolve(ok(config, {})); });
  release = undefined;
  const late = store.dispatch(taskApi.endpoints.setTaskManualProgress.initiate({ projectId: 'p', taskId: 't', manualProgress: 45 }));
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  store.dispatch(setActiveOrganization('new-org'));
  const current = await subscribe(taskApi, 'getProjectTaskBoard', { projectId: 'p' });
  const requestId = current().requestId;
  release(); await late; await waitForReads();
  assert.equal(current().requestId, requestId);
  // Switching away and back also clears ownership, even though the scope IDs
  // eventually match the original request again.
  release = undefined;
  const returning = store.dispatch(taskApi.endpoints.setTaskManualProgress.initiate({ projectId: 'p', taskId: 't', manualProgress: 45 }));
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  store.dispatch(setActiveOrganization('cache-org'));
  store.dispatch(setActiveOrganization('new-org'));
  const back = await subscribe(taskApi, 'getProjectTaskBoard', { projectId: 'p' });
  const backId = back().requestId;
  release(); await returning; await waitForReads();
  assert.equal(back().requestId, backId);
  console.log('task-cache: 12 commands, filters/project isolation, timeout/concurrent reconciliation, attachments, reload and workspace isolation passed');
} finally {
  subscriptions.forEach(request => request.unsubscribe());
  for (const api of [taskApi, collaborationApi, dashboardApi]) store.dispatch(api.util.resetApiState());
}

const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Card } = await server.ssrLoadModule('/src/pages/Projects/components/board/BoardTaskCard.jsx');
  for (const value of [0, 45, 33, 100]) {
    const html = renderToStaticMarkup(React.createElement(Card, { task: {
      id: 't', title: 'Canonical', effectiveProgress: value, manualProgress: 99, progress: 99,
      semanticCategory: value === 100 ? 'COMPLETED' : 'IN_PROGRESS', owningTeamName: 'Canonical Team',
      dueAt: '2020-01-01T09:30:00.000Z', assigneeProjectMembershipIds: ['a', 'b', 'missing'],
    }, members: [{ projectMembershipId: 'a', user: { name: 'Alice Test' } }, { id: 'b', user: { name: 'Bob Test' } }] }));
    assert.match(html, new RegExp(`>${value}%<`));
    for (const text of ['Canonical Team', 'Alice Test', 'Bob Test', 'Unknown member', 'Jan']) assert.ok(html.includes(text), text);
    assert.equal(html.includes('text-rose-600 dark:text-rose-400 font-semibold'), value !== 100);
  }
  console.log('task-cache: actual Card SSR canonical 0/45/33/100, due date, overdue/completed, multiple membership IDs passed');
} finally { await server.close(); }
