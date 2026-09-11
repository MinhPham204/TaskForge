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
import {
  useGetTaskAttachmentsQuery,
  useUploadTaskAttachmentMutation,
  useUnlinkTaskAttachmentMutation,
  downloadTaskAttachment,
} from '../../../services/collaborationApi';
import {
  TaskStatusBadge,
  PriorityBadge,
  ApprovalStateBadge,
} from './TaskStatusBadge';
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
  LuPaperclip,
  LuDownload,
  LuFileText,
  LuUpload,
} from 'react-icons/lu';

const TaskDetailModal = ({
  isOpen,
  onClose,
  projectId,
  taskId,
  canManage = false,
  onEditTask,
}) => {
  const {
    data: task,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetProjectTaskDetailQuery(
    { projectId, taskId },
    { skip: !isOpen || !taskId }
  );

  const { data: statuses = [] } = useGetProjectStatusesQuery(projectId, { skip: !isOpen });
  const { data: members = [] } = useGetProjectMembersQuery(projectId, { skip: !isOpen });

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

  // Task Attachments
  const {
    data: attachments = [],
    isLoading: isLoadingAttachments,
  } = useGetTaskAttachmentsQuery(
    { projectId, taskId },
    { skip: !isOpen || !taskId }
  );
  const [uploadAttachment, { isLoading: isUploadingAttachment }] = useUploadTaskAttachmentMutation();
  const [unlinkAttachment, { isLoading: isUnlinkingAttachment }] = useUnlinkTaskAttachmentMutation();

  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [attachmentToUnlink, setAttachmentToUnlink] = useState(null);
  const [unlinkError, setUnlinkError] = useState('');
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState(null);

  // Sync selected status and progress when task loads
  React.useEffect(() => {
    if (task) {
      setSelectedStatusId(task.statusId);
      setProgressInput(task.manualProgress || 0);
      setActionError('');
      setAttachmentError('');
      setAttachmentFile(null);
    }
  }, [task]);

  if (!isOpen) return null;

  const handleStatusTransition = async () => {
    if (!selectedStatusId || selectedStatusId === task?.statusId) return;
    setActionError('');
    try {
      await transitionStatus({ projectId, taskId, statusId: selectedStatusId }).unwrap();
    } catch (err) {
      setActionError(err.data?.message || err.message || 'Status transition failed');
      setSelectedStatusId(task?.statusId);
    }
  };

  const handleProgressSave = async () => {
    setActionError('');
    try {
      await setManualProgress({
        projectId,
        taskId,
        manualProgress: Number(progressInput),
      }).unwrap();
    } catch (err) {
      setActionError(err.data?.message || err.message || 'Failed to update progress');
    }
  };

  const handleAddChecklist = async (e) => {
    e.preventDefault();
    if (!newChecklistText.trim()) return;
    setActionError('');
    try {
      await addChecklistItem({ projectId, taskId, text: newChecklistText.trim() }).unwrap();
      setNewChecklistText('');
    } catch (err) {
      setActionError(err.data?.message || err.message || 'Failed to add checklist item');
    }
  };

  const handleToggleChecklist = async (itemId, currentCompleted) => {
    setActionError('');
    try {
      await setChecklistItemCompletion({
        projectId,
        taskId,
        itemId,
        completed: !currentCompleted,
      }).unwrap();
    } catch (err) {
      setActionError(err.data?.message || err.message || 'Failed to update checklist item');
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newCommentBody.trim()) return;
    setActionError('');
    try {
      await createComment({ projectId, taskId, body: newCommentBody.trim() }).unwrap();
      setNewCommentBody('');
    } catch (err) {
      setActionError(err.data?.message || err.message || 'Failed to post comment');
    }
  };

  const handleEditCommentSubmit = async (commentId) => {
    if (!editCommentBody.trim()) return;
    setActionError('');
    try {
      await editComment({ projectId, taskId, commentId, body: editCommentBody.trim() }).unwrap();
      setEditingCommentId(null);
      setEditCommentBody('');
    } catch (err) {
      setActionError(err.data?.message || err.message || 'Failed to update comment');
    }
  };

  const handleDeleteComment = async (commentId) => {
    setActionError('');
    try {
      await deleteComment({ projectId, taskId, commentId }).unwrap();
    } catch (err) {
      setActionError(err.data?.message || err.message || 'Failed to delete comment');
    }
  };

  const handleAssign = async () => {
    if (!selectedAssigneeId) return;
    setActionError('');
    try {
      await assignTask({ projectId, taskId, projectMembershipId: selectedAssigneeId }).unwrap();
      setSelectedAssigneeId('');
    } catch (err) {
      setActionError(err.data?.message || err.message || 'Failed to assign member');
    }
  };

  const handleUnassign = async (membershipId) => {
    setActionError('');
    try {
      await unassignTask({ projectId, taskId, projectMembershipId: membershipId }).unwrap();
    } catch (err) {
      setActionError(err.data?.message || err.message || 'Failed to remove assignee');
    }
  };

  const handleApprovalAction = async () => {
    setActionError('');
    try {
      if (approvalActionModal === 'request') {
        await requestApproval({
          projectId,
          taskId,
          reason: approvalReason.trim() || undefined,
        }).unwrap();
      } else if (['approve', 'reject', 'cancel'].includes(approvalActionModal)) {
        await resolveApproval({
          projectId,
          taskId,
          action: approvalActionModal,
          reason: approvalReason.trim() || undefined,
        }).unwrap();
      }
      setApprovalActionModal(null);
      setApprovalReason('');
    } catch (err) {
      setActionError(err.data?.message || err.message || 'Approval action failed');
    }
  };

  const handleArchive = async () => {
    setActionError('');
    try {
      await archiveTask({ projectId, taskId }).unwrap();
      onClose();
    } catch (err) {
      setActionError(err.data?.message || err.message || 'Failed to archive task');
    }
  };

  const handleAttachmentFileChange = (e) => {
    const file = e.target.files?.[0];
    setAttachmentError('');
    if (!file) {
      setAttachmentFile(null);
      return;
    }
    const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'];
    if (!ALLOWED.includes(file.type)) {
      setAttachmentError('Only PDF, JPEG, PNG, or plain text files are allowed.');
      setAttachmentFile(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError('Attachment exceeds 10 MiB limit.');
      setAttachmentFile(null);
      return;
    }
    setAttachmentFile(file);
  };

  const handleUploadAttachment = async (e) => {
    e.preventDefault();
    if (!attachmentFile) return;
    setAttachmentError('');
    const formData = new FormData();
    formData.append('file', attachmentFile);
    try {
      await uploadAttachment({ projectId, taskId, formData }).unwrap();
      setAttachmentFile(null);
      const input = document.getElementById('task-attachment-file-input');
      if (input) input.value = '';
    } catch (err) {
      setAttachmentError(err.data?.message || err.message || 'Failed to upload attachment');
    }
  };

  const handleDownloadAttachment = async (att) => {
    try {
      setDownloadingAttachmentId(att.id);
      await downloadTaskAttachment(projectId, taskId, att.id, att.originalName);
    } catch (err) {
      console.error('Attachment download failed', err);
    } finally {
      setDownloadingAttachmentId(null);
    }
  };

  const handleConfirmUnlinkAttachment = async () => {
    if (!attachmentToUnlink) return;
    setUnlinkError('');
    try {
      await unlinkAttachment({
        projectId,
        taskId,
        attachmentId: attachmentToUnlink.id,
      }).unwrap();
      setAttachmentToUnlink(null);
    } catch (err) {
      setUnlinkError(err.data?.message || err.message || 'Failed to remove attachment');
    }
  };

  const pendingApproval = task?.approvals?.find((a) => a.state === 'PENDING');
  const isCompleted = task?.semanticCategory === 'COMPLETED';
  const hasChecklist = task?.checklist?.length > 0;

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
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <label htmlFor="transition-status" className="text-xs font-semibold text-gray-700">
                Status:
              </label>
              <select
                id="transition-status"
                value={selectedStatusId}
                onChange={(e) => setSelectedStatusId(e.target.value)}
                disabled={isTransitioning}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-primary"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.semanticCategory})
                  </option>
                ))}
              </select>
              {selectedStatusId !== task.statusId && (
                <button
                  type="button"
                  onClick={handleStatusTransition}
                  disabled={isTransitioning}
                  className="px-2 py-1 text-xs font-medium text-white bg-primary rounded hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                >
                  {isTransitioning ? 'Moving...' : 'Move'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <TaskStatusBadge
                category={task.semanticCategory}
                label={task.statusName}
              />
              <PriorityBadge priority={task.priorityCode} />

              <button
                type="button"
                onClick={() => onEditTask?.(task)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 cursor-pointer"
              >
                <LuPencil className="w-3.5 h-3.5" />
                Edit
              </button>

              {canManage && (
                <button
                  type="button"
                  onClick={() => setConfirmArchive(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 cursor-pointer"
                >
                  <LuTrash2 className="w-3.5 h-3.5" />
                  Archive
                </button>
              )}
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3 bg-white border border-gray-200 rounded-lg">
              <span className="text-gray-500 block mb-1">Owning Team</span>
              <span className="font-semibold text-gray-800">
                {task.owningTeamName || task.owningTeamId}
              </span>
            </div>
            <div className="p-3 bg-white border border-gray-200 rounded-lg">
              <span className="text-gray-500 block mb-1">Due Date</span>
              <span className="font-semibold text-gray-800">
                {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'None'}
              </span>
            </div>
            <div className="p-3 bg-white border border-gray-200 rounded-lg">
              <span className="text-gray-500 block mb-1">Effective Progress</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${task.effectiveProgress}%` }}
                  />
                </div>
                <span className="font-semibold text-gray-800">{task.effectiveProgress}%</span>
              </div>
            </div>
            <div className="p-3 bg-white border border-gray-200 rounded-lg">
              <span className="text-gray-500 block mb-1">Approval Required</span>
              <span className="font-semibold text-gray-800">
                {task.requiresApproval ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h4 className="text-xs font-semibold text-gray-700 mb-1">Description</h4>
              <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                {task.description}
              </p>
            </div>
          )}

          {/* Manual Progress Slider if No Checklist */}
          {!hasChecklist && !isCompleted && (
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">
                  Manual Progress: {progressInput}%
                </span>
                <button
                  type="button"
                  onClick={handleProgressSave}
                  disabled={isUpdatingProgress || Number(progressInput) === task.manualProgress}
                  className="px-3 py-1 text-xs font-medium text-white bg-primary rounded hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                >
                  {isUpdatingProgress ? 'Saving...' : 'Update Progress'}
                </button>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={progressInput}
                onChange={(e) => setProgressInput(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          )}

          {/* Checklist Section */}
          <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                <LuCircleCheck className="w-4 h-4 text-primary" />
                Checklist ({task.checklist?.filter((c) => c.completedAt).length || 0}/
                {task.checklist?.length || 0})
              </h4>
            </div>

            <div className="space-y-1.5">
              {task.checklist?.map((item) => {
                const isItemDone = Boolean(item.completedAt);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors"
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={isItemDone}
                        disabled={isCompleted}
                        onChange={() => handleToggleChecklist(item.id, isItemDone)}
                        className="rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
                      />
                      <span
                        className={
                          isItemDone ? 'line-through text-gray-400' : 'text-gray-800 font-medium'
                        }
                      >
                        {item.text}
                      </span>
                    </label>
                    {item.completedAt && (
                      <span className="text-[10px] text-gray-400">
                        {new Date(item.completedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                );
              })}

              {!hasChecklist && (
                <p className="text-xs text-gray-400 italic">No checklist items yet.</p>
              )}
            </div>

            {!isCompleted && (
              <form onSubmit={handleAddChecklist} className="flex gap-2 pt-2">
                <input
                  type="text"
                  maxLength={1000}
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  placeholder="Add a checklist item..."
                  className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={isAddingChecklist || !newChecklistText.trim()}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded hover:bg-primary/90 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
                >
                  <LuPlus className="w-3.5 h-3.5" />
                  Add
                </button>
              </form>
            )}
          </div>

          {/* Assignees Section */}
          <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-3">
            <h4 className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
              <LuUsers className="w-4 h-4 text-primary" />
              Assignees ({task.assigneeProjectMembershipIds?.length || 0})
            </h4>

            <div className="flex flex-wrap gap-2">
              {task.assigneeProjectMembershipIds?.map((id) => {
                const member = members.find((m) => (m.id || m.organizationMembershipId) === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 rounded-md"
                  >
                    <span>{member?.user?.name || member?.user?.email || id}</span>
                    {canManage && !isCompleted && (
                      <button
                        type="button"
                        onClick={() => handleUnassign(id)}
                        disabled={isUnassigning}
                        className="text-blue-600 hover:text-red-600 cursor-pointer"
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
                <p className="text-xs text-gray-400 italic">No assignees assigned.</p>
              )}
            </div>

            {canManage && !isCompleted && (
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Select
                  className="flex-1 text-xs"
                  classNamePrefix="taskforge-select"
                  value={
                    members
                      .filter((member) => (member.id || member.projectMembershipId) === selectedAssigneeId)
                      .map((member) => ({
                        value: member.id || member.projectMembershipId,
                        label: `${member.user?.name || member.user?.email} — ${member.user?.email || ''}`,
                      }))[0] || null
                  }
                  onChange={(option) => setSelectedAssigneeId(option?.value || '')}
                  placeholder="Search project members by name or email..."
                  noOptionsMessage={() => 'No eligible project members'}
                  options={members
                    .filter((member) => !task.assigneeProjectMembershipIds?.includes(member.id || member.projectMembershipId))
                    .map((member) => ({
                      value: member.id || member.projectMembershipId,
                      label: `${member.user?.name || member.user?.email} — ${member.user?.email || ''}`,
                    }))}
                />
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={isAssigning || !selectedAssigneeId}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                >
                  Assign
                </button>
              </div>
            )}
          </div>

          {/* Approval Workflow & History */}
          {(task.requiresApproval || (task.approvals && task.approvals.length > 0)) && (
            <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                  <LuShieldCheck className="w-4 h-4 text-primary" />
                  Approval Workflow
                </h4>

                <div className="flex items-center gap-2">
                  {!pendingApproval && !isCompleted && (
                    <button
                      type="button"
                      onClick={() => setApprovalActionModal('request')}
                      className="px-3 py-1 text-xs font-medium text-white bg-primary rounded hover:bg-primary/90 cursor-pointer"
                    >
                      Request Approval
                    </button>
                  )}

                  {pendingApproval && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setApprovalActionModal('approve')}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovalActionModal('reject')}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-rose-600 rounded hover:bg-rose-700 cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovalActionModal('cancel')}
                        className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {pendingApproval && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold text-amber-900">
                    <span>Active Cycle #{pendingApproval.requestNumber}</span>
                    <ApprovalStateBadge state={pendingApproval.state} />
                  </div>
                  {pendingApproval.requestReason && (
                    <p className="text-amber-800">
                      Reason: <span className="font-normal">{pendingApproval.requestReason}</span>
                    </p>
                  )}
                  <p className="text-[10px] text-amber-600">
                    Requested on {new Date(pendingApproval.requestedAt).toLocaleString()}
                  </p>
                </div>
              )}

              {/* History Table */}
              {task.approvals?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-gray-100">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                        <th className="py-1.5 px-2">Cycle</th>
                        <th className="py-1.5 px-2">State</th>
                        <th className="py-1.5 px-2">Request Reason</th>
                        <th className="py-1.5 px-2">Resolution Reason</th>
                        <th className="py-1.5 px-2">Requested At</th>
                        <th className="py-1.5 px-2">Resolved At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {task.approvals.map((a) => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="py-1.5 px-2 font-medium">#{a.requestNumber}</td>
                          <td className="py-1.5 px-2">
                            <ApprovalStateBadge state={a.state} />
                          </td>
                          <td className="py-1.5 px-2 text-gray-600">{a.requestReason || '—'}</td>
                          <td className="py-1.5 px-2 text-gray-600">{a.resolutionReason || '—'}</td>
                          <td className="py-1.5 px-2 text-gray-400 text-[11px]">
                            {new Date(a.requestedAt).toLocaleDateString()}
                          </td>
                          <td className="py-1.5 px-2 text-gray-400 text-[11px]">
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

          {/* Attachments Section */}
          <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                <LuPaperclip className="w-4 h-4 text-primary" />
                Attachments ({attachments.length})
              </h4>
            </div>

            {attachmentError && (
              <div
                role="alert"
                className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg"
              >
                {attachmentError}
              </div>
            )}

            {/* List of Attachments */}
            <div className="space-y-2">
              {isLoadingAttachments ? (
                <p className="text-xs text-gray-400 py-2">Loading attachments...</p>
              ) : attachments.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No attachments attached to this task.</p>
              ) : (
                attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100/70 transition-colors text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <LuFileText className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate max-w-xs sm:max-w-md">
                          {att.originalName}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {att.mediaType} &bull;{' '}
                          {att.sizeBytes > 1024 * 1024
                            ? `${(att.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                            : `${Math.round(att.sizeBytes / 1024)} KB`}{' '}
                          &bull; {new Date(att.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(att)}
                        disabled={downloadingAttachmentId === att.id}
                        title="Download attachment"
                        aria-label={`Download ${att.originalName}`}
                        className="p-1.5 text-gray-600 hover:text-primary rounded-md hover:bg-white cursor-pointer disabled:opacity-50"
                      >
                        <LuDownload className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setUnlinkError('');
                          setAttachmentToUnlink(att);
                        }}
                        title="Remove attachment"
                        aria-label={`Remove ${att.originalName}`}
                        className="p-1.5 text-gray-600 hover:text-red-600 rounded-md hover:bg-white cursor-pointer"
                      >
                        <LuTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Upload Attachment Form */}
            {!isCompleted && (
              <form onSubmit={handleUploadAttachment} className="flex flex-col sm:flex-row gap-2 pt-1">
                <input
                  id="task-attachment-file-input"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  onChange={handleAttachmentFileChange}
                  disabled={isUploadingAttachment}
                  className="flex-1 text-xs text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 file:cursor-pointer border border-gray-300 rounded p-1"
                />
                <button
                  type="submit"
                  disabled={isUploadingAttachment || !attachmentFile}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded hover:bg-primary/90 disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-1"
                >
                  {isUploadingAttachment ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Attaching...</span>
                    </>
                  ) : (
                    <>
                      <LuUpload className="w-3.5 h-3.5" />
                      <span>Attach File</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Comments Section */}
          <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-4">
            <h4 className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
              <LuMessageSquare className="w-4 h-4 text-primary" />
              Comments ({task.comments?.length || 0})
            </h4>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {task.comments?.map((comment) => {
                const authorMember = members.find(
                  (m) =>
                    (m.id || m.organizationMembershipId) === comment.authorProjectMembershipId
                );
                const isEditingThis = editingCommentId === comment.id;

                return (
                  <div key={comment.id} className="p-3 bg-gray-50 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-gray-500 text-[11px]">
                      <span className="font-semibold text-gray-700">
                        {authorMember?.user?.name ||
                          authorMember?.user?.email ||
                          comment.authorProjectMembershipId}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                        {comment.editedAt && (
                          <span className="text-gray-400 text-[10px]">(edited)</span>
                        )}
                        {!isEditingThis && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommentId(comment.id);
                              setEditCommentBody(comment.body);
                            }}
                            className="text-gray-500 hover:text-primary cursor-pointer"
                          >
                            <LuPencil className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-gray-500 hover:text-red-600 cursor-pointer"
                        >
                          <LuTrash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {isEditingThis ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          rows={2}
                          value={editCommentBody}
                          onChange={(e) => setEditCommentBody(e.target.value)}
                          className="w-full p-2 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingCommentId(null)}
                            className="px-2.5 py-1 text-[11px] font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 cursor-pointer"
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
                      <p className="text-gray-800 whitespace-pre-wrap">{comment.body}</p>
                    )}
                  </div>
                );
              })}

              {(!task.comments || task.comments.length === 0) && (
                <p className="text-xs text-gray-400 italic">No comments yet.</p>
              )}
            </div>

            <form onSubmit={handlePostComment} className="flex gap-2">
              <input
                type="text"
                maxLength={10000}
                value={newCommentBody}
                onChange={(e) => setNewCommentBody(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="submit"
                disabled={isPostingComment || !newCommentBody.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
              >
                <LuSend className="w-3.5 h-3.5" />
                Post
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
          <p className="text-xs text-gray-600">
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
            className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setApprovalActionModal(null)}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleApprovalAction}
              disabled={
                isResolvingApproval ||
                isRequestingApproval ||
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
          <p className="text-xs text-gray-600">
            Are you sure you want to archive <strong>{task?.title}</strong>? This will soft-archive the task and remove it from active boards and queues.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setConfirmArchive(false)}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
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

      {/* Confirm Unlink Attachment Sub-Modal */}
      <Modal
        isOpen={Boolean(attachmentToUnlink)}
        onClose={() => !isUnlinkingAttachment && setAttachmentToUnlink(null)}
        title="Remove Task Attachment"
      >
        <div className="space-y-4">
          {unlinkError && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg"
            >
              {unlinkError}
            </div>
          )}
          <p className="text-xs text-gray-600">
            Are you sure you want to remove <strong>{attachmentToUnlink?.originalName}</strong> from this task? The attachment relation will be soft-removed.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setAttachmentToUnlink(null)}
              disabled={isUnlinkingAttachment}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmUnlinkAttachment}
              disabled={isUnlinkingAttachment}
              className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isUnlinkingAttachment ? 'Removing...' : 'Confirm Remove'}
            </button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
};

export default TaskDetailModal;
