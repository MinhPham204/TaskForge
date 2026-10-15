export function taskAssignmentSelection(ids, eligibleIds, nextEligibleIds) {
  // Never drop retained, now-ineligible assignees as a side effect of selecting
  // another member. Removal is an explicit action on their visible chip.
  return [...new Set([...ids.filter(id => !eligibleIds.includes(id)), ...nextEligibleIds])];
}

export function requireEligibleNewAssignees(existing, desired, candidates) {
  const eligible = new Set(candidates.map(member => member.projectMembershipId));
  if (desired.some(id => !existing.includes(id) && !eligible.has(id))) {
    throw new Error('A selected assignee is no longer eligible for this owning Team. Reload the candidates and choose an active member.');
  }
}
