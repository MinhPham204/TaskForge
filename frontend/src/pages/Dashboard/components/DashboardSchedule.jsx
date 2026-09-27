import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LuCalendarDays,
  LuLayoutGrid,
  LuList,
  LuFlag,
  LuListTodo,
  LuArrowRight,
  LuCircleCheck,
} from 'react-icons/lu';

const PRIORITY_DOT = {
  URGENT: 'bg-rose-500',
  HIGH: 'bg-amber-500',
  MEDIUM: 'bg-blue-500',
  LOW: 'bg-slate-400',
};

const PRIORITY_BADGE = {
  URGENT: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
  HIGH: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  LOW: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800',
};

export const DashboardSchedule = ({
  week = [],
  calendarItemsByDay = new Map(),
  totalItemsCount = 0,
}) => {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'agenda'

  const taskHref = (projectId, taskId) =>
    `/projects/${projectId}?tab=tasks&task=${taskId}`;
  const milestoneHref = (projectId) =>
    `/projects/${projectId}?tab=milestones`;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-xs space-y-4">
      {/* Header with Title & View Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <LuCalendarDays className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-content">7-Day Work Schedule</h2>
              <p className="text-xs text-content-muted">
                Read-only timeline of upcoming tasks & milestone deadlines
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-medium text-content-muted hidden sm:inline">
            {totalItemsCount} scheduled
          </span>
          <div className="flex items-center rounded-lg border border-border bg-surface-muted p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-surface text-primary shadow-xs font-semibold'
                  : 'text-content-muted hover:text-content'
              }`}
              title="7-Day Grid View"
            >
              <LuLayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'agenda'
                  ? 'bg-surface text-primary shadow-xs font-semibold'
                  : 'text-content-muted hover:text-content'
              }`}
              title="Timeline Agenda View"
            >
              <LuList className="w-3.5 h-3.5" />
              <span>Agenda</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid View - Clean Minimalist SaaS Grid */}
      {viewMode === 'grid' && (
        <div className="border border-border rounded-xl overflow-hidden bg-surface divide-y sm:divide-y-0 sm:grid sm:grid-cols-2 lg:grid-cols-7 sm:divide-x divide-border/60">
          {week.map((day) => {
            const items = calendarItemsByDay.get(day.key) || [];
            const dayName = day.date.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNumber = day.date.getDate();

            return (
              <div
                key={day.key}
                className={`flex flex-col min-h-[160px] p-3 transition-colors ${
                  day.isToday ? 'bg-primary/[0.03]' : 'bg-transparent'
                }`}
              >
                {/* Day Header - Minimalist, no Today badge */}
                <div className="flex items-baseline justify-between pb-2 mb-2 border-b border-border/40">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`text-sm ${
                        day.isToday ? 'font-bold text-primary' : 'font-semibold text-content'
                      }`}
                    >
                      {dayNumber}
                    </span>
                    <span
                      className={`text-[11px] uppercase tracking-wider ${
                        day.isToday ? 'font-semibold text-primary' : 'text-content-muted'
                      }`}
                    >
                      {dayName}
                    </span>
                  </div>
                  {items.length > 0 && (
                    <span className="text-[11px] font-mono text-content-muted">
                      {items.length}
                    </span>
                  )}
                </div>

                {/* Day Items - Clean rows with discrete priority dots */}
                <div className="flex-1 space-y-1.5">
                  {items.slice(0, 3).map((item) => {
                    const isTask = item.type === 'TASK';
                    const href = isTask
                      ? taskHref(item.projectId, item.id)
                      : milestoneHref(item.projectId);
                    const dotColor = isTask
                      ? (PRIORITY_DOT[item.priorityCode] || 'bg-slate-400')
                      : 'bg-purple-500';

                    return (
                      <Link
                        key={`${item.type}-${item.id}`}
                        to={href}
                        className="group flex items-start gap-2 p-2 rounded-lg bg-surface-muted/40 hover:bg-surface-muted border border-border/40 hover:border-border transition-colors text-left"
                        title={`${item.title} (${item.projectName})`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${dotColor}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-content group-hover:text-primary truncate leading-snug">
                            {item.title}
                          </p>
                          <p className="text-[10px] text-content-muted truncate mt-0.5">
                            {item.projectName}
                          </p>
                        </div>
                      </Link>
                    );
                  })}

                  {items.length > 3 && (
                    <p className="text-[10px] font-medium text-content-muted hover:text-primary px-1 pt-0.5">
                      +{items.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agenda Timeline View */}
      {viewMode === 'agenda' && (
        <div className="space-y-3">
          {totalItemsCount === 0 ? (
            <div className="p-8 text-center space-y-2">
              <LuCircleCheck className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
              <p className="text-sm font-semibold text-content">No deadlines this week</p>
              <p className="text-xs text-content-muted">
                You have no visible tasks or milestones due in the next 7 days.
              </p>
            </div>
          ) : (
            week.map((day) => {
              const items = calendarItemsByDay.get(day.key) || [];
              if (items.length === 0) return null;

              const fullDayLabel = day.date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              });

              return (
                <div key={day.key} className="space-y-1.5">
                  <div className="flex items-center gap-2 pt-1">
                    <span
                      className={`text-xs font-bold ${
                        day.isToday ? 'text-primary' : 'text-content'
                      }`}
                    >
                      {fullDayLabel}
                    </span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>

                  <div className="space-y-1.5 pl-2">
                    {items.map((item) => {
                      const isTask = item.type === 'TASK';
                      const href = isTask
                        ? taskHref(item.projectId, item.id)
                        : milestoneHref(item.projectId);
                      const badgeClass =
                        PRIORITY_BADGE[item.priorityCode] ||
                        'bg-surface-muted text-content-muted border-border';

                      return (
                        <Link
                          key={`${item.type}-${item.id}`}
                          to={href}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface hover:bg-surface-muted hover:border-primary/40 transition-colors group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                isTask
                                  ? 'bg-blue-50 text-primary dark:bg-blue-950/50'
                                  : 'bg-purple-50 text-purple-600 dark:bg-purple-950/50'
                              }`}
                            >
                              {isTask ? (
                                <LuListTodo className="w-4 h-4" />
                              ) : (
                                <LuFlag className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-content group-hover:text-primary truncate">
                                {item.title}
                              </p>
                              <p className="text-[11px] text-content-muted truncate mt-0.5">
                                {item.projectName} · {item.statusCode || (isTask ? 'Task' : 'Milestone')}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {item.priorityCode && (
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase ${badgeClass}`}
                              >
                                {item.priorityCode}
                              </span>
                            )}
                            <LuArrowRight className="w-4 h-4 text-content-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
