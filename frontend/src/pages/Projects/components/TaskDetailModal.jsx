import { useSelector } from 'react-redux';
import { editorReason } from '../../../utils/taskEditor.js';
import TaskEditButton from '../../../components/task/TaskEditButton.jsx';
import { getTaskCapability } from '../../../utils/taskCapabilities.js';
import { useGetTaskAssignmentCandidatesQuery } from '../../../services/taskApi.js';
import React, { useState } from 'react';
import Modal from '../../../components/common/Modal';
import Select from 'react-select';
import { LoadingState, ErrorState } from '../../../components/common/PageState';
import {
  useGetProjectTaskDetailQuery,
  useTransitionTaskStatusMutation,
  useSetTaskManualProgressMutation,
  useAddChecklistItemMutation,
  useSetChecklistItemCompletionMutation,
  useCreateCommentMutation,
  useEditCommentMutation,
  useDeleteCommentMutation,
  useAssignTaskMutation,
  useUnassignTaskMutation,
  useRequestApprovalMutation,
  useResolveApprovalMutation,
  useArchiveProjectTaskMutation,
} from '../../../services/taskApi';
import {
  useGetProjectStatusesQuery,
  useGetProjectMembersQuery,
} from '../../../services/projectApi';
import TaskAttachments from '../../../components/task/TaskAttachments.jsx';
import { ApprovalStateBadge } from './TaskStatusBadge';
import {
  StatusText,
  PriorityText,
  AttentionFlag,
  CountText,
} from '../../../components/task';
import { isTaskOverdue } from '../../../utils/taskAttention';
import {
  LuCalendar,
  LuCircleCheck,
  LuMessageSquare,
  LuShieldCheck,
  LuUsers,
  LuPencil,
  LuTrash2,
  LuPlus,
  LuTriangleAlert,
  LuCheck,
  LuX,
  LuSend,
} from 'react-icons/lu';

