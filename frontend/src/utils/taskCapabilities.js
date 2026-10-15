/** Server capabilities are hints; missing/stale data never grants an action. */
export function getTaskCapability(task, operation) {
  const value = task?.capabilities?.[operation];
  if (typeof value?.allowed !== 'boolean' || !Object.hasOwn(task.capabilities, operation)) {
    return { allowed: false, reason: 'TASK_CAPABILITIES_UNAVAILABLE' };
  }
  return { allowed: value.allowed, reason: value.allowed ? null : (value.reason || 'ACCESS_DENIED') };
}

/** Preserve canonical response fields, with no legacy aliases or inferred authority. */
export function getTaskEditorAccess(task) {
  const decisions = ['editContent', 'editManagement', 'transition', 'configureApproval', 'assign', 'unassign'].map(operation => getTaskCapability(task, operation));
  return decisions.find(decision => decision.allowed) || decisions[0];
}

export function readTaskContract(task) {
  return {
    milestoneId: task.milestoneId,
    effectiveProgress: task.effectiveProgress,
    manualProgress: task.manualProgress,
    dueAt: task.dueAt,
    owningTeamName: task.owningTeamName,
    assigneeProjectMembershipIds: task.assigneeProjectMembershipIds,
  };
}
