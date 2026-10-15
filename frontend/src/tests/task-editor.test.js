import assert from 'node:assert/strict';
import { taskEditorDraft, planTaskEditorSave, saveTaskEditor, editorPermissions, splitTaskDescription } from '../utils/taskEditor.js';

const allow = { allowed: true, reason: null };
const caps = Object.fromEntries(['editContent', 'editManagement', 'transition', 'assign', 'unassign', 'configureApproval'].map(key => [key, allow]));
const task = { id: 'task', projectId: 'project', title: 'Original', description: 'Keep exact whitespace  \n\nLabels: #Security, #API',
  owningTeamId: 'team', statusId: 'todo', priorityCode: 'HIGH', dueAt: '2026-12-01T09:30:00.000+07:00', milestoneId: 'milestone',
  creatorProjectMembershipId: 'creator', assigneeProjectMembershipIds: ['a', 'b'], requiresApproval: true,
  approverProjectMembershipId: 'approver', capabilities: caps };
const project = { viewer: { canCreateTask: true, canManage: true } };
const members = ['creator', 'a', 'b', 'approver', 'other'].map(id => ({ projectMembershipId: id, user: { name: id } }));
const newSession = (value = task) => ({ task: structuredClone(value), initial: taskEditorDraft(value) });
const options = { project, members, creatorId: 'creator' };
const plan = (draft, session = newSession()) => planTaskEditorSave(session, draft, options);

assert.deepEqual(plan(taskEditorDraft(task)), []);
let draft = { ...taskEditorDraft(task), title: '  New title  ' };
assert.deepEqual(plan(draft), [{ command: 'updateProjectTask', label: 'Content/properties (title)', data: { title: 'New title' }, keys: ['title'] }]);
assert.deepEqual(plan({ ...taskEditorDraft(task), description: '', labels: [] })[0].data, { description: '' });
assert.deepEqual(plan({ ...taskEditorDraft(task), dueAt: '', milestoneId: '' })[0].data, { dueAt: null, milestoneId: null });
assert.deepEqual(plan({ ...taskEditorDraft(task), dueAt: '2026-12-02' })[0].data, { dueAt: '2026-12-02T00:00:00.000Z' });
assert.throws(() => plan({ ...taskEditorDraft(task), dueAt: '2026-02-31' }), /valid due date/);
assert.deepEqual(splitTaskDescription('Ordinary Labels: content\nMore text'), { description: 'Ordinary Labels: content\nMore text', labels: [] });
assert.throws(() => plan({ ...taskEditorDraft(task), title: ' '.repeat(50) }), /1–500/);
assert.throws(() => plan({ ...taskEditorDraft(task), title: 'x'.repeat(501) }), /1–500/);
assert.throws(() => plan({ ...taskEditorDraft(task), description: 'x'.repeat(9999), labels: ['Tag'] }), /10,000/);
assert.throws(() => plan({ ...taskEditorDraft(task), labels: ['Bad,Label'] }), /commas/);
assert.equal(plan({ ...taskEditorDraft(task), description: 'x'.repeat(10000), labels: [] })[0].data.description.length, 10000);
assert.deepEqual(plan({ ...taskEditorDraft(task), statusId: 'doing' }).map(step => step.command), ['transitionTaskStatus']);
assert.deepEqual(plan({ ...taskEditorDraft(task), approverMembershipId: 'other' })[0].data, { approverProjectMembershipId: 'other' });
assert.deepEqual(plan({ ...taskEditorDraft(task), requiresApproval: false })[0].data, { approverProjectMembershipId: null });
for (const approverMembershipId of ['', 'creator', 'a', 'missing']) assert.throws(() => plan({ ...taskEditorDraft(task), approverMembershipId }), /designated approver/);
const contributor = newSession({ ...task, capabilities: { ...caps, editManagement: { allowed: false, reason: 'PROJECT_MANAGER_REQUIRED' }, assign: { allowed: false, reason: 'PROJECT_MANAGER_REQUIRED' } } });
assert.equal(plan(draft, contributor)[0].data.title, 'New title');
assert.throws(() => plan({ ...taskEditorDraft(task), priorityCode: 'LOW' }, contributor), /Project Manager/);
const pending = newSession({ ...task, capabilities: { ...caps, configureApproval: { allowed: false, reason: 'TASK_APPROVAL_PENDING' } } });
assert.throws(() => plan({ ...taskEditorDraft(task), requiresApproval: false }, pending), /Cancel the pending approval separately/);
assert.equal(plan(draft, pending)[0].data.title, 'New title');
assert.equal(editorPermissions(null, { viewer: { canCreateTask: true, canManage: false } }).assign.allowed, false);
assert.equal(editorPermissions(null, null).editContent.allowed, false);
assert.equal(editorPermissions({ capabilities: {} }, project).editContent.allowed, false);

