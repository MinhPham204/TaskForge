import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createFileOperations, validateSelectedFile, fileErrorMessage } from '../utils/fileOperations.js';
const file = new File(['attachment'], 'same.txt', { type: 'text/plain' });
assert.match(validateSelectedFile(new File([], 'empty.txt', { type: 'text/plain' })), /empty/);
assert.match(validateSelectedFile({ name: 'x.txt', size: 10 * 1024 * 1024 + 1, type: 'text/plain' }), /10 MiB/);
assert.match(validateSelectedFile({ name: 'x.exe', size: 1, type: 'application/octet-stream' }), /Only/);
const selected = file => ({ target: { files: [file], value: 'selected' } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const operations = createFileOperations(); let uploads = 0, reads = 0, removed = 0;
const config = { scope: 'user/org/project/task', uploadAllowed: true, unlinkAllowed: true, readAllowed: true,
  upload: async () => { uploads++; }, unlink: async () => { removed++; }, download: async () => {}, read: async () => { reads++; } };
operations.configure(config);
const selection = selected(file); operations.select(selection); assert.equal(selection.target.value, '');
await operations.upload(); assert.equal(uploads, 1); assert.equal(reads, 1); assert.equal(operations.snapshot().file, null);
operations.select(selected(file)); assert.equal(operations.snapshot().file, file, 'Same file can be selected again');
operations.configure({ ...config, uploadAllowed: false }); await operations.upload(); assert.equal(uploads, 1);
operations.configure({ ...config, upload: async () => { uploads++; throw { status: 400, data: { message: 'validation denied' } }; } });
await operations.upload(); assert.equal(operations.snapshot().file, file); assert.equal(operations.snapshot().uncertain, false);
operations.configure(config); await operations.upload(); assert.equal(uploads, 3, 'Explicit retry retains file after known denial');
operations.select(selected(file)); operations.configure({ ...config, upload: async () => { uploads++; throw { status: undefined }; } });
await operations.upload(); assert.equal(operations.snapshot().uncertain, true);
const before = uploads; await operations.upload(); assert.equal(uploads, before, 'Unknown upload must not retry blindly');
operations.acknowledge(); assert.equal(operations.snapshot().file, null); assert.equal(operations.snapshot().uncertain, false);
const pending = deferred(); operations.configure({ ...config, upload: () => { uploads++; return pending.promise; } });
operations.select(selected(file)); const request = operations.upload();
assert.equal(operations.snapshot().busy, true); await operations.upload(); assert.equal(uploads, before + 1);
const remount = createFileOperations(); remount.configure(config); assert.equal(remount.snapshot().busy, true);
operations.cancel(); operations.configure({ ...config, scope: 'different-task' }); pending.reject({ status: 403, data: { message: 'old denial' } }); await request;
assert.equal(operations.snapshot().error, ''); assert.equal(operations.snapshot().file, null);
operations.configure({ ...config, scope: 'different-task', read: async () => { throw new Error('offline'); } });
operations.select(selected(file)); await operations.upload(); assert.equal(operations.snapshot().blocked, true);
operations.configure({ ...config, scope: 'different-task' }); await operations.refresh(); assert.equal(operations.snapshot().blocked, false);
operations.confirm({ id: 'attachment', originalName: 'other-member.txt' }); await operations.unlink(); assert.equal(removed, 1); assert.equal(operations.snapshot().confirm, null);
const lateDownload = deferred(); let launched = false;
operations.configure({ ...config, scope: 'download', download: async (_row, isCurrent) => { await lateDownload.promise; if (isCurrent()) launched = true; } });
const downloading = operations.download({ id: 'a' }); operations.cancel(); operations.configure({ ...config, scope: 'download' }); lateDownload.resolve(); await downloading; assert.equal(launched, false);
const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Panel } = await server.ssrLoadModule('/src/components/task/FilePanel.jsx');
  const row = { id: 'a', originalName: 'shared.txt', sizeBytes: 9, mediaType: 'text/plain', uploaderName: 'Other member' };
  const props = { title: 'Attachments', files: [row], uploadAllowed: true, unlinkAllowed: true, operations, state: operations.snapshot() };
  const children = element => [element, ...React.Children.toArray(element?.props?.children).flatMap(child => typeof child === 'object' ? children(child) : [])];
  const tree = children(Panel(props));
  tree.find(element => element.props?.['aria-label'] === 'Remove shared.txt').props.onClick(); assert.equal(operations.snapshot().confirm.id, 'a');
  const readOnly = renderToStaticMarkup(React.createElement(Panel, { ...props, uploadAllowed: false, unlinkAllowed: false, reason: 'This Project is read-only.' }));
  assert.match(readOnly, /read-only/); assert.match(readOnly, /Other member/);
  assert.match(renderToStaticMarkup(React.createElement(Panel, { ...props, loading: true })), /Loading files/);
  const error = renderToStaticMarkup(React.createElement(Panel, { ...props, files: [], error: { status: 503 } }));
  assert.match(error, /Could not load files/); assert.ok(!error.includes('No files attached'));
  assert.match(renderToStaticMarkup(React.createElement(Panel, { ...props, files: [] })), /No files attached/);
  assert.match(fileErrorMessage({ response: { data: { code: 'PROJECT_READ_ONLY' } } }), /read-only/);
  console.log('file-operations passed (validation/input reset/same-file retry, capability/pending/remount gates, unknown upload guard, failed read, late scopes/download, actual Panel SSR/events)');
} finally { await server.close(); }