const TaskDetailModal = ({
  isOpen,
  onClose,
  projectId,
  taskId,
  onEditTask,
}) => {
  const {
    currentData: task,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetProjectTaskDetailQuery(
    { projectId, taskId },
    { skip: !isOpen || !taskId }
  );

  const { data: statuses = [] } = useGetProjectStatusesQuery(projectId, { skip: !isOpen });
  const { currentData: members = [] } = useGetProjectMembersQuery(projectId, { skip: !isOpen });

  const viewerUserId = useSelector(state => state.auth.user?.id);
  const activeOrgId = useSelector(state => state.auth.activeOrganizationId);
  const actionScope = React.useRef({ key: '', generation: 0 });
  const actionScopeKey = JSON.stringify([viewerUserId, activeOrgId, projectId, taskId, isOpen]);
  if (actionScope.current.key !== actionScopeKey) actionScope.current = { key: actionScopeKey, generation: actionScope.current.generation + 1 };
  const isCurrentAction = owner => actionScope.current.generation === owner;
  React.useEffect(() => () => { actionScope.current.generation++; }, []);
  const viewerOrgMembershipId = members.find(member => member.user?.id === viewerUserId)?.organizationMembershipId;
  const viewerMembershipId = members.find(member => member.user?.id === viewerUserId)?.projectMembershipId || members.find(member => member.user?.id === viewerUserId)?.id;
  const transitionAccess = getTaskCapability(task, 'transition');
  const progressAccess = getTaskCapability(task, 'editProgress');
  const checklistAccess = getTaskCapability(task, 'editChecklist');
  const commentAccess = getTaskCapability(task, 'comment');
  const assignAccess = getTaskCapability(task, 'assign');
  const canManage = getTaskCapability(task, 'editManagement').allowed;
  const unassignAccess = getTaskCapability(task, 'unassign');
  const { currentData: candidates = [], isFetching: candidatesLoading, isError: candidatesError, refetch: refetchCandidates } = useGetTaskAssignmentCandidatesQuery(
    { projectId, teamId: task?.owningTeamId },
    { skip: !isOpen || !task?.owningTeamId || !assignAccess.allowed, refetchOnMountOrArgChange: true },
  );
  // Mutations
  const [transitionStatus, { isLoading: isTransitioning }] = useTransitionTaskStatusMutation();
  const [setManualProgress, { isLoading: isUpdatingProgress }] = useSetTaskManualProgressMutation();
  const [addChecklistItem, { isLoading: isAddingChecklist }] = useAddChecklistItemMutation();
  const [setChecklistItemCompletion] = useSetChecklistItemCompletionMutation();
  const [createComment, { isLoading: isPostingComment }] = useCreateCommentMutation();
  const [editComment] = useEditCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();
  const [assignTask, { isLoading: isAssigning }] = useAssignTaskMutation();
  const [unassignTask, { isLoading: isUnassigning }] = useUnassignTaskMutation();
  const [requestApproval, { isLoading: isRequestingApproval }] = useRequestApprovalMutation();
  const [resolveApproval, { isLoading: isResolvingApproval }] = useResolveApprovalMutation();
  const [archiveTask, { isLoading: isArchiving }] = useArchiveProjectTaskMutation();

  // Local Form States
  const [selectedStatusId, setSelectedStatusId] = useState('');
  const [progressInput, setProgressInput] = useState(0);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newCommentBody, setNewCommentBody] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentBody, setEditCommentBody] = useState('');
  const [approvalReason, setApprovalReason] = useState('');
  const [approvalActionModal, setApprovalActionModal] = useState(null); // 'request' | 'approve' | 'reject' | 'cancel'
  const [actionError, setActionError] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);


  // Sync selected status and progress when task loads
  React.useEffect(() => {
    if (task) {
      setSelectedStatusId(task.statusId);
      setProgressInput(task.manualProgress || 0);
    }
  }, [task]);
  React.useEffect(() => {
    setActionError(''); setApprovalActionModal(null); setApprovalReason(''); setConfirmArchive(false);
    setEditingCommentId(null); setNewCommentBody(''); setNewChecklistText(''); setSelectedAssigneeId('');
  }, [projectId, taskId, isOpen, viewerUserId, activeOrgId]);

  if (!isOpen) return null;

  const handleStatusTransition = async () => {
    const owner = actionScope.current.generation;
    if (!transitionAccess.allowed || !selectedStatusId || selectedStatusId === task?.statusId) return;
    setActionError('');
    try {
      await transitionStatus({ projectId, taskId, statusId: selectedStatusId }).unwrap();
      if (!isCurrentAction(owner)) return;
    } catch (err) {
      if (!isCurrentAction(owner)) return;
      setActionError(err.data?.message || err.message || 'Status transition failed');
      setSelectedStatusId(task?.statusId);
    }
  };

  const handleProgressSave = async () => {
    const owner = actionScope.current.generation;
    if (!progressAccess.allowed) return;
    setActionError('');
    try {
      await setManualProgress({
        projectId,
        taskId,
        manualProgress: Number(progressInput),
      }).unwrap();
      if (!isCurrentAction(owner)) return;
    } catch (err) {
      if (!isCurrentAction(owner)) return;
      setActionError(err.data?.message || err.message || 'Failed to update progress');
    }
  };

  const handleAddChecklist = async (e) => {
    const owner = actionScope.current.generation;
    e.preventDefault();
    if (!checklistAccess.allowed || !newChecklistText.trim()) return;
    setActionError('');
    try {
      await addChecklistItem({ projectId, taskId, text: newChecklistText.trim() }).unwrap();
      if (!isCurrentAction(owner)) return;
      setNewChecklistText('');
    } catch (err) {
      if (!isCurrentAction(owner)) return;
      setActionError(err.data?.message || err.message || 'Failed to add checklist item');
    }
  };

  const handleToggleChecklist = async (itemId, currentCompleted) => {
    const owner = actionScope.current.generation;
    if (!checklistAccess.allowed) return;
    setActionError('');
    try {
      await setChecklistItemCompletion({
        projectId,
        taskId,
        itemId,
        completed: !currentCompleted,
      }).unwrap();
      if (!isCurrentAction(owner)) return;
    } catch (err) {
      if (!isCurrentAction(owner)) return;
      setActionError(err.data?.message || err.message || 'Failed to update checklist item');
    }
  };

  const handlePostComment = async (e) => {
    const owner = actionScope.current.generation;
    e.preventDefault();
    if (!commentAccess.allowed || !newCommentBody.trim()) return;
    setActionError('');
    try {
      await createComment({ projectId, taskId, body: newCommentBody.trim() }).unwrap();
      if (!isCurrentAction(owner)) return;
      setNewCommentBody('');
    } catch (err) {
      if (!isCurrentAction(owner)) return;
      setActionError(err.data?.message || err.message || 'Failed to post comment');
    }
  };

  const handleEditCommentSubmit = async (commentId) => {
    const owner = actionScope.current.generation;
    if (!editCommentBody.trim()) return;
    setActionError('');
    try {
      await editComment({ projectId, taskId, commentId, body: editCommentBody.trim() }).unwrap();
      if (!isCurrentAction(owner)) return;
      setEditingCommentId(null);
      setEditCommentBody('');
    } catch (err) {
      if (!isCurrentAction(owner)) return;
      setActionError(err.data?.message || err.message || 'Failed to update comment');
    }
  };

  const handleDeleteComment = async (commentId) => {
    const owner = actionScope.current.generation;
    setActionError('');
    try {
      await deleteComment({ projectId, taskId, commentId }).unwrap();
      if (!isCurrentAction(owner)) return;
    } catch (err) {
      if (!isCurrentAction(owner)) return;
      setActionError(err.data?.message || err.message || 'Failed to delete comment');
    }
  };

  const handleAssign = async () => {
    const owner = actionScope.current.generation;
    if (!selectedAssigneeId) return;
    setActionError('');
    try {
      await assignTask({ projectId, taskId, projectMembershipId: selectedAssigneeId }).unwrap();
      if (!isCurrentAction(owner)) return;
      setSelectedAssigneeId('');
    } catch (err) {
      if (!isCurrentAction(owner)) return;
      setActionError(err.data?.message || err.message || 'Failed to assign member');
    }
  };

  const handleUnassign = async (membershipId) => {
    const owner = actionScope.current.generation;
    setActionError('');
    try {
      await unassignTask({ projectId, taskId, projectMembershipId: membershipId }).unwrap();
      if (!isCurrentAction(owner)) return;
    } catch (err) {
      if (!isCurrentAction(owner)) return;
      setActionError(err.data?.message || err.message || 'Failed to remove assignee');
    }
  };

  const handleApprovalAction = async () => {
    const owner = actionScope.current.generation;
    if ((approvalActionModal === 'request' && !transitionAccess.allowed) || (['approve', 'reject'].includes(approvalActionModal) && !canResolveApproval) || (approvalActionModal === 'cancel' && !canCancelApproval)) return;
    setActionError('');
    try {
      if (approvalActionModal === 'request') {
        await requestApproval({
          projectId,
          taskId,
          reason: approvalReason.trim() || undefined,
        }).unwrap();
      if (!isCurrentAction(owner)) return;
      } else if (['approve', 'reject', 'cancel'].includes(approvalActionModal)) {
        await resolveApproval({
          projectId,
          taskId,
          action: approvalActionModal,
          reason: approvalReason.trim() || undefined,
        }).unwrap();
      if (!isCurrentAction(owner)) return;
      }
      setApprovalActionModal(null);
      setApprovalReason('');
    } catch (err) {
      if (!isCurrentAction(owner)) return;
      setActionError(err.data?.message || err.message || 'Approval action failed');
    }
  };

  const handleArchive = async () => {
    const owner = actionScope.current.generation;
    setActionError('');
    try {
      await archiveTask({ projectId, taskId }).unwrap();
      if (!isCurrentAction(owner)) return;
      onClose();
    } catch (err) {
      if (!isCurrentAction(owner)) return;
      setActionError(err.data?.message || err.message || 'Failed to archive task');
    }
  };


  const pendingApproval = task?.approvals?.find((a) => a.state === 'PENDING');
  const canResolveApproval = commentAccess.allowed && Boolean(viewerMembershipId) && viewerMembershipId === pendingApproval?.approverProjectMembershipId && viewerMembershipId !== task?.creatorProjectMembershipId && !task?.assigneeProjectMembershipIds?.includes(viewerMembershipId);
  const canCancelApproval = commentAccess.allowed && (canManage || (Boolean(viewerOrgMembershipId) && viewerOrgMembershipId === pendingApproval?.requestedByMembershipId));
  const isCompleted = task?.semanticCategory === 'COMPLETED';
  const hasChecklist = task?.checklist?.length > 0;
  const isOverdue = isTaskOverdue(task);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={task?.title || 'Task Details'}
      maxWidth="max-w-4xl"
    >
      {isLoading ? (
        <LoadingState message="Loading task details..." />
      ) : isError ? (
        <ErrorState
          title="Failed to load task"
          message={error?.data?.message || 'Could not retrieve task data.'}
          onRetry={refetch}
        />
      ) : !task ? (
        <p className="text-sm text-gray-500 py-6 text-center">Task not found.</p>
      ) : (
        <div className="space-y-6">
          {actionError && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2"
            >
              <LuTriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Top Status and Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <label htmlFor="transition-status" className="text-xs font-medium text-content-muted">
                Status:
              </label>
              <select
                id="transition-status"
                value={selectedStatusId}
                onChange={(e) => setSelectedStatusId(e.target.value)}
                disabled={isTransitioning || !transitionAccess.allowed}
                title={transitionAccess.allowed ? undefined : editorReason(transitionAccess.reason)}
                className="text-xs border border-border rounded-md px-2 py-1 bg-surface text-content focus:ring-1 focus:ring-primary"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {selectedStatusId !== task.statusId && (
                <button
                  type="button"
                  onClick={handleStatusTransition}
                  disabled={isTransitioning || !transitionAccess.allowed}
                title={transitionAccess.allowed ? undefined : editorReason(transitionAccess.reason)}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                >
                  {isTransitioning ? 'Moving...' : 'Move'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <PriorityText priority={task.priorityCode} />
              <AttentionFlag task={task} includeOverdue={false} />

              <TaskEditButton task={task} onEditTask={onEditTask} />

              {canManage && (
                <button
                  type="button"
                  onClick={() => setConfirmArchive(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-surface dark:bg-rose-950/20 border border-red-200 dark:border-red-900 rounded-md hover:bg-red-50 dark:hover:bg-rose-950/40 cursor-pointer"
                >
                  <LuTrash2 className="w-3.5 h-3.5" />
                  Archive
                </button>
              )}
            </div>
          </div>

          {/* Consolidated Seamless Metadata Strip */}
          <div className="flex flex-wrap items-center gap-y-2 gap-x-6 py-2.5 px-3 bg-surface-muted/50 rounded-lg text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-content-muted">Team:</span>
              <span className="font-medium text-content">{task.owningTeamName || task.owningTeamId || '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-content-muted">Due:</span>
              <span className={`font-medium ${isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-content'}`}>
                {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-content-muted">Progress:</span>
              <span className="font-medium text-content">{task.effectiveProgress ?? 0}%</span>
              {task.effectiveProgress > 0 && task.effectiveProgress < 100 && (
                <div className="w-16 bg-border/60 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-primary h-1.5 rounded-full"
                    style={{ width: `${task.effectiveProgress}%` }}
                  />
                </div>
              )}
            </div>
            {task.requiresApproval && (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                <LuShieldCheck className="w-3.5 h-3.5" />
                <span>Approval required</span>
              </div>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <div className="space-y-1">
              <h4 className="text-[11px] font-semibold text-content-muted uppercase tracking-wider">
                Description
              </h4>
              <p className="text-xs text-content whitespace-pre-wrap leading-relaxed">
                {task.description}
              </p>
            </div>
          )}

          {/* Manual Progress Slider if No Checklist */}
          {!hasChecklist && !isCompleted && (
            <div className="pt-3 border-t border-border/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-content">
                  Manual Progress: {progressInput}%
                </span>
                <button
                  type="button"
                  onClick={handleProgressSave}
                  disabled={!progressAccess.allowed || isUpdatingProgress || Number(progressInput) === task.manualProgress}
                  title={progressAccess.allowed ? undefined : editorReason(progressAccess.reason)}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                >
                  {isUpdatingProgress ? 'Saving...' : 'Update Progress'}
                </button>
              </div>
              <input
                type="range"
                aria-label="Manual progress"
                disabled={!progressAccess.allowed || isUpdatingProgress}
                title={progressAccess.allowed ? undefined : editorReason(progressAccess.reason)}
                min="0"
                max="100"
                value={progressInput}
                onChange={(e) => setProgressInput(Number(e.target.value))}
                className="w-full h-1.5 bg-surface-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          )}

          {/* Checklist Section */}
          <div className="pt-4 border-t border-border/60 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-content flex items-center gap-2">
                <span>Checklist</span>
                <CountText
                  count={`${task.checklist?.filter((c) => c.completedAt).length || 0}/${task.checklist?.length || 0}`}
                />
              </h4>
            </div>

            <div className="space-y-1">
              {task.checklist?.map((item) => {
                const isItemDone = Boolean(item.completedAt);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-surface-muted transition-colors"
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={isItemDone}
                        disabled={isCompleted || !checklistAccess.allowed}
                        title={checklistAccess.allowed ? undefined : editorReason(checklistAccess.reason)}
                        onChange={() => handleToggleChecklist(item.id, isItemDone)}
                        className="rounded border-border text-primary focus:ring-primary disabled:opacity-50"
                      />
                      <span
                        className={
                          isItemDone ? 'line-through text-content-muted' : 'text-content font-medium'
                        }
                      >
                        {item.text}
                      </span>
                    </label>
                    {item.completedAt && (
                      <span className="text-[10px] text-content-muted">
                        {new Date(item.completedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                );
              })}

              {!hasChecklist && (
                <p className="text-xs text-content-muted">No checklist items yet.</p>
              )}
            </div>

            {!isCompleted && (
              <form onSubmit={handleAddChecklist} className="flex gap-2 pt-1">
                <input
                  type="text"
                  maxLength={1000}
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  placeholder="Add a checklist item..."
                  aria-label="New checklist item"
                  disabled={!checklistAccess.allowed || isAddingChecklist}
                  title={checklistAccess.allowed ? undefined : editorReason(checklistAccess.reason)}
                  className="flex-1 px-3 py-1.5 text-xs border border-border bg-surface text-content placeholder:text-content-muted rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={!checklistAccess.allowed || isAddingChecklist || !newChecklistText.trim()}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
                >
                  <LuPlus className="w-3.5 h-3.5" />
                  Add
                </button>
              </form>
            )}
          </div>

          {/* Assignees Section */}
          <div className="pt-4 border-t border-border/60 space-y-3">
            <h4 className="text-xs font-semibold text-content flex items-center gap-2">
              <span>Assignees</span>
              <CountText count={task.assigneeProjectMembershipIds?.length || 0} />
            </h4>

            <div className="flex flex-wrap gap-1.5">
              {task.assigneeProjectMembershipIds?.map((id) => {
                const member = members.find((m) => (m.projectMembershipId || m.id) === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-surface-muted text-content border border-border/70 rounded-md"
                  >
                    <span>{member?.user?.name || member?.user?.email || id}</span>
                    {unassignAccess.allowed && (
                      <button
                        type="button"
                        onClick={() => handleUnassign(id)}
                        disabled={isUnassigning || isAssigning}
                        className="text-content-muted hover:text-red-500 cursor-pointer"
                        title="Remove assignee"
                      >
                        <LuX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                );
              })}

              {(!task.assigneeProjectMembershipIds ||
                task.assigneeProjectMembershipIds.length === 0) && (
                <p className="text-xs text-content-muted">No assignees assigned.</p>
              )}
            </div>

            {assignAccess.allowed && (
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                {candidatesError ? <p role="alert">Could not load eligible assignees. <button type="button" onClick={refetchCandidates}>Retry</button></p> : <Select
                  className="flex-1 text-xs" classNamePrefix="taskforge-select"
                  isLoading={candidatesLoading} isDisabled={isAssigning || isUnassigning || candidatesLoading}
                  value={candidates.filter(member => member.projectMembershipId === selectedAssigneeId).map(member => ({ value: member.projectMembershipId, label: member.name }))[0] || null}
                  onChange={option => setSelectedAssigneeId(option?.value || '')}
                  placeholder="Choose an active owning-Team member…"
                  noOptionsMessage={() => 'No eligible owning-Team members'}
                  options={candidates.filter(member => !task.assigneeProjectMembershipIds?.includes(member.projectMembershipId)).map(member => ({ value: member.projectMembershipId, label: member.name }))}
                />}
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={isAssigning || isUnassigning || candidatesLoading || candidatesError || !candidates.some(member => member.projectMembershipId === selectedAssigneeId)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                >
                  Assign
                </button>
              </div>
            )}
          </div>

          {/* Approval Workflow & History */}
          {(task.requiresApproval || (task.approvals && task.approvals.length > 0)) && (
            <div className="pt-4 border-t border-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-content flex items-center gap-2">
                  <span>Approval Workflow</span>
                </h4>

                <div className="flex items-center gap-2">
                  {!pendingApproval && !isCompleted && (
                    <button
                      type="button"
                      onClick={() => setApprovalActionModal('request')}
                        disabled={!transitionAccess.allowed || isRequestingApproval}
                        title={transitionAccess.allowed ? undefined : editorReason(transitionAccess.reason)}
                      className="px-3 py-1 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary/90 cursor-pointer"
                    >
                      Request Approval
                    </button>
                  )}

                  {pendingApproval && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setApprovalActionModal('approve')}
                        disabled={!canResolveApproval}
                        title={canResolveApproval ? undefined : 'This approval action requires the designated actor and a mutable Project.'}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovalActionModal('reject')}
                        disabled={!canResolveApproval}
                        title={canResolveApproval ? undefined : 'This approval action requires the designated actor and a mutable Project.'}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-rose-600 rounded-md hover:bg-rose-700 cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovalActionModal('cancel')}
                        disabled={!canCancelApproval}
                        title={canCancelApproval ? undefined : 'This approval action requires the designated actor and a mutable Project.'}
                        className="px-2.5 py-1 text-xs font-medium text-content bg-surface-muted border border-border rounded-md hover:bg-surface cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {pendingApproval && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold text-amber-600 dark:text-amber-400">
                    <span>Active Cycle #{pendingApproval.requestNumber}</span>
                    <ApprovalStateBadge state={pendingApproval.state} />
                  </div>
                  {pendingApproval.requestReason && (
                    <p className="text-amber-700 dark:text-amber-300">
                      Reason: <span className="font-normal">{pendingApproval.requestReason}</span>
                    </p>
                  )}
                  <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80">
                    Requested on {new Date(pendingApproval.requestedAt).toLocaleString()}
                  </p>
                </div>
              )}

              {/* History Table */}
              {task.approvals?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-border rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-surface-muted text-content-muted border-b border-border">
                        <th className="py-1.5 px-2">Cycle</th>
                        <th className="py-1.5 px-2">State</th>
                        <th className="py-1.5 px-2">Request Reason</th>
                        <th className="py-1.5 px-2">Resolution Reason</th>
                        <th className="py-1.5 px-2">Requested At</th>
                        <th className="py-1.5 px-2">Resolved At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {task.approvals.map((a) => (
                        <tr key={a.id} className="hover:bg-surface-muted">
                          <td className="py-1.5 px-2 font-medium text-content">#{a.requestNumber}</td>
                          <td className="py-1.5 px-2">
                            <ApprovalStateBadge state={a.state} />
                          </td>
                          <td className="py-1.5 px-2 text-content-muted">{a.requestReason || '—'}</td>
                          <td className="py-1.5 px-2 text-content-muted">{a.resolutionReason || '—'}</td>
                          <td className="py-1.5 px-2 text-content-muted text-[11px]">
                            {new Date(a.requestedAt).toLocaleDateString()}
                          </td>
                          <td className="py-1.5 px-2 text-content-muted text-[11px]">
                            {a.resolvedAt ? new Date(a.resolvedAt).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <TaskAttachments projectId={projectId} task={task} />

          {/* Comments Section */}
          <div className="pt-4 border-t border-border/60 space-y-3">
            <h4 className="text-xs font-semibold text-content flex items-center gap-2">
              <span>Comments</span>
              <CountText count={task.comments?.length || 0} />
            </h4>

            <div className="space-y-2.5 max-h-60 overflow-y-auto">
              {task.comments?.map((comment) => {
                const authorMember = members.find(
                  (m) =>
                    (m.projectMembershipId || m.id) === comment.authorProjectMembershipId
                );
                const isEditingThis = editingCommentId === comment.id;

                return (
                  <div key={comment.id} className="p-3 bg-surface-muted/50 rounded-lg text-xs space-y-1.5 border border-border/40">
                    <div className="flex items-center justify-between text-content-muted text-[11px]">
                      <span className="font-semibold text-content">
                        {authorMember?.user?.name ||
                          authorMember?.user?.email ||
                          comment.authorProjectMembershipId}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                        {comment.editedAt && (
                          <span className="text-content-muted text-[10px]">(edited)</span>
                        )}
                        {!isEditingThis && commentAccess.allowed && (canManage || viewerMembershipId === comment.authorProjectMembershipId) && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommentId(comment.id);
                              setEditCommentBody(comment.body);
                            }}
                            className="text-content-muted hover:text-primary cursor-pointer"
                          >
                            <LuPencil className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!commentAccess.allowed || (!canManage && viewerMembershipId !== comment.authorProjectMembershipId)}
                          onClick={() => { if (commentAccess.allowed && (canManage || viewerMembershipId === comment.authorProjectMembershipId)) handleDeleteComment(comment.id); }}
                          className="text-content-muted hover:text-red-500 cursor-pointer"
                        >
                          <LuTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditingThis ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          rows={2}
                          value={editCommentBody}
                          onChange={(e) => setEditCommentBody(e.target.value)}
                          className="w-full p-2 text-xs border border-border rounded bg-surface text-content focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingCommentId(null)}
                            className="px-2.5 py-1 text-[11px] font-medium text-content bg-surface border border-border rounded hover:bg-surface-muted cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditCommentSubmit(comment.id)}
                            className="px-2.5 py-1 text-[11px] font-medium text-white bg-primary rounded hover:bg-primary/90 cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-content whitespace-pre-wrap">{comment.body}</p>
                    )}
                  </div>
                );
              })}

              {(!task.comments || task.comments.length === 0) && (
                <p className="text-xs text-content-muted">No comments yet.</p>
              )}
            </div>

            <form onSubmit={handlePostComment} className="flex gap-2">
              <input
                type="text"
                maxLength={10000}
                value={newCommentBody}
                onChange={(e) => setNewCommentBody(e.target.value)}
                placeholder="Write a comment..."
                aria-label="New comment"
                disabled={!commentAccess.allowed || isPostingComment}
                title={commentAccess.allowed ? undefined : editorReason(commentAccess.reason)}
                className="flex-1 px-3 py-2 text-xs border border-border bg-surface text-content placeholder:text-content-muted rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="submit"
                disabled={!commentAccess.allowed || isPostingComment || !newCommentBody.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
              >
                <LuSend className="w-3.5 h-3.5" />
                <span>Post</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Approval Reason Action Sub-Modal */}
      <Modal
        isOpen={Boolean(approvalActionModal)}
        onClose={() => setApprovalActionModal(null)}
        title={`Confirm Approval ${approvalActionModal?.toUpperCase()}`}
      >
        <div className="space-y-4">
          {actionError && <p role="alert" className="text-rose-600">{actionError}</p>}
          <p className="text-xs text-content-muted">
            {approvalActionModal === 'request' && 'Provide an optional reason for requesting approval:'}
            {approvalActionModal === 'approve' && 'Provide an optional reason for approving this task:'}
            {approvalActionModal === 'reject' && 'Provide an optional reason for rejecting this request:'}
            {approvalActionModal === 'cancel' && 'Cancellation requires a non-blank reason:'}
          </p>

          <textarea
            rows={3}
            value={approvalReason}
            onChange={(e) => setApprovalReason(e.target.value)}
            placeholder={
              approvalActionModal === 'cancel'
                ? 'Reason for cancelling (required)...'
                : 'Reason (optional)...'
            }
            className="w-full p-2.5 text-xs border border-border bg-surface text-content placeholder:text-content-muted rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => setApprovalActionModal(null)}
              className="px-4 py-2 text-xs font-medium text-content bg-surface border border-border rounded-lg hover:bg-surface-muted cursor-pointer"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleApprovalAction}
              disabled={
                isResolvingApproval ||
                isRequestingApproval ||
                (approvalActionModal === 'request' && !transitionAccess.allowed) ||
                (['approve', 'reject'].includes(approvalActionModal) && !canResolveApproval) ||
                (approvalActionModal === 'cancel' && !canCancelApproval) ||
                (approvalActionModal === 'cancel' && !approvalReason.trim())
              }
              className={`px-4 py-2 text-xs font-medium text-white rounded-lg cursor-pointer disabled:opacity-50 ${
                approvalActionModal === 'reject'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-primary hover:bg-primary/90'
              }`}
            >
              Confirm
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Archive Sub-Modal */}
      <Modal
        isOpen={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archive Task"
      >
        <div className="space-y-4">
          <p className="text-xs text-content-muted">
            Are you sure you want to archive <strong>{task?.title}</strong>? This will soft-archive the task and remove it from active boards and queues.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => setConfirmArchive(false)}
              className="px-4 py-2 text-xs font-medium text-content bg-surface border border-border rounded-lg hover:bg-surface-muted cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleArchive}
              disabled={isArchiving}
              className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer disabled:opacity-50"
            >
              {isArchiving ? 'Archiving...' : 'Confirm Archive'}
            </button>
          </div>
        </div>
      </Modal>

    </Modal>
  );
};

export default TaskDetailModal;
