import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  LuCopy,
  LuMaximize2,
  LuCalendar,
  LuSend,
  LuPlus,
  LuCheck,
  LuCircleAlert,
  LuLayers,
} from 'react-icons/lu';
import {
  useGetProjectTaskDetailQuery,
  useSetChecklistItemCompletionMutation,
  useAddChecklistItemMutation,
  useCreateCommentMutation,
} from '../../../services/taskApi.js';
import PriorityBars, { LinearStatusIcon } from '../../../components/task/PriorityBars.jsx';

const MyTaskInspector = ({ task, onOpenFullModal }) => {
  const [fastNote, setFastNote] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [isAddingChecklist, setIsAddingChecklist] = useState(false);

  const projectId = task?.projectId;
  const taskId = task?.id;

  // Fetch full task detail for live checklist and comments
  const { data: taskDetail } = useGetProjectTaskDetailQuery(
    { projectId, taskId },
    { skip: !projectId || !taskId }
  );

  const [setChecklistCompletion] = useSetChecklistItemCompletionMutation();
  const [addChecklistItem, { isLoading: isAddingItem }] = useAddChecklistItemMutation();
  const [createComment, { isLoading: isSendingNote }] = useCreateCommentMutation();

  const currentTask = taskDetail || task;

  if (!currentTask) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center space-y-3 sticky top-16 shadow-2xs">
        <div className="w-10 h-10 rounded-full bg-surface-muted text-content-muted flex items-center justify-center mx-auto">
          <LuLayers className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-content">No task selected</h3>
          <p className="text-[11px] text-content-muted mt-1">
            Click on any task from the list or press <kbd className="px-1 py-0.5 bg-surface-muted border border-border rounded font-mono text-[10px]">Space</kbd> to inspect details.
          </p>
        </div>
      </div>
    );
  }

  const checklist = currentTask.checklist || [];
  const completedChecklistCount = checklist.filter((item) => Boolean(item.completedAt)).length;
  const totalChecklistCount = checklist.length;

  const effectiveProgress = currentTask.effectiveProgress ?? currentTask.manualProgress ?? 0;
  const taskCode = currentTask.taskNumber ? `TF-${currentTask.taskNumber}` : `TF-${currentTask.id?.slice(-3).toUpperCase()}`;

  const handleCopyLink = () => {
    const url = `${window.location.origin}/projects/${projectId}?tab=tasks&task=${taskId}`;
    navigator.clipboard.writeText(url);
    toast.success('Task link copied to clipboard!');
  };

  const handleToggleChecklist = async (itemId, currentCompleted) => {
    try {
      await setChecklistCompletion({
        projectId,
        taskId,
        itemId,
        completed: !currentCompleted,
      }).unwrap();
    } catch {
      toast.error('Failed to update checklist item');
    }
  };

  const handleAddChecklist = async (e) => {
    e.preventDefault();
    if (!newChecklistText.trim()) return;
    try {
      await addChecklistItem({
        projectId,
        taskId,
        text: newChecklistText.trim(),
      }).unwrap();
      setNewChecklistText('');
      setIsAddingChecklist(false);
      toast.success('Checklist item added');
    } catch {
      toast.error('Failed to add checklist item');
    }
  };

  const handleSendFastNote = async (e) => {
    e.preventDefault();
    if (!fastNote.trim() || isSendingNote) return;
    try {
      await createComment({
        projectId,
        taskId,
        body: fastNote.trim(),
      }).unwrap();
      setFastNote('');
      toast.success('Fast note sent');
    } catch {
      toast.error('Failed to post comment');
    }
  };

  const formatDueDate = (dateStr) => {
    if (!dateStr) return 'No due date';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-5 sticky top-16 shadow-2xs">
      {/* Drawer Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-content bg-surface-muted border border-border px-2 py-0.5 rounded">
            {taskCode}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-surface-muted text-content border border-border">
            <LinearStatusIcon status={currentTask.semanticCategory} />
            <span>{currentTask.statusName || currentTask.semanticCategory}</span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyLink}
            className="p-1.5 text-content-muted hover:text-content rounded hover:bg-surface-muted transition-colors cursor-pointer"
            title="Copy link"
          >
            <LuCopy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onOpenFullModal && onOpenFullModal(currentTask)}
            className="p-1.5 text-content-muted hover:text-content rounded hover:bg-surface-muted transition-colors cursor-pointer"
            title="Open full detail"
          >
            <LuMaximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Title & Snippet */}
      <div>
        <h2 className="text-base font-semibold text-content leading-snug">
          {currentTask.title}
        </h2>
        {currentTask.description && (
          <p className="text-xs text-content-muted mt-1 leading-relaxed line-clamp-3">
            {currentTask.description}
          </p>
        )}
      </div>

      {/* Property Grid */}
      <div className="space-y-2.5 pt-1 text-xs divide-y divide-border/60">
        <div className="flex items-center justify-between py-1">
          <span className="text-content-muted">Assignee</span>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-zinc-800 text-white text-[9px] font-semibold flex items-center justify-center">
              {currentTask.assigneeName
                ? currentTask.assigneeName.slice(0, 2).toUpperCase()
                : 'U'}
            </div>
            <span className="font-medium text-content">
              {currentTask.assigneeName || 'Assigned to you'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between py-1 pt-2">
          <span className="text-content-muted">Priority</span>
          <div className="flex items-center gap-1.5">
            <PriorityBars priority={currentTask.priorityCode} />
            <span className="font-medium text-content text-[11px] capitalize">
              {currentTask.priorityCode ? currentTask.priorityCode.toLowerCase() : 'Medium'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between py-1 pt-2">
          <span className="text-content-muted">Project / Team</span>
          <span className="font-medium text-content bg-surface-muted border border-border px-2 py-0.5 rounded text-[11px] truncate max-w-[170px]">
            {currentTask.projectName || currentTask.owningTeamName || 'General'}
          </span>
        </div>

        <div className="flex items-center justify-between py-1 pt-2">
          <span className="text-content-muted">Target Due Date</span>
          <div className="flex items-center gap-1 text-content font-medium">
            <LuCalendar className="w-3.5 h-3.5 text-content-muted" />
            <span className="text-[11px]">{formatDueDate(currentTask.dueAt)}</span>
          </div>
        </div>

        <div className="py-1 pt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-content-muted">Completion</span>
            <span className="font-mono text-content font-semibold text-[11px]">
              {effectiveProgress}%
            </span>
          </div>
          <div className="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden border border-border/40">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, effectiveProgress))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Sub-tasks / Acceptance Checklist */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-content uppercase tracking-wider">
            Sub-tasks / Acceptance
          </span>
          <div className="flex items-center gap-2">
            {totalChecklistCount > 0 && (
              <span className="text-[11px] font-mono text-content-muted">
                {completedChecklistCount} of {totalChecklistCount}
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsAddingChecklist(!isAddingChecklist)}
              className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-0.5"
            >
              <LuPlus className="w-3 h-3" />
              <span>Add</span>
            </button>
          </div>
        </div>

        <div className="space-y-1.5 text-xs max-h-48 overflow-y-auto pr-1">
          {checklist.length > 0 ? (
            checklist.map((item) => {
              const isDone = Boolean(item.completedAt);
              return (
                <label
                  key={item.id}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-surface-muted/60 cursor-pointer group transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => handleToggleChecklist(item.id, isDone)}
                    className="rounded border-border text-primary focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span
                    className={`text-[11px] leading-tight truncate ${
                      isDone
                        ? 'text-content-muted line-through'
                        : 'text-content group-hover:text-primary transition-colors'
                    }`}
                  >
                    {item.text}
                  </span>
                </label>
              );
            })
          ) : (
            <p className="text-[11px] text-content-muted italic py-1">
              No acceptance criteria or sub-tasks added yet.
            </p>
          )}

          {isAddingChecklist && (
            <form onSubmit={handleAddChecklist} className="pt-1.5 flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                value={newChecklistText}
                onChange={(e) => setNewChecklistText(e.target.value)}
                placeholder="New sub-task..."
                className="flex-1 bg-surface-muted text-content text-xs px-2.5 py-1 rounded border border-border focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={isAddingItem || !newChecklistText.trim()}
                className="px-2 py-1 text-xs font-medium text-white bg-primary rounded hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
              >
                Add
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Activity Snippet / Fast Note Input */}
      <div className="pt-2">
        <span className="text-xs font-semibold text-content block mb-2 uppercase tracking-wider">
          Fast Note
        </span>
        <form onSubmit={handleSendFastNote} className="flex items-center gap-2">
          <input
            type="text"
            value={fastNote}
            onChange={(e) => setFastNote(e.target.value)}
            placeholder="Add an internal note or update..."
            className="flex-1 bg-surface-muted border border-border focus:border-primary text-xs py-1.5 px-3 rounded-md placeholder:text-content-muted text-content focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={isSendingNote || !fastNote.trim()}
            className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 p-2 rounded-md transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
            title="Send note"
          >
            <LuSend className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default MyTaskInspector;
