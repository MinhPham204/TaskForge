import React from 'react';
import { LuEllipsisVertical } from 'react-icons/lu';
import BoardTaskCard from './BoardTaskCard';

const getColumnColor = (column) => {
  const cat = String(column.semanticCategory || '').toUpperCase();
  const name = String(column.name || '').toLowerCase();

  if (cat === 'COMPLETED' || name.includes('complete') || name.includes('done')) {
    return 'bg-emerald-500';
  }
  if (name.includes('review') || name.includes('qa') || name.includes('testing')) {
    return 'bg-purple-500';
  }
  if (cat === 'IN_PROGRESS' || name.includes('progress') || name.includes('doing')) {
    return 'bg-amber-500';
  }
  if (name.includes('backlog')) {
    return 'bg-slate-400';
  }
  return 'bg-blue-500'; // Default To Do
};

const BoardColumn = ({
  column,
  dragOverColumnId,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onSelectTask,
  onDragStart,
  onDragEnd,
}) => {
  const tasks = column.tasks || [];
  const dotColor = getColumnColor(column);
  const isCompletedColumn = String(column.semanticCategory || '').toUpperCase() === 'COMPLETED';
  const isDragOver = dragOverColumnId === column.id;

  return (
    <section
      data-purpose="kanban-column"
      onDragOver={(e) => onDragOver(e, column.id)}
      onDragEnter={(e) => onDragEnter(e, column.id)}
      onDragLeave={(e) => onDragLeave(e, column.id)}
      onDrop={(e) => onDrop(e, column.id)}
      className={`w-80 shrink-0 flex flex-col max-h-full rounded-xl border p-3 shadow-2xs transition-colors duration-150 ${
        isDragOver
          ? 'bg-primary/10 border-primary ring-2 ring-primary/20 shadow-sm'
          : 'bg-surface-muted/50 border-border/80'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1 select-none">
        <div className="flex items-center space-x-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
          <h3 className="text-xs font-semibold text-content uppercase tracking-wider truncate">
            {column.name}
          </h3>
          <span className="text-xs font-mono font-medium text-content-muted bg-surface px-2 py-0.5 rounded-full border border-border shadow-2xs shrink-0">
            {tasks.length}
          </span>
        </div>

        <button
          type="button"
          className="text-content-muted hover:text-content p-1 rounded hover:bg-surface transition-colors cursor-pointer"
          title="Column options"
        >
          <LuEllipsisVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Card Stack Container */}
      <div className="space-y-3 overflow-y-auto pr-0.5 custom-scrollbar flex-1 min-h-[300px]">
        {tasks.map((task) => (
          <BoardTaskCard
            key={task.id}
            task={task}
            isCompletedColumn={isCompletedColumn}
            onSelectTask={onSelectTask}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}

        {tasks.length === 0 && (
          <div className="h-32 border border-dashed border-border rounded-lg flex items-center justify-center text-xs text-content-muted/60 select-none">
            Drop tasks here
          </div>
        )}
      </div>
    </section>
  );
};

export default BoardColumn;