// Production download helper must suppress stale downloads and revoke Blob URLs
// even when the native click fails.
const values = new Map([['token', 'test-token'], ['activeOrganizationId', 'org']]);
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
const { default: client } = await import('../utils/axiosInstance.js');
const { downloadTaskAttachment, collaborationApi } = await import('../services/collaborationApi.js');
let created = 0, revoked = 0;
globalThis.window = { URL: { createObjectURL() { created++; return 'blob:test'; }, revokeObjectURL() { revoked++; } } };
globalThis.document = { createElement: () => ({ setAttribute() {}, click() { throw new Error('native click failed'); } }), body: { appendChild() {}, removeChild() {} } };
client.defaults.adapter = async config => ({ data: new Blob(['bytes']), headers: {}, status: 200, statusText: 'OK', config });
await downloadTaskAttachment('p', 't', 'a', 'x.txt', { isCurrent: () => false }); assert.equal(created, 0);
await assert.rejects(downloadTaskAttachment('p', 't', 'a')); assert.equal(created, 1); assert.equal(revoked, 1);

const { store } = await import('../store/index.js');
const { setSessionFromDev, setActiveOrganization } = await import('../store/authSlice.js');
store.dispatch(setSessionFromDev({ user: { id: 'u' }, organizations: [{ organizationId: 'org' }, { organizationId: 'other' }] }));
store.dispatch(setActiveOrganization('org'));
client.defaults.adapter = async config => ({ data: config.method === 'get' ? [] : { id: 'new' }, headers: {}, status: 200, statusText: 'OK', config });
const requests = [];
const readProject = async projectId => { const request = store.dispatch(collaborationApi.endpoints.getProjectFiles.initiate(projectId)); requests.push(request); await request.unwrap(); return () => collaborationApi.endpoints.getProjectFiles.select(projectId)(store.getState()); };
const a = await readProject('a'), b = await readProject('b');
const wait = () => Promise.all(store.dispatch(collaborationApi.util.getRunningQueriesThunk()).map(request => request.unwrap()));
for (const name of ['uploadProjectFile', 'removeProjectFile']) {
  const previousA = a().requestId, previousB = b().requestId;
  await store.dispatch(collaborationApi.endpoints[name].initiate({ projectId: 'a', formData: new FormData(), fileId: 'f' })).unwrap(); await wait();
  assert.notEqual(a().requestId, previousA); assert.equal(b().requestId, previousB);
}
const late = deferred(); client.defaults.adapter = config => config.method === 'post' ? late.promise : Promise.resolve({ data: [], headers: {}, status: 200, statusText: 'OK', config });
const oldRequest = store.dispatch(collaborationApi.endpoints.uploadProjectFile.initiate({ projectId: 'a', formData: new FormData() }));
await Promise.resolve(); store.dispatch(setActiveOrganization('other')); store.dispatch(setActiveOrganization('org'));
const returned = await readProject('a'), originalId = returned().requestId;
late.resolve({ data: { id: 'old' }, headers: {}, status: 200, statusText: 'OK', config: {} }); await oldRequest.unwrap(); await wait(); assert.equal(returned().requestId, originalId);
requests.forEach(request => request.unsubscribe()); store.dispatch(collaborationApi.util.resetApiState());
console.log('file-operations Project cache ownership passed (affected Project only, late workspace return isolation, stale download suppression/Blob cleanup)');
