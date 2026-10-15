import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';
import { fileURLToPath } from 'node:url';
import { createFileOperations } from '../src/utils/fileOperations.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
assert.match(fixture.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/);
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
let blob, clicks = 0, revokes = 0;
globalThis.window = { location: { href: '' }, URL: { createObjectURL(value) { blob = value; return 'blob:p12'; }, revokeObjectURL() { revokes++; } } };
globalThis.document = { createElement: () => ({ setAttribute() {}, click() { clicks++; } }), body: { appendChild() {}, removeChild() {} } };
const { store } = await import('../src/store/index.js');
const { setCredentials, fetchMyOrganizations } = await import('../src/store/authSlice.js');
const { default: client } = await import('../src/utils/axiosInstance.js');
const { taskApi } = await import('../src/services/taskApi.js');
const { collaborationApi, downloadTaskAttachment } = await import('../src/services/collaborationApi.js');
client.defaults.baseURL = fixture.baseURL;
store.dispatch(setCredentials({ user: { id: fixture.userId }, accessToken: fixture.accessToken }));
localStorage.setItem('activeOrganizationId', fixture.organizationId);
await store.dispatch(fetchMyOrganizations()).unwrap();
const { projectId, taskId } = fixture;
const query = { projectId, taskId }, requests = [];
const read = async () => { const request = store.dispatch(collaborationApi.endpoints.getTaskAttachments.initiate(query, { forceRefetch: true })); requests.push(request); return request.unwrap(); };
const detailRequest = store.dispatch(taskApi.endpoints.getProjectTaskDetail.initiate(query)); requests.push(detailRequest);
const task = await detailRequest.unwrap(); assert.equal(task.semanticCategory, 'COMPLETED');
assert.equal(task.capabilities.uploadAttachment.allowed, true); assert.equal(task.capabilities.unlinkAttachment.allowed, true);
const operations = createFileOperations(); let uploads = 0, loseAcknowledgment = false, list = await read();
operations.configure({ scope: `${fixture.organizationId}/${taskId}`, uploadAllowed: true, unlinkAllowed: true, readAllowed: true,
  upload: async file => { uploads++; const formData = new FormData(); formData.append('file', file); await store.dispatch(collaborationApi.endpoints.uploadTaskAttachment.initiate({ ...query, formData })).unwrap(); if (loseAcknowledgment) throw { status: undefined }; },
  unlink: file => store.dispatch(collaborationApi.endpoints.unlinkTaskAttachment.initiate({ ...query, attachmentId: file.id })).unwrap(),
  download: (file, isCurrent) => downloadTaskAttachment(projectId, taskId, file.id, file.originalName, { isCurrent }),
  read: async () => { list = await read(); },
});
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const file = new File(['P12 attachment consumer bytes'], 'consumer.txt', { type: 'text/plain' });
  operations.select({ target: { files: [file], value: 'selected' } }); await operations.upload();
  assert.equal(operations.snapshot().file, null);
  const attached = list.find(row => row.originalName === file.name); assert.ok(attached);
  await operations.download(attached); assert.equal(await blob.text(), 'P12 attachment consumer bytes'); assert.equal(clicks, 1); assert.equal(revokes, 1);
  const { default: Attachments } = await server.ssrLoadModule('/src/components/task/TaskAttachments.jsx');
  const { store: renderedStore } = await server.ssrLoadModule('/src/store/index.js');
  const { collaborationApi: renderedApi } = await server.ssrLoadModule('/src/services/collaborationApi.js');
  await renderedStore.dispatch(renderedApi.util.upsertQueryData('getTaskAttachments', query, list));
  const html = renderToStaticMarkup(React.createElement(Provider, { store: renderedStore }, React.createElement(Attachments, { projectId, task })));
  renderedStore.dispatch(renderedApi.util.resetApiState());
  assert.match(html, /consumer.txt/); assert.match(html, /Upload file/);
  assert.doesNotMatch(html.match(/<input[^>]*type="file"[^>]*>/)[0], /disabled/, 'Completed Task upload remains available in a mutable Project');
  operations.confirm(attached); await operations.unlink(); assert.ok(!list.some(row => row.id === attached.id));
  loseAcknowledgment = true; operations.select({ target: { files: [file], value: 'selected' } }); await operations.upload();
  assert.equal(operations.snapshot().uncertain, true); assert.equal(uploads, 2);
  await operations.upload(); assert.equal(uploads, 2); assert.ok(list.some(row => row.originalName === file.name));
  operations.acknowledge(); const final = list.find(row => row.originalName === file.name); operations.confirm(final); await operations.unlink();
  console.log('P12 actual attachment consumer passed (Completed/FILES off, production controller/store/SSR panel, multipart/Blob bytes/revoke, unlink, uncertain commit reconciliation without upload retry)');
} catch (error) {
  console.error(`P12 attachment consumer failed: ${error instanceof assert.AssertionError ? error.message : 'HTTP/runtime failure'}; status=${error.status || 'n/a'}`); process.exitCode = 1;
} finally { requests.forEach(request => request.unsubscribe()); store.dispatch(taskApi.util.resetApiState()); store.dispatch(collaborationApi.util.resetApiState()); await server.close(); }