const session = newSession();
draft = { ...taskEditorDraft(task), title: 'Persisted title', assigneeIds: ['b', 'other'], approverMembershipId: 'approver', statusId: 'doing' };
let persisted = structuredClone(task), failAssignment = true;
const calls = [];
const execute = async (command, data) => {
  calls.push(command);
  if (command === 'updateProjectTask') persisted = { ...persisted, title: data.title };
  if (command === 'unassignTask') persisted.assigneeProjectMembershipIds = persisted.assigneeProjectMembershipIds.filter(id => id !== data.projectMembershipId);
  if (command === 'assignTask') {
    if (failAssignment) throw { status: 409, data: { message: 'Target not eligible' } };
    persisted.assigneeProjectMembershipIds.push(data.projectMembershipId);
  }
  if (command === 'transitionTaskStatus') persisted.statusId = data.statusId;
  return persisted;
};
const save = () => saveTaskEditor({ session, draft, projectId: 'project', ...options, execute, readDetail: async () => structuredClone(persisted) });
let result = await save();
assert.equal(result.complete, false);
assert.equal(result.failed, 'Add assignee');
assert.equal(result.saved.length, 2);
assert.equal(persisted.title, 'Persisted title');
assert.deepEqual(persisted.assigneeProjectMembershipIds, ['b']);
assert.equal(persisted.dueAt, task.dueAt); assert.equal(persisted.milestoneId, task.milestoneId);
failAssignment = false;
result = await save();
assert.equal(result.complete, true);
assert.deepEqual(calls, ['updateProjectTask', 'unassignTask', 'assignTask', 'assignTask', 'transitionTaskStatus']);
assert.deepEqual(persisted.assigneeProjectMembershipIds, ['b', 'other']);
assert.equal(persisted.statusId, 'doing');

// A concurrent server change to an untouched property must not become dirty.
const changed = newSession(); changed.task.priorityCode = 'LOW';
assert.deepEqual(plan({ ...taskEditorDraft(task), title: 'Only title' }, changed)[0].data, { title: 'Only title' });
// Commit followed by a lost response is reconciled before retry, never replayed.
const timed = newSession(); let transitions = 0;
const desired = { ...taskEditorDraft(task), statusId: 'doing' };
const timeoutArgs = { session: timed, draft: desired, projectId: 'project', ...options,
  execute: async () => { transitions++; throw { status: undefined, message: 'Timeout' }; },
  readDetail: async () => ({ ...structuredClone(task), statusId: 'doing' }) };
assert.equal((await saveTaskEditor(timeoutArgs)).complete, false);
assert.equal((await saveTaskEditor(timeoutArgs)).complete, true);
assert.equal(transitions, 1);

// Creation succeeds, follow-up fails; retry keeps the ID and never creates again.
const creating = { task: null, initial: taskEditorDraft() };
const createDraft = { ...taskEditorDraft(task), requiresApproval: false, assigneeIds: ['a'] };
const createCalls = []; let fail = true;
const createArgs = { session: creating, draft: createDraft, projectId: 'project', ...options,
  execute: async command => {
    createCalls.push(command);
    if (command === 'createProjectTask') return { ...structuredClone(task), id: 'created', requiresApproval: false, approverProjectMembershipId: null, assigneeProjectMembershipIds: [] };
    if (fail) throw { status: 409, message: 'Unavailable member' };
    return {};
  }, readDetail: async () => ({ ...structuredClone(task), id: 'created', requiresApproval: false, approverProjectMembershipId: null, assigneeProjectMembershipIds: [] }) };
assert.equal((await saveTaskEditor(createArgs)).complete, false);
fail = false;
assert.equal((await saveTaskEditor(createArgs)).complete, true);
assert.deepEqual(createCalls, ['createProjectTask', 'assignTask', 'assignTask']);
const readFailed = { task: null, initial: taskEditorDraft() };
let creates = 0, reads = 0;
const readFailArgs = { ...createArgs, session: readFailed,
  execute: async command => {
    if (command !== 'createProjectTask') throw { status: 500, message: 'Assignment response lost' };
    creates++; return { ...structuredClone(task), id: 'known-created', requiresApproval: false, approverProjectMembershipId: null, assigneeProjectMembershipIds: [] };
  },
  readDetail: async () => { if (++reads === 1) throw new Error('Read unavailable'); return { ...structuredClone(task), id: 'known-created', requiresApproval: false, approverProjectMembershipId: null, assigneeProjectMembershipIds: ['a'] }; } };
const readFailure = await saveTaskEditor(readFailArgs);
assert.deepEqual(readFailure.saved, ['Create Task']);
assert.equal(readFailure.failed, 'Add assignee');
assert.deepEqual(readFailure.remaining, ['Add assignee']);
assert.equal(readFailed.needsReconcile, true);
assert.equal((await saveTaskEditor(readFailArgs)).complete, true);
assert.equal(creates, 1);
// Plain creation completes as soon as POST is acknowledged, even if detail
// reads would be slow/offline. No capabilities are invented for the response.
const quickCreate = { task: null, initial: taskEditorDraft() };
const quickResult = await saveTaskEditor({ ...createArgs, session: quickCreate,
  draft: { ...createDraft, assigneeIds: [] },
  execute: async command => {
    assert.equal(command, 'createProjectTask');
    return { id: 'fast-created', ...createDraft, requiresApproval: false };
  }, readDetail: () => assert.fail('Successful creation must not wait for a redundant detail GET') });
assert.equal(quickResult.complete, true);
assert.equal(quickCreate.task.id, 'fast-created');
assert.equal(quickCreate.task.capabilities, undefined);
const unknown = { task: null, initial: taskEditorDraft() };
const unknownArgs = { ...createArgs, session: unknown, execute: async () => { throw { message: 'Network timeout' }; } };
assert.equal((await saveTaskEditor(unknownArgs)).complete, false);
await assert.rejects(saveTaskEditor(unknownArgs), /Creation result is unknown/);

let current = true; const isolated = newSession();
const isolatedCalls = [];
result = await saveTaskEditor({ session: isolated, draft, projectId: 'project', ...options,
  isCurrent: () => current, execute: async command => { isolatedCalls.push(command); current = false; return {}; }, readDetail: async () => { assert.fail('Must not refetch in the new scope'); } });
assert.equal(result.stale, true); assert.deepEqual(isolatedCalls, ['updateProjectTask']);
console.log('task-editor.test.js passed (dirty fields/DTO bounds/capabilities/approval, partial saves, idempotent retries, timeout and scope isolation)');
