import assert from 'node:assert/strict';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
assert.match(fixture.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/);
const values = new Map([['token', fixture.accessToken], ['activeOrganizationId', fixture.organizationId]]);
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
globalThis.window = { location: { href: '' } };
const { configureStore } = await import('@reduxjs/toolkit');
const { default: client } = await import('../src/utils/axiosInstance.js');
const { collaborationApi } = await import('../src/services/collaborationApi.js');
const { API_PATHS } = await import('../src/utils/apiPaths.js');
client.defaults.baseURL = fixture.baseURL;
const store = configureStore({ reducer: { [collaborationApi.reducerPath]: collaborationApi.reducer }, middleware: get => get().concat(collaborationApi.middleware) });
const invoke = async (name, args) => {
  const action = store.dispatch(collaborationApi.endpoints[name].initiate(args, { subscribe: false, forceRefetch: true }));
  try { return await action.unwrap(); } finally { action.unsubscribe?.(); }
};
const { projectId, taskId } = fixture;
try {
  for (const task of [true, false]) {
    const bytes = 'P12 multipart bytes — verified';
    const formData = new FormData();
    formData.append('file', new Blob([bytes], { type: 'text/plain' }), 'boundary.txt');
    formData.append('displayName', 'HTTP integration');
    const args = { projectId, taskId, formData };
    const file = await invoke(task ? 'uploadTaskAttachment' : 'uploadProjectFile', args);
    assert.ok(file.id);
    const list = await invoke(task ? 'getTaskAttachments' : 'getProjectFiles', task ? { projectId, taskId } : projectId);
    assert.ok(list.some(entry => entry.id === file.id));
    const url = task ? API_PATHS.PROJECTS.TASKS.ATTACHMENTS.DOWNLOAD(projectId, taskId, file.id) : API_PATHS.PROJECTS.FILES.DOWNLOAD(projectId, file.id);
    const download = await client.get(url, { responseType: 'arraybuffer' });
    assert.equal(Buffer.from(download.data).toString('utf8'), bytes);
    await invoke(task ? 'unlinkTaskAttachment' : 'removeProjectFile', { projectId, taskId, attachmentId: file.id, fileId: file.id });
    await assert.rejects(client.get(url), error => error.response?.status === 404);
  }
  console.log('P12 actual frontend-to-Nest HTTP multipart/list/download/unlink passed (Task + Project)');
} finally { store.dispatch(collaborationApi.util.resetApiState()); }
