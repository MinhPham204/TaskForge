import React from 'react';
import { LuSparkles, LuTrendingUp } from 'react-icons/lu';

/**
 * SVG Donut Chart showing completion rate with circular gauge
 */
export const CompletionDonut = ({ completed = 0, active = 0, overdue = 0, total = 0 }) => {
  const effectiveTotal = total > 0 ? total : completed + active;
  const percentage = effectiveTotal > 0 ? Math.min(100, Math.round((completed / effectiveTotal) * 100)) : 0;

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * percentage) / 100;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-surface border border-border">
      <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle track */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="stroke-surface-muted text-surface-muted fill-none"
            stroke="currentColor"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="text-primary fill-none transition-all duration-700 ease-out"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-bold tracking-tight text-content">{percentage}%</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-content-muted">Done</span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <LuSparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-content">Completion Health</span>
          </div>
          <span className="text-xs font-medium text-content-muted">
            {completed} of {effectiveTotal} completed
          </span>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="p-2 rounded-lg bg-surface-muted border border-border/50 text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] text-content-muted mb-0.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Active</span>
            </div>
            <p className="text-sm font-bold text-content">{active}</p>
          </div>

          <div className="p-2 rounded-lg bg-surface-muted border border-border/50 text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] text-content-muted mb-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Done</span>
            </div>
            <p className="text-sm font-bold text-content">{completed}</p>
          </div>

          <div className="p-2 rounded-lg bg-surface-muted border border-border/50 text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] text-content-muted mb-0.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Overdue</span>
            </div>
            <p className="text-sm font-bold text-content">{overdue}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Segmented Workload Bar showing task state proportions
 */
export const WorkloadDistributionBar = ({ active = 0, dueToday = 0, upcoming = 0, overdue = 0, completed = 0 }) => {
  const total = active + completed;
  const activePct = total > 0 ? (active / total) * 100 : 0;
  const completedPct = total > 0 ? (completed / total) * 100 : 0;
  const overduePct = total > 0 ? (overdue / total) * 100 : 0;

  return (
    <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LuTrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold text-content">Task Distribution</h3>
        </div>
        <span className="text-[11px] font-medium text-content-muted">{total} Total Tracked</span>
      </div>

      {/* Segmented Bar */}
      <div className="h-3 w-full rounded-full bg-surface-muted overflow-hidden flex shadow-inner">
        {completedPct > 0 && (
          <div
            style={{ width: `${completedPct}%` }}
            className="bg-emerald-500 transition-all duration-500"
            title={`Completed: ${completed} (${Math.round(completedPct)}%)`}
          />
        )}
        {activePct > 0 && (
          <div
            style={{ width: `${activePct}%` }}
            className="bg-blue-500 transition-all duration-500"
            title={`Active: ${active} (${Math.round(activePct)}%)`}
          />
        )}
        {overduePct > 0 && (
          <div
            style={{ width: `${overduePct}%` }}
            className="bg-rose-500 transition-all duration-500"
            title={`Overdue: ${overdue} (${Math.round(overduePct)}%)`}
          />
        )}
      </div>

      {/* Breakdown Pills */}
      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-content-muted">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Completed: <strong className="text-content">{completed}</strong></span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-content-muted">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span>In Progress: <strong className="text-content">{active}</strong></span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-content-muted">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Due Today: <strong className="text-content">{dueToday}</strong></span>
        </span>
        {overdue > 0 && (
          <span className="inline-flex items-center gap-1.5 text-rose-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Overdue: <strong>{overdue}</strong></span>
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * 7-Day Mini Activity Histogram
 */
export const WeeklyActivityMiniBar = ({ week = [], calendarItemsByDay = new Map() }) => {
  const counts = week.map((day) => (calendarItemsByDay.get(day.key) || []).length);
  const maxCount = Math.max(1, ...counts);

  return (
    <div className="flex items-end gap-1.5 h-12 pt-2 px-1">
      {week.map((day, idx) => {
        const count = counts[idx];
        const heightPct = Math.max(15, Math.round((count / maxCount) * 100));

        return (
          <div
            key={day.key}
            className="flex-1 flex flex-col items-center gap-1 group relative cursor-pointer"
          >
            {/* Tooltip */}
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 px-1.5 py-0.5 rounded bg-gray-900 text-white text-[10px] whitespace-nowrap shadow">
              {count} {count === 1 ? 'item' : 'items'}
            </div>
            {/* Bar */}
            <div className="w-full flex items-end justify-center h-8">
              <div
                style={{ height: `${heightPct}%` }}
                className={`w-full max-w-[12px] rounded-t-sm transition-all duration-300 ${
                  day.isToday
                    ? 'bg-primary shadow-xs'
                    : count > 0
                    ? 'bg-blue-300 dark:bg-blue-700 hover:bg-blue-400'
                    : 'bg-border/60 hover:bg-border'
                }`}
              />
            </div>
            {/* Day letter */}
            <span className={`text-[9px] font-semibold ${day.isToday ? 'text-primary font-bold' : 'text-content-muted'}`}>
              {day.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
            </span>
          </div>
        );
      })}
    </div>
  );
};
