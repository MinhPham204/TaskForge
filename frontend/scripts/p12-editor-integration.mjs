import assert from 'node:assert/strict';
import { taskEditorDraft, saveTaskEditor, eligibleTaskApprovers } from '../src/utils/taskEditor.js';
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
const { collaborationApi } = await import('../src/services/collaborationApi.js');
const { dashboardApi } = await import('../src/services/dashboardApi.js');
store.dispatch(setCredentials({ user: { id: fixture.userId }, accessToken: fixture.accessToken }));
localStorage.setItem('activeOrganizationId', fixture.organizationId);
client.defaults.baseURL = fixture.baseURL;
const { projectId, taskId } = fixture;
let stage = 'initialization';
const invoke = async (api, name, args) => {
  stage = name;
  const request = store.dispatch(api.endpoints[name].initiate(args, { subscribe: false, forceRefetch: true }));
  return request.unwrap();
};
const readDetail = id => invoke(taskApi, 'getProjectTaskDetail', { projectId, taskId: id });
const calls = [];
const execute = async (command, args) => { calls.push({ command, args }); return invoke(taskApi, command, args); };
try {
  const project = await invoke(projectApi, 'getProjectById', projectId);
  const members = await invoke(projectApi, 'getProjectMembers', projectId);
  const initial = await readDetail(taskId);
  const session = { task: initial, initial: taskEditorDraft(initial) };
  const base = { projectId, project, members, execute, readDetail };
  const save = draft => saveTaskEditor({ ...base, session, draft });
  let draft = { ...taskEditorDraft(initial), title: 'P12 editor title-only' };
  assert.equal((await save(draft)).complete, true);
  let persisted = await readDetail(taskId);
  assert.deepEqual(Object.keys(calls[0].args).sort(), ['projectId', 'taskId', 'title']);
  for (const key of ['description', 'milestoneId', 'dueAt', 'statusId', 'approverProjectMembershipId']) assert.deepEqual(persisted[key], initial[key]);
  assert.deepEqual(persisted.assigneeProjectMembershipIds, initial.assigneeProjectMembershipIds);
  draft = { ...draft, description: '', labels: [] };
  assert.equal((await save(draft)).complete, true);
  persisted = await readDetail(taskId); assert.equal(persisted.description, '');
  assert.equal(persisted.dueAt, initial.dueAt); assert.equal(persisted.milestoneId, initial.milestoneId);
  draft = { ...draft, dueAt: '', milestoneId: '', statusId: fixture.targetStatusId };
  assert.equal((await save(draft)).complete, true);
  persisted = await readDetail(taskId);
  assert.equal(persisted.dueAt, null); assert.equal(persisted.milestoneId, null);
  assert.equal(persisted.statusId, fixture.targetStatusId);
  assert.equal(calls.at(-1).command, 'transitionTaskStatus');

  const approvers = eligibleTaskApprovers(members, initial.creatorProjectMembershipId, initial.assigneeProjectMembershipIds);
  const first = approvers[0].projectMembershipId, second = approvers[1].projectMembershipId;
  draft = { ...draft, requiresApproval: true, approverMembershipId: first };
  assert.equal((await save(draft)).complete, true);
  assert.equal((await readDetail(taskId)).approverProjectMembershipId, first);
  draft = { ...draft, approverMembershipId: second };
  assert.equal((await save(draft)).complete, true);
  assert.equal((await readDetail(taskId)).approverProjectMembershipId, second);
  // Another command begins a pending cycle after the editor took its snapshot.
  await invoke(taskApi, 'requestApproval', { projectId, taskId });
  draft = { ...draft, title: 'P12 persisted before approval denial', approverMembershipId: first };
  const before = calls.length;
  const partial = await save(draft);
  assert.equal(partial.complete, false); assert.equal(partial.error.status, 409);
  assert.equal(partial.error.data.code, 'TASK_APPROVAL_PENDING');
  assert.equal(partial.saved.length, 1); assert.equal(partial.failed, 'Approval configuration');
  persisted = await readDetail(taskId);
  assert.equal(persisted.title, draft.title); assert.equal(persisted.approverProjectMembershipId, second);
  assert.equal(persisted.capabilities.configureApproval.allowed, false);
  // Cancellation is explicit and separate from the editor's save sequence.
  await invoke(taskApi, 'resolveApproval', { projectId, taskId, action: 'cancel', reason: 'P12 explicit configuration change' });
  session.task = await readDetail(taskId);
  assert.equal((await save(draft)).complete, true);
  assert.deepEqual(calls.slice(before).map(entry => entry.command), ['updateProjectTask', 'configureApproval', 'configureApproval']);
  assert.equal((await readDetail(taskId)).approverProjectMembershipId, first);
  draft = { ...draft, requiresApproval: false };
  assert.equal((await save(draft)).complete, true);
  persisted = await readDetail(taskId);
  assert.equal(persisted.requiresApproval, false); assert.equal(persisted.approverProjectMembershipId, null);

  const creating = { task: null, initial: taskEditorDraft() };
  const creatorId = members.find(member => member.user.id === fixture.userId).projectMembershipId;
  const createDraft = { ...taskEditorDraft(initial), title: 'P12 retry creation', requiresApproval: false,
    assigneeIds: ['00000000-0000-4000-8000-000000000000'] };
  const countBefore = (await invoke(taskApi, 'getProjectTasks', { projectId })).length;
  const createPartial = await saveTaskEditor({ ...base, session: creating, draft: createDraft, creatorId });
  assert.equal(createPartial.complete, false); assert.equal(createPartial.failed, 'Add assignee');
  assert.equal(createPartial.saved[0], 'Create Task');
  const createdId = creating.task.id;
  createDraft.assigneeIds = [...initial.assigneeProjectMembershipIds];
  assert.equal((await saveTaskEditor({ ...base, session: creating, draft: createDraft, creatorId })).complete, true);
  assert.equal(creating.task.id, createdId);
  assert.equal((await invoke(taskApi, 'getProjectTasks', { projectId })).length, countBefore + 1);
  assert.deepEqual((await readDetail(createdId)).assigneeProjectMembershipIds, initial.assigneeProjectMembershipIds);
  console.log('P12 frontend-to-Nest editor persisted acceptance passed (dirty patch, clears, status, approver changes, pending/partial retry, create retry)');
} catch (error) {
  console.error(`P12 editor acceptance failed at ${stage}: ${error instanceof assert.AssertionError ? error.message : 'HTTP/runtime failure'}; status=${error.status || 'n/a'}; code=${error.data?.code || 'n/a'}; message=${error.data?.message || 'n/a'}`);
  process.exitCode = 1;
} finally {
  for (const api of [taskApi, projectApi, collaborationApi, dashboardApi]) store.dispatch(api.util.resetApiState());
}
