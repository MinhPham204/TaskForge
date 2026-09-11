import React, { useState, useEffect } from 'react';
import Modal from '../../../components/common/Modal';
import {
  useCreateProjectTaskMutation,
  useUpdateProjectTaskMutation,
  useConfigureApprovalMutation,
} from '../../../services/taskApi';
import {
  useGetProjectTeamsQuery,
  useGetProjectStatusesQuery,
  useGetProjectMembersQuery,
  useGetProjectMilestonesQuery,
} from '../../../services/projectApi';

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const TaskFormModal = ({
  isOpen,
  onClose,
  projectId,
  task = null, // null for create, object for edit
  canManage = false,
  onSuccess,
}) => {
  const isEditing = Boolean(task);

  const { data: teams = [] } = useGetProjectTeamsQuery(projectId, { skip: !isOpen });
  const { data: statuses = [] } = useGetProjectStatusesQuery(projectId, { skip: !isOpen });
  const { data: members = [] } = useGetProjectMembersQuery(projectId, { skip: !isOpen });
  const { data: milestones = [] } = useGetProjectMilestonesQuery(projectId, { skip: !isOpen });

  const [createTask, { isLoading: isCreating }] = useCreateProjectTaskMutation();
  const [updateTask, { isLoading: isUpdating }] = useUpdateProjectTaskMutation();
  const [configureApproval] = useConfigureApprovalMutation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [owningTeamId, setOwningTeamId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priorityCode, setPriorityCode] = useState('MEDIUM');
  const [dueAt, setDueAt] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [approverMembershipId, setApproverMembershipId] = useState('');
  const [formError, setFormError] = useState('');

  const openMilestones = milestones.filter((m) => m.statusCode === 'OPEN');

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setOwningTeamId(task.owningTeamId || '');
      setStatusId(task.statusId || '');
      setPriorityCode(task.priorityCode || 'MEDIUM');
      setDueAt(task.dueAt ? task.dueAt.substring(0, 10) : '');
      setMilestoneId(task.milestoneId || '');
      setRequiresApproval(Boolean(task.requiresApproval));
      setApproverMembershipId(task.approverProjectMembershipId || '');
    } else {
      setTitle('');
      setDescription('');
      setOwningTeamId(teams[0]?.teamId || teams[0]?.id || '');
      setStatusId(statuses[0]?.id || '');
      setPriorityCode('MEDIUM');
      setDueAt('');
      setMilestoneId('');
      setRequiresApproval(false);
      setApproverMembershipId('');
    }
    setFormError('');
  }, [task, isOpen, teams, statuses]);

  // Set default team and status when they load if creating
  useEffect(() => {
    if (!isEditing && isOpen) {
      if (!owningTeamId && teams.length > 0) {
        setOwningTeamId(teams[0]?.teamId || teams[0]?.id || '');
      }
      if (!statusId && statuses.length > 0) {
        setStatusId(statuses[0]?.id || '');
      }
    }
  }, [teams, statuses, isEditing, isOpen, owningTeamId, statusId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!title.trim()) {
      setFormError('Task title is required.');
      return;
    }

    try {
      if (isEditing) {
        const payload = {
          projectId,
          taskId: task.id,
          title: title.trim(),
          description: description.trim() || undefined,
        };
        if (canManage) {
          if (owningTeamId) payload.owningTeamId = owningTeamId;
          payload.priorityCode = priorityCode;
          payload.dueAt = dueAt ? new Date(dueAt).toISOString() : null;
          payload.milestoneId = milestoneId || null;
        }
        await updateTask(payload).unwrap();

        // If approval config changed and canManage
        if (canManage && task.requiresApproval !== requiresApproval) {
          await configureApproval({
            projectId,
            taskId: task.id,
            approverProjectMembershipId: requiresApproval ? (approverMembershipId || null) : null,
          }).unwrap();
        }
      } else {
        if (!owningTeamId) {
          setFormError('An owning participating team is required.');
          return;
        }
        if (!statusId) {
          setFormError('A task status is required.');
          return;
        }

        const payload = {
          projectId,
          title: title.trim(),
          description: description.trim() || undefined,
          owningTeamId,
          statusId,
          priorityCode,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          milestoneId: milestoneId || null,
        };

        const created = await createTask(payload).unwrap();

        if (requiresApproval && created?.id) {
          await configureApproval({
            projectId,
            taskId: created.id,
            approverProjectMembershipId: approverMembershipId || null,
          }).unwrap();
        }
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setFormError(err.data?.message || err.message || 'Operation failed');
    }
  };

  const isSubmitting = isCreating || isUpdating;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Task' : 'Create Task'}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div
            role="alert"
            className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg"
          >
            {formError}
          </div>
        )}

        <div>
          <label htmlFor="task-title" className="block text-xs font-semibold text-gray-700 mb-1">
            Task Title <span className="text-red-500">*</span>
          </label>
          <input
            id="task-title"
            type="text"
            required
            maxLength={500}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Implement user authentication workflow"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div>
          <label htmlFor="task-desc" className="block text-xs font-semibold text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="task-desc"
            rows={3}
            maxLength={10000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailed description, requirements, criteria..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(!isEditing || canManage) && (
            <div>
              <label htmlFor="task-team" className="block text-xs font-semibold text-gray-700 mb-1">
                Owning Team <span className="text-red-500">*</span>
              </label>
              <select
                id="task-team"
                required
                value={owningTeamId}
                onChange={(e) => setOwningTeamId(e.target.value)}
                disabled={teams.length === 0}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
              >
                {teams.length === 0 ? (
                  <option value="">No participating teams available</option>
                ) : (
                  teams.map((t) => (
                    <option key={t.teamId || t.id} value={t.teamId || t.id}>
                      {t.teamName || t.name || t.teamId || t.id}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {!isEditing && (
            <div>
              <label htmlFor="task-status" className="block text-xs font-semibold text-gray-700 mb-1">
                Initial Status <span className="text-red-500">*</span>
              </label>
              <select
                id="task-status"
                required
                value={statusId}
                onChange={(e) => setStatusId(e.target.value)}
                disabled={statuses.length === 0}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
              >
                {statuses.length === 0 ? (
                  <option value="">No statuses available</option>
                ) : (
                  statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.semanticCategory})
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(!isEditing || canManage) && (
            <div>
              <label htmlFor="task-priority" className="block text-xs font-semibold text-gray-700 mb-1">
                Priority
              </label>
              <select
                id="task-priority"
                value={priorityCode}
                onChange={(e) => setPriorityCode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(!isEditing || canManage) && (
            <div>
              <label htmlFor="task-due" className="block text-xs font-semibold text-gray-700 mb-1">
                Due Date
              </label>
              <input
                id="task-due"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          )}
        </div>

        {(!isEditing || canManage) && openMilestones.length > 0 && (
          <div>
            <label htmlFor="task-milestone" className="block text-xs font-semibold text-gray-700 mb-1">
              Milestone (Optional)
            </label>
            <select
              id="task-milestone"
              value={milestoneId}
              onChange={(e) => setMilestoneId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">No milestone assigned</option>
              {openMilestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.dueDate ? `(Due ${new Date(m.dueDate).toLocaleDateString()})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {canManage && (
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-xs font-medium text-gray-800">
                Requires approval before completion
              </span>
            </label>

            {requiresApproval && (
              <div>
                <label
                  htmlFor="task-approver"
                  className="block text-xs font-semibold text-gray-700 mb-1"
                >
                  Designated Approver (Optional)
                </label>
                <select
                  id="task-approver"
                  value={approverMembershipId}
                  onChange={(e) => setApproverMembershipId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">Any eligible Project Member (no self-approval)</option>
                  {members.map((m) => (
                    <option key={m.id || m.organizationMembershipId} value={m.id || m.organizationMembershipId}>
                      {m.user?.name || m.user?.email || m.organizationMembershipId} ({m.role})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Note: An approver cannot be the Task creator or an active assignee.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default TaskFormModal;
