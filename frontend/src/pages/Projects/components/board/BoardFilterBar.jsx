import React from 'react';
import { LuSearch, LuPlus, LuX } from 'react-icons/lu';

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const BoardFilterBar = ({
  search = '',
  onSearchChange,
  priorityCode = '',
  onPriorityChange,
  teamId = '',
  onTeamChange,
  teams = [],
  onClearFilters,
  canManage = false,
  onCreateTask,
  onSwitchView,
}) => {
  const hasActiveFilters = Boolean(search.trim() || priorityCode || teamId);

  return (
    <div className="py-2.5 px-3 border-b border-border bg-surface-muted/30 rounded-xl flex flex-wrap items-center justify-between gap-3 shrink-0">
      {/* Filter Controls */}
      <div className="flex items-center space-x-2.5 flex-1 min-w-[280px]">
        {/* Search input */}
        <div className="relative w-60">
          <LuSearch className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks..."
            className="w-full text-xs rounded-md border border-border bg-surface pl-8 pr-3 py-1.5 focus:border-primary focus:outline-none transition-all placeholder:text-content-muted text-content shadow-2xs"
          />
        </div>

        {/* Priority Filter */}
        <select
          value={priorityCode}
          onChange={(e) => onPriorityChange(e.target.value)}
          className="text-xs rounded-md border border-border bg-surface py-1.5 pl-2.5 pr-8 text-content focus:border-primary focus:outline-none shadow-2xs cursor-pointer"
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {/* Team Filter */}
        <select
          value={teamId}
          onChange={(e) => onTeamChange(e.target.value)}
          className="text-xs rounded-md border border-border bg-surface py-1.5 pl-2.5 pr-8 text-content focus:border-primary focus:outline-none shadow-2xs cursor-pointer"
        >
          <option value="">All Teams</option>
          {teams.map((t) => (
            <option key={t.teamId || t.id} value={t.teamId || t.id}>
              {t.teamName || t.name || t.teamId || t.id}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-content-muted hover:text-content bg-surface rounded-md border border-border transition-colors cursor-pointer"
            title="Clear filters"
          >
            <LuX className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Right Controls: View Presets & Action Button */}
      <div className="flex items-center space-x-3">
        {/* View presets switcher */}
        <div className="inline-flex rounded-md shadow-2xs border border-border bg-surface p-0.5 text-xs">
          <button
            type="button"
            className="px-2.5 py-1 rounded bg-surface-muted text-content font-semibold shadow-2xs"
          >
            Board
          </button>
          <button
            type="button"
            onClick={() => onSwitchView && onSwitchView('tasks')}
            className="px-2.5 py-1 rounded text-content-muted hover:text-content transition-colors cursor-pointer"
          >
            List
          </button>
        </div>

        {/* Create Task Button */}
        <button
          type="button"
          onClick={onCreateTask}
          title="Create Task (Press C)"
          aria-label="Create Task"
          className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-xs font-medium px-3 py-1.5 rounded-md shadow-2xs transition-colors cursor-pointer"
        >
          <LuPlus className="w-3.5 h-3.5 stroke-[2.2]" />
          <span>New Task</span>
          <kbd className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono ml-0.5">C</kbd>
        </button>
      </div>
    </div>
  );
};

export default BoardFilterBar;
