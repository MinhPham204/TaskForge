import React from 'react';
import { taskAssignmentSelection } from '../../utils/taskAssignments.js';

export default function TaskAssigneePicker({ ids, candidates = [], members = [], onChange, canAssign, canUnassign, loading, error, onRetry, disabled = false }) {
  const eligibleIds = candidates.map(member => member.projectMembershipId);
  const name = id => candidates.find(member => member.projectMembershipId === id)?.name || members.find(member => (member.projectMembershipId || member.id) === id)?.user?.name || 'Unknown member';
  return <div className="space-y-2 text-xs">
    <div className="flex flex-wrap gap-1.5">
      {ids.map(id => <span key={id} className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-muted px-2 py-1 text-content">
        {name(id)}{canAssign && !loading && !error && !eligibleIds.includes(id) && <span className="text-content-muted">(no longer eligible)</span>}
        {canUnassign && <button type="button" disabled={disabled} onClick={() => onChange(ids.filter(value => value !== id))} aria-label={`Remove ${name(id)}`}>×</button>}
      </span>)}
      {ids.length === 0 && <span className="text-content-muted">No assignees.</span>}
    </div>
    {canAssign && <>
      {loading ? <p role="status">Loading eligible members…</p> : error ? <p role="alert">Could not load eligible members. <button type="button" disabled={disabled} onClick={onRetry}>Retry</button></p> : candidates.length === 0 ? <p>No eligible members in this owning Team.</p> : <>
        <select aria-label="Eligible assignees" multiple disabled={disabled} value={ids.filter(id => eligibleIds.includes(id))}
          onChange={event => onChange(taskAssignmentSelection(ids, eligibleIds, Array.from(event.target.selectedOptions, option => option.value)))}
          className="w-full rounded border border-border bg-surface px-2 py-1 text-content">
          {candidates.map(member => <option key={member.projectMembershipId} value={member.projectMembershipId}>{member.name}</option>)}
        </select>
        <p className="text-content-muted">Use Ctrl/⌘ to select multiple members; remove a member with ×.</p>
      </>}
    </>}
  </div>;
}
