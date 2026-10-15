import { getTaskCapability } from './taskCapabilities.js';

export function splitTaskDescription(raw = '') {
  // Only the trailing label block owned by this editor is metadata. Preserve
  // ordinary prose containing "Labels:" and the original bytes on no-op edits.
  const match = raw.match(/(?:\n\n|^)Labels: ([^\n]+)$/);
  return match ? {
    description: raw.slice(0, match.index),
    labels: match[1].split(',').map(value => value.trim().replace(/^#/, '')).filter(Boolean),
  } : { description: raw, labels: [] };
}

export function taskEditorDraft(task = {}) {
  return {
    title: task.title ?? '',
    ...splitTaskDescription(task.description ?? ''),
    owningTeamId: task.owningTeamId ?? '', statusId: task.statusId ?? '',
    priorityCode: task.priorityCode ?? 'MEDIUM', dueAt: task.dueAt?.slice(0, 10) ?? '',
    milestoneId: task.milestoneId ?? '',
    assigneeIds: [...(task.assigneeProjectMembershipIds ?? [])],
    requiresApproval: Boolean(task.requiresApproval),
    approverMembershipId: task.approverProjectMembershipId ?? '',
  };
}

const sameSet = (a, b) => a.length === b.length && a.every(value => b.includes(value));
const same = (key, a, b) => key === 'assigneeIds' ? sameSet(a, b) : JSON.stringify(a) === JSON.stringify(b);
const memberId = member => member.projectMembershipId || member.id;
export const eligibleTaskApprovers = (members, creatorId, assigneeIds) => members.filter(member =>
  memberId(member) !== creatorId && !assigneeIds.includes(memberId(member)));

export function editorPermissions(task, project) {
  if (task) return Object.fromEntries(['editContent', 'editManagement', 'transition', 'assign', 'unassign', 'configureApproval']
    .map(operation => [operation, getTaskCapability(task, operation)]));
  const create = project?.viewer?.canCreateTask === true;
  const manage = create && project?.viewer?.canManage === true;
  return Object.fromEntries(['editContent', 'editManagement', 'transition', 'assign', 'unassign', 'configureApproval']
    .map(operation => [operation, { allowed: ['assign', 'unassign', 'configureApproval'].includes(operation) ? manage : create,
      reason: create ? 'PROJECT_MANAGER_REQUIRED' : 'PROJECT_CREATE_ACCESS_REQUIRED' }]));
}

export function editorReason(reason) {
  return ({
    PROJECT_MANAGER_REQUIRED: 'Only an active Project Manager can change this field.',
    PROJECT_READ_ONLY: 'This Project is read-only.', TASK_ARCHIVED: 'This Task is archived.',
    TASK_EXECUTION_ACCESS_REQUIRED: 'Only the creator, an active assignee or Project Manager can edit this Task.',
    PROJECT_MEMBERSHIP_REQUIRED: 'Active Project membership is required.',
    TASK_APPROVAL_PENDING: 'Cancel the pending approval separately before changing its configuration.',
    PROJECT_CREATE_ACCESS_REQUIRED: 'Task creation requires an active Project Manager or Contributor in a mutable Project.',
  })[reason] || 'Permissions are unavailable. Reload the Task before editing.';
}

function descriptionValue(draft) {
  const text = draft.description.trim();
  const labels = draft.labels.map(value => value.trim().replace(/^#/, '')).filter(Boolean);
  if (labels.some(value => /[\r\n,]/.test(value))) throw new Error('Labels cannot contain commas or line breaks.');
  return labels.length ? `${text ? `${text}\n\n` : ''}Labels: ${labels.map(value => `#${value}`).join(', ')}` : text;
}

// The initial form baseline is acknowledged field-by-field after successful
// writes. A server refetch never turns an untouched form field into a dirty one.
export function planTaskEditorSave(session, draft, { project, members = [], creatorId } = {}) {
  const task = session.task;
  const initial = session.initial;
  const dirty = key => !same(key, draft[key], initial[key]);
  const permissions = editorPermissions(task, project);
  const requirePermission = operation => {
    if (!permissions[operation].allowed) throw new Error(editorReason(permissions[operation].reason));
  };
  const title = draft.title.trim();
  if (!title || title.length > 500) throw new Error('Task title must contain 1–500 characters after trimming.');
  const descriptionDirty = !task || dirty('description') || dirty('labels');
  const description = descriptionDirty ? descriptionValue(draft) : task.description;
  if (descriptionDirty && description.length > 10000) throw new Error('Description including formatted labels must not exceed 10,000 characters.');
  const patch = {};
  if (!task || dirty('title')) { requirePermission('editContent'); if (title !== task?.title) patch.title = title; }
  if (descriptionDirty) { requirePermission('editContent'); if (description !== task?.description) patch.description = description; }
  for (const key of ['owningTeamId', 'priorityCode', 'dueAt', 'milestoneId']) {
    if (task && !dirty(key)) continue;
    requirePermission('editManagement');
    let value = draft[key];
    if (key === 'dueAt') {
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid due date.');
      if (value && Number.isNaN(new Date(value).getTime())) throw new Error('Choose a valid due date.');
      if (value && new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Choose a valid due date.');
      value = value ? new Date(value).toISOString() : null;
    }
    if (key === 'milestoneId') value ||= null;
    if ((key === 'owningTeamId' || key === 'priorityCode') && !value) throw new Error('An owning Team and priority are required.');
    if (key === 'priorityCode' && !['URGENT', 'HIGH', 'MEDIUM', 'LOW'].includes(value)) throw new Error('Choose a valid priority.');
    if (value !== task?.[key]) patch[key] = value;
  }
  if (!task && !draft.statusId) throw new Error('A task status is required.');
  const assignmentDirty = !task ? draft.assigneeIds.length > 0 : dirty('assigneeIds');
  const approvalDirty = !task ? draft.requiresApproval : dirty('requiresApproval') || (draft.requiresApproval && dirty('approverMembershipId'));
  if (approvalDirty) {
    requirePermission('configureApproval');
    if (draft.requiresApproval && (!draft.approverMembershipId || !eligibleTaskApprovers(members, task?.creatorProjectMembershipId || creatorId, draft.assigneeIds)
      .some(member => memberId(member) === draft.approverMembershipId))) throw new Error('Choose a designated approver who is neither the creator nor an assignee.');
  }
  const steps = [];
  if (!task) {
    requirePermission('transition');
    steps.push({ command: 'createProjectTask', label: 'Create Task', data: { ...patch, statusId: draft.statusId }, keys: ['title', 'description', 'labels', 'owningTeamId', 'priorityCode', 'dueAt', 'milestoneId', 'statusId'] });
  } else if (Object.keys(patch).length) {
    const keys = Object.keys(patch).flatMap(key => key === 'description' ? ['description', 'labels'] : [key]);
    steps.push({ command: 'updateProjectTask', label: `Content/properties (${Object.keys(patch).join(', ')})`, data: patch, keys });
  }
  if (assignmentDirty) {
    const existing = task?.assigneeProjectMembershipIds || [];
    const removed = existing.filter(id => !draft.assigneeIds.includes(id));
    const added = draft.assigneeIds.filter(id => !existing.includes(id));
    if (removed.length) requirePermission('unassign');
    if (added.length) requirePermission('assign');
    for (const id of removed) steps.push({ command: 'unassignTask', label: 'Remove assignee', data: { projectMembershipId: id }, keys: [] });
    for (const id of added) steps.push({ command: 'assignTask', label: 'Add assignee', data: { projectMembershipId: id }, keys: [] });
  }
  if (approvalDirty) {
    const target = draft.requiresApproval ? draft.approverMembershipId : null;
    if (target !== (task?.approverProjectMembershipId ?? null) || Boolean(task?.requiresApproval) !== draft.requiresApproval)
      steps.push({ command: 'configureApproval', label: 'Approval configuration', data: { approverProjectMembershipId: target }, keys: ['requiresApproval', 'approverMembershipId'] });
  }
  if (task && dirty('statusId') && draft.statusId !== task.statusId) {
    requirePermission('transition');
    if (!draft.statusId) throw new Error('Choose a task status.');
    steps.push({ command: 'transitionTaskStatus', label: 'Status', data: { statusId: draft.statusId }, keys: ['statusId'] });
  }
  return steps;
}

export async function saveTaskEditor({ session, draft, projectId, project, members, creatorId, execute, readDetail, isCurrent = () => true, onStep = () => {} }) {
  if (!isCurrent()) return { saved: [], complete: false, stale: true };
  if (session.uncertainCreate) throw new Error('Creation result is unknown. Check the Task list before starting another creation; retry could duplicate the Task.');
  if (session.needsReconcile) {
    session.task = await readDetail(session.task.id);
    session.needsReconcile = false;
  }
  const steps = planTaskEditorSave(session, draft, { project, members, creatorId });
  const saved = [];
  for (const step of steps) {
    if (!isCurrent()) return { saved, complete: false, stale: true };
    try {
      const result = await execute(step.command, { projectId, ...(session.task?.id ? { taskId: session.task.id } : {}), ...step.data });
      if (step.command === 'createProjectTask') {
        if (!result?.id) { session.uncertainCreate = true; throw new Error('Creation result is missing a Task ID. Check the Task list before trying again.'); }
        session.task = { ...result, assigneeProjectMembershipIds: [] };
      } else if (['assignTask', 'unassignTask'].includes(step.command)) {
        const ids = session.task.assigneeProjectMembershipIds || [];
        session.task = { ...session.task, assigneeProjectMembershipIds: step.command === 'assignTask' ? [...new Set([...ids, step.data.projectMembershipId])] : ids.filter(id => id !== step.data.projectMembershipId) };
      } else {
        session.task = { ...session.task, ...step.data };
        if (step.command === 'configureApproval') session.task.requiresApproval = step.data.approverProjectMembershipId !== null;
      }
      for (const key of step.keys) session.initial[key] = structuredClone(draft[key]);
      saved.push(step.label);
      onStep(step.label);
      if (!isCurrent()) return { saved, complete: false, stale: true };
      // The create response already acknowledges the Task ID and saved fields.
      // Follow-up commands validate permissions on the server; only failures
      // need a detail read before retrying. Successful creation can close now.
    } catch (error) {
      const ambiguous = !error.status || Number(error.status) >= 500;
      if (!session.task?.id && ambiguous) session.uncertainCreate = true;
      if (session.task?.id && isCurrent()) {
        try { session.task = await readDetail(session.task.id); }
        catch { session.needsReconcile = true; }
      }
      const acknowledged = saved.includes(step.label);
      return { complete: false, saved, failed: acknowledged ? 'Refresh created Task' : step.label, remaining: steps.slice(steps.indexOf(step) + (acknowledged ? 1 : 0)).map(entry => entry.label), error, ambiguous };
    }
  }
  session.initial.assigneeIds = [...draft.assigneeIds];
  return { complete: true, saved };
}
