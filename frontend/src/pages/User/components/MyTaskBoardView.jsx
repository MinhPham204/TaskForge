import React from 'react';
import { LuCalendar, LuCircleAlert } from 'react-icons/lu';
import PriorityBars, { LinearStatusIcon } from '../../../components/task/PriorityBars.jsx';
import { isTaskOverdue } from '../../../utils/taskAttention.js';

const COLUMNS = [
  {
    id: 'TODO',
    title: 'To Do & Backlog',
    categories: ['NOT_STARTED'],
    dotClass: 'bg-zinc-400',
  },
  {
    id: 'IN_PROGRESS',
    title: 'In Progress',
    categories: ['IN_PROGRESS'],
    dotClass: 'bg-blue-500 animate-pulse',
  },
  {
    id: 'REVIEW',
    title: 'In Review',
    categories: ['REVIEW', 'IN_REVIEW'],
    dotClass: 'bg-purple-500',
  },
  {
    id: 'COMPLETED',
    title: 'Completed',
    categories: ['COMPLETED', 'CANCELLED'],
    dotClass: 'bg-emerald-500',
  },
];

const MyTaskBoardView = ({ tasks = [], onSelectTask, selectedTaskId }) => {
  const getTasksForColumn = (column) => {
    return tasks.filter((t) => {
      const cat = String(t.semanticCategory || '').toUpperCase();
      return column.categories.includes(cat);
    });
  };

  const formatDueDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
      {COLUMNS.map((col) => {
        const colTasks = getTasksForColumn(col);
        return (
          <div
            key={col.id}
            className="bg-surface-muted/50 rounded-xl border border-border p-3 flex flex-col space-y-3 min-h-[300px]"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${col.dotClass}`} />
                <h3 className="text-xs font-semibold text-content uppercase tracking-wider">
                  {col.title}
                </h3>
              </div>
              <span className="text-xs font-mono text-content-muted">
                {colTasks.length}
              </span>
            </div>

            {/* Task Cards */}
            <div className="space-y-2 flex-1">
              {colTasks.length === 0 ? (
                <div className="h-28 flex items-center justify-center border border-dashed border-border rounded-lg text-[11px] text-content-muted">
                  No tasks
                </div>
              ) : (
                colTasks.map((task) => {
                  const isSelected = selectedTaskId === task.id;
                  const isOverdue = isTaskOverdue(task.dueAt, task.semanticCategory);
                  const taskCode = task.taskNumber
                    ? `TF-${task.taskNumber}`
                    : `TF-${task.id?.slice(-3).toUpperCase()}`;

                  return (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask && onSelectTask(task)}
                      className={`p-3 rounded-lg border bg-surface transition-all cursor-pointer shadow-2xs space-y-2.5 ${
                        isSelected
                          ? 'border-primary ring-1 ring-primary shadow-sm'
                          : 'border-border hover:border-border/80 hover:bg-surface-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="font-mono text-content-muted">{taskCode}</span>
                        {task.projectName && (
                          <span className="text-[10px] text-content-muted bg-surface-muted border border-border px-1.5 py-0.5 rounded truncate max-w-[110px]">
                            {task.projectName}
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs font-medium text-content leading-snug line-clamp-2">
                        {task.title}
                      </h4>

                      <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <PriorityBars priority={task.priorityCode} showLabel={false} />
                          {task.dueAt && (
                            <span
                              className={`flex items-center gap-1 ${
                                isOverdue ? 'text-danger font-medium' : 'text-content-muted'
                              }`}
                            >
                              <LuCalendar className="w-3 h-3" />
                              <span>{formatDueDate(task.dueAt)}</span>
                            </span>
                          )}
                        </div>

                        <div className="w-5 h-5 rounded-full bg-zinc-800 text-white text-[9px] font-semibold flex items-center justify-center">
                          {task.assigneeName ? task.assigneeName.slice(0, 2).toUpperCase() : 'U'}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MyTaskBoardView;
