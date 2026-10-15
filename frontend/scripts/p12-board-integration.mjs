import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { createBoardTransitions, boardTransitionMessage } from '../src/utils/boardTransitions.js';
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
store.dispatch(setCredentials({ user: { id: fixture.userId }, accessToken: fixture.accessToken }));
localStorage.setItem('activeOrganizationId', fixture.organizationId);
client.defaults.baseURL = fixture.baseURL;
const { projectId, taskId, completedStatusId } = fixture;
const query = { projectId };
const requests = [];
const read = async (args = query) => {
  const request = store.dispatch(taskApi.endpoints.getProjectTaskBoard.initiate(args, { forceRefetch: true }));
  requests.push(request); return request.unwrap();
};
const event = () => ({ preventDefault() {}, dataTransfer: { setData() {} } });
const controller = createBoardTransitions();
let columns, writes = 0, reads = 0, loseResponse = false;
const configure = () => controller.configure({ scope: projectId, lockKey: projectId, columns,
  execute: async args => {
    writes++;
    const result = await store.dispatch(taskApi.endpoints.transitionTaskStatus.initiate({ projectId, ...args })).unwrap();
    if (loseResponse) throw { status: undefined, data: 'Simulated response lost AFTER real HTTP commit' };
    return result;
  }, read: async () => { reads++; columns = await read(); configure(); } });
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Card } = await server.ssrLoadModule('/src/pages/Projects/components/board/BoardTaskCard.jsx');
  columns = await read(); configure();
  const before = columns.map(column => [column.id, column.tasks.length]);
  controller.start(event(), taskId);
  await controller.drop(event(), columns.find(column => column.tasks.some(task => task.id === taskId)).id);
  assert.equal(writes, 0);
  for (const [id, code] of [[fixture.checklistTaskId, 'TASK_CHECKLIST_INCOMPLETE'], [fixture.approvalTaskId, 'TASK_APPROVAL_REQUIRED']]) {
    controller.start(event(), id); await controller.drop(event(), completedStatusId);
    assert.ok(controller.snapshot().message.startsWith(boardTransitionMessage({ data: { code } })));
    assert.deepEqual(columns.map(column => [column.id, column.tasks.length]), before);
  }
  loseResponse = true;
  controller.start(event(), taskId); await controller.drop(event(), completedStatusId);
  assert.equal(writes, 3, 'No blind retry after lost response'); assert.equal(reads, 3);
  let saved = columns.flatMap(column => column.tasks).find(task => task.id === taskId);
  assert.equal(saved.statusId, completedStatusId); assert.equal(saved.semanticCategory, 'COMPLETED'); assert.equal(saved.effectiveProgress, 100);
  assert.match(renderToStaticMarkup(React.createElement(Card, { task: saved })), />100%</);
  assert.equal(columns.reduce((sum, column) => sum + column.tasks.length, 0), before.reduce((sum, [, count]) => sum + count, 0));
  const filtered = await read({ projectId, search: 'manual' });
  assert.equal(filtered.flatMap(column => column.tasks).find(task => task.id === taskId).statusId, completedStatusId);
  // A real reload and reopened metadata come from server, including its persisted manualProgress.
  loseResponse = false;
  const doing = fixture.statuses.find(status => status.semanticCategory === 'IN_PROGRESS').id;
  controller.start(event(), taskId); await controller.drop(event(), doing);
  saved = (await read()).flatMap(column => column.tasks).find(task => task.id === taskId);
  assert.equal(saved.statusId, doing); assert.equal(saved.semanticCategory, 'IN_PROGRESS'); assert.equal(saved.effectiveProgress, 100);
  const deny = async (headers, args, status, code) => {
    const response = await fetch(`${fixture.baseURL}/api/projects/${args.projectId}/tasks/${args.taskId}/status`, {
      method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ statusId: args.statusId }),
    });
    assert.equal(response.status, status); const body = await response.json(); assert.equal(body.code, code);
    assert.ok(boardTransitionMessage({ status, data: body }).length > 0);
  };
  const args = { projectId, taskId, statusId: doing };
  await deny(fixture.contributorHeaders, args, 403, 'TASK_EXECUTION_ACCESS_REQUIRED');
  await deny(fixture.readerHeaders, args, 403, 'PROJECT_MEMBERSHIP_REQUIRED');
  await deny({ Authorization: `Bearer ${fixture.accessToken}`, 'x-organization-id': fixture.otherHeaders['x-organization-id'] }, args, 403, 'TENANT_MEMBERSHIP_REQUIRED');
  const pmHeaders = { Authorization: `Bearer ${fixture.accessToken}`, 'x-organization-id': fixture.organizationId };
  for (const terminal of fixture.terminalProjects) await deny(pmHeaders, terminal, 409, 'PROJECT_READ_ONLY');
  console.log('P12 frontend-to-Nest Board persisted acceptance passed (same-column, checklist/approval 409, lost-response commit, status/progress/counts/filter/reload, execution/Project/tenant 403, terminal 409)');
} catch (error) {
  console.error(`P12 Board acceptance failed: ${error instanceof assert.AssertionError ? error.message : 'HTTP/runtime failure'}; status=${error.status || 'n/a'}`);
  process.exitCode = 1;
} finally {
  requests.forEach(request => request.unsubscribe()); store.dispatch(taskApi.util.resetApiState()); await server.close();
}
