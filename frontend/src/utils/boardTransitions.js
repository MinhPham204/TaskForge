import { getTaskCapability } from './taskCapabilities.js';

const lanes = new Set();
const observers = new Set();
export function observeBoardTransitions(callback) {
  observers.add(callback);
  return () => observers.delete(callback);
}

const reasons = {
  TENANT_MEMBERSHIP_REQUIRED: 'Select a workspace where you have active membership.',
  PROJECT_MEMBERSHIP_REQUIRED: 'Ask a Project Manager to restore your active Project membership.',
  TASK_EXECUTION_ACCESS_REQUIRED: 'Only the creator, an active assignee or Project Manager can move this Task.',
  PROJECT_READ_ONLY: 'This Project is read-only. Ask a Project Manager about its lifecycle.',
  TASK_ARCHIVED: 'This Task is archived. Open its details to review it.',
  TASK_TRANSITION_INVALID: 'This status transition is not allowed. Choose an allowed status.',
  TASK_CHECKLIST_INCOMPLETE: 'Complete the remaining checklist items before completing this Task.',
  TASK_APPROVAL_REQUIRED: 'Request approval and wait for approval before completing this Task.',
  TASK_APPROVAL_PENDING: 'Review the pending approval in Task details.',
  RESOURCE_NOT_FOUND: 'The Task or target status is no longer available. Refresh the Board.',
  TASK_CAPABILITIES_UNAVAILABLE: 'Permissions are unavailable. Refresh the Board before moving this Task.',
};

export function boardTransitionMessage(error) {
  const code = error?.data?.code || error?.reason;
  if (reasons[code]) return reasons[code];
  if (error?.status === 401) return 'Your session expired. Sign in again.';
  if (error?.status === 403) return 'Access was denied. Review your workspace and Project membership.';
  if (error?.status === 409) return 'The Task changed or is read-only. Review its details before moving it.';
  return 'The request did not confirm the move. Check the saved server status before trying again.';
}

// One request at a time, including reconciliation. No inverse snapshots or
// guessed Completed/checklist progress: columns and metadata stay server-owned.
export function createBoardTransitions(onChange = () => {}) {
  let scope, lockKey, fetching = false, generation = 0, columns = [], execute, read;
  let tasksById = new Map();
  let drag = null, over = null, busy = false, blocked = false, message = '';
  const notify = (shared = false) => {
    onChange();
    if (shared) observers.forEach(callback => { if (callback !== onChange) callback(); });
  };
  const cancel = () => { drag = null; over = null; };
  const find = id => tasksById.get(id);
  const access = task => {
    if (busy || blocked || fetching || lanes.has(lockKey)) return { allowed: false, reason: 'BOARD_REFRESH_REQUIRED' };
    return getTaskCapability(task, 'transition');
  };
  async function reconcile(owner, afterMutation = false) {
    try {
      await read(() => owner === generation, afterMutation);
      if (owner !== generation) return;
      blocked = false;
      if (message) message += ' Board refreshed from server; review the current status before another move.';
    } catch {
      if (owner === generation) {
        blocked = true;
        message = `${message ? `${message} ` : ''}Could not refresh the Board. Refresh before moving another Task.`;
      }
    }
  }
  return {
    configure(next) {
      if (scope !== next.scope) {
        scope = next.scope; generation++;
        cancel(); message = ''; blocked = busy || lanes.has(next.lockKey);
      }
      if (columns !== next.columns) {
        columns = next.columns;
        tasksById = new Map(columns.flatMap(column => (column.tasks || []).map(task => [task.id, task])));
      }
      execute = next.execute; read = next.read;
      lockKey = next.lockKey; fetching = next.isFetching;
    },
    cancelScope() { generation++; cancel(); blocked = busy; message = ''; notify(); },
    snapshot: () => ({ dragOverColumnId: over, busy: busy || lanes.has(lockKey), blocked, message }),
    access,
    start(event, id) {
      const task = find(id);
      if (!task || !access(task).allowed) { event.preventDefault(); cancel(); return; }
      drag = { id, generation };
      event.dataTransfer.setData('text/plain', id);
      event.dataTransfer.effectAllowed = 'move';
    },
    end() { const changed = over !== null; cancel(); if (changed) notify(); },
    over(event, id) {
      if (!drag || drag.generation !== generation || !access(find(drag.id)).allowed || !columns.some(column => column.id === id)) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      if (over !== id) { over = id; notify(); }
    },
    leave(event, id) {
      if (!event.currentTarget.contains(event.relatedTarget) && over === id) { over = null; notify(); }
    },
    async drop(event, statusId) {
      event.preventDefault();
      const selected = drag; cancel();
      const task = selected && find(selected.id);
      const source = columns.find(column => column.tasks?.some(entry => entry.id === selected?.id));
      if (!selected || selected.generation !== generation || !task || !access(task).allowed || !columns.some(column => column.id === statusId) || source?.id === statusId) { notify(); return; }
      const owner = generation;
      const lane = lockKey;
      lanes.add(lane);
      busy = true; message = ''; notify(true);
      try { await execute({ taskId: task.id, statusId }); }
      catch (error) { if (owner === generation) message = boardTransitionMessage(error); }
      // Scope changes discard feedback and callbacks from the previous view.
      if (owner === generation) await reconcile(owner, true);
      else blocked = true;
      lanes.delete(lane); busy = false; notify(true);
    },
    async refresh() {
      if (busy || lanes.has(lockKey)) return;
      const owner = generation;
      busy = true; notify();
      await reconcile(owner);
      busy = false; notify();
    },
  };
}
