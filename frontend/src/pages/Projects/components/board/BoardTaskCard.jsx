import React from 'react';
import {
  LuGripVertical,
  LuCalendar,
  LuFlame,
  LuArrowUp,
  LuMinus,
  LuArrowDown,
} from 'react-icons/lu';
import { isTaskOverdue } from '../../../../utils/taskAttention';
import { getTaskCapability } from '../../../../utils/taskCapabilities';
import { boardTransitionMessage } from '../../../../utils/boardTransitions';

const MODULE_COLORS = {
  Security: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
  Analytics: 'text-sky-700 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-300',
  General: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
  Billing: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300',
  'Frontend Engineering': 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300',
  'API Services': 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300',
  'Security & QA': 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300',
  DevOps: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
};

const getModuleStyle = (moduleName) => {
  return MODULE_COLORS[moduleName] || 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300';
};

function getMonogram(name = '') {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2 && words[0] && words[1]) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'TK';
}

export const BoardTaskCard = ({
  task,
  members = [],
  dragBlocked = false,
  isCompletedColumn,
  onSelectTask,
  onDragStart,
  onDragEnd,
}) => {
  const capability = getTaskCapability(task, 'transition');
  const access = capability.allowed && dragBlocked
    ? { allowed: false, reason: 'BOARD_REFRESH_REQUIRED' } : capability;
  const dragAllowed = access.allowed && typeof onDragStart === 'function';
  const dragReason = access.reason === 'BOARD_REFRESH_REQUIRED' ? 'Wait for the current move or refresh the Board before moving another Task.' : boardTransitionMessage(access);
  const isCompleted = isCompletedColumn || task.semanticCategory === 'COMPLETED';
  const overdue = isTaskOverdue(task.dueAt, isCompleted ? 'COMPLETED' : task.semanticCategory);

  // Derive task code (e.g. TK-94)
  const taskCode = task.code || task.customId || `TK-${String(task.id).slice(-3)}`;

  // Derive category/module label
  const moduleLabel = task.owningTeamName || 'General';

  // Calculate progress %
  const progress = isCompleted ? 100 : (task.effectiveProgress ?? 0);

  // Assignee initials
  const assignees = (task.assigneeProjectMembershipIds || []).map(id => {
    const member = members.find(entry => (entry.projectMembershipId || entry.id) === id);
    return { id, name: member?.user?.name || 'Unknown member' };
  });

  // Format Due Date
  const formatDueDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const renderPriorityBadge = () => {
    const p = String(task.priorityCode || task.priority || '').toUpperCase();
    if (p === 'URGENT') {
      return (
        <span className="inline-flex items-center text-rose-600 dark:text-rose-400 font-semibold text-[10px]">
          <LuFlame className="w-3.5 h-3.5 mr-0.5 text-rose-500" />
          Urgent
        </span>
      );
    }
    if (p === 'HIGH') {
      return (
        <span className="inline-flex items-center text-amber-600 dark:text-amber-400 font-medium text-[10px]">
          <LuArrowUp className="w-3.5 h-3.5 mr-0.5 text-amber-500" />
          High
        </span>
      );
    }
    if (p === 'MEDIUM') {
      return (
        <span className="inline-flex items-center text-slate-500 dark:text-slate-400 text-[10px]">
          <LuMinus className="w-3.5 h-3.5 mr-0.5 text-slate-400" />
          Medium
        </span>
      );
    }
    return (
      <span className="inline-flex items-center text-slate-400 text-[10px]">
        <LuArrowDown className="w-3.5 h-3.5 mr-0.5 text-slate-400" />
        Low
      </span>
    );
  };

  return (
    <article
      draggable={dragAllowed}
      onDragStart={(e) => { if (dragAllowed) onDragStart(e, task.id); else e.preventDefault(); }}
      onDragEnd={onDragEnd}
      onClick={() => onSelectTask && onSelectTask(task.id)}
      className={`bg-surface rounded-lg p-3.5 border border-border hover:border-primary/40 hover:shadow-xs transition ${dragAllowed ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} group select-none ${
        isCompleted ? 'opacity-90' : ''
      }`}
    >
      {/* Top row: Drag handle + Module badge + Task Code */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1.5">
          <LuGripVertical
            className="w-3.5 h-3.5 text-content-muted/40 group-hover:text-content-muted transition-colors mr-0.5 shrink-0"
            title={dragAllowed ? 'Drag to change status' : dragReason}
          />
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border border-border/40 truncate max-w-[130px] ${getModuleStyle(moduleLabel)}`}>
            {moduleLabel}
          </span>
        </div>
        <span className="text-[10px] text-content-muted font-mono shrink-0">
          {taskCode}
        </span>
      </div>

      {/* Task Title */}
      <h4
        className={`text-xs font-semibold text-content group-hover:text-primary leading-snug transition-colors line-clamp-2 ${
          isCompleted ? 'line-through text-content-muted' : ''
        }`}
      >
        {task.title}
      </h4>
      {!dragAllowed && <p className="text-[10px] text-content-muted mt-1">{dragReason}</p>}

      {/* Description */}
      {task.description && (
        <p className="text-[11px] text-content-muted mt-1 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="flex justify-between text-[10px] text-content-muted mb-1 font-medium">
          <span>{isCompleted ? 'Completed' : 'Progress'}</span>
          <span className="font-mono">{progress}%</span>
        </div>
        <div className="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden border border-border/40">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isCompleted ? 'bg-emerald-500' : progress >= 70 ? 'bg-indigo-600' : 'bg-primary'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Card Meta Footer */}
      <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px] text-content-muted">
        {/* Priority Badge */}
        <div className="flex items-center space-x-1.5">
          {renderPriorityBadge()}
        </div>

        {/* Due Date & Assignee Avatar */}
        <div className="flex items-center space-x-2">
          {task.dueAt && (
            <span
              className={`text-[10px] font-medium flex items-center ${
                overdue
                  ? 'text-rose-600 dark:text-rose-400 font-semibold'
                  : 'text-content-muted'
              }`}
            >
              <LuCalendar className="w-3 h-3 mr-0.5" />
              {formatDueDate(task.dueAt)}
            </span>
          )}

          {assignees.map(assignee => (
            <div
              key={assignee.id}
              className="w-5 h-5 rounded-full bg-zinc-800 text-white text-[9px] font-bold flex items-center justify-center ring-1 ring-border shrink-0"
              title={assignee.name}
              aria-label={assignee.name}
            >
              {getMonogram(assignee.name)}
            </div>
          ))}
        </div>
      </div>
    </article>
  );
};

export default React.memo(BoardTaskCard);
