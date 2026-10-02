import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuLayoutGrid, LuList, LuCircleCheck } from 'react-icons/lu';

const PRIORITY_DOT = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-amber-500',
  MEDIUM: 'bg-blue-500',
  LOW: 'bg-zinc-400',
};

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

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

  const dateRangeLabel = week.length >= 7
    ? `${SHORT_DATE_FORMAT.format(week[0].date)} - ${SHORT_DATE_FORMAT.format(week[6].date)}`
    : '';

  return (
    <div className="bg-surface border border-border rounded-lg p-4 shadow-xs flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-content uppercase tracking-wider">
              7-Day Timeline
            </h3>
            <span className="text-[11px] text-content-muted font-normal">
              • {totalItemsCount} deadline{totalItemsCount !== 1 ? 's' : ''} scheduled
            </span>
          </div>

          <div className="flex items-center gap-2">
            {dateRangeLabel && (
              <span className="px-2 py-0.5 bg-surface-muted text-content font-medium text-[11px] rounded border border-border/60">
                {dateRangeLabel}
              </span>
            )}
            <div className="flex items-center rounded border border-border bg-surface-muted p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-surface text-primary shadow-2xs'
                    : 'text-content-muted hover:text-content'
                }`}
                title="Grid Timeline"
              >
                <LuLayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('agenda')}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'agenda'
                    ? 'bg-surface text-primary shadow-2xs'
                    : 'text-content-muted hover:text-content'
                }`}
                title="Agenda View"
              >
                <LuList className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Grid Timeline Strip (Linear / Notion Style) */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-7 gap-1 mt-3">
            {week.map((day) => {
              const items = calendarItemsByDay.get(day.key) || [];
              const dayName = day.date.toLocaleDateString('en-US', { weekday: 'short' });
              const dayNumber = day.date.getDate();

              return (
                <div
                  key={day.key}
                  className={`p-2 rounded border flex flex-col min-h-[96px] transition-colors ${
                    day.isToday
                      ? 'border-border/90 bg-surface-muted/80 shadow-2xs'
                      : 'border-border/60 bg-surface hover:bg-surface-muted/30'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span
                      className={`font-semibold ${
                        day.isToday ? 'text-primary' : 'text-content'
                      }`}
                    >
                      {dayNumber}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-medium ${
                        day.isToday ? 'text-primary' : 'text-content-muted'
                      }`}
                    >
                      {dayName}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 flex-1">
                    {items.slice(0, 2).map((item) => {
                      const isTask = item.type === 'TASK';
                      const href = isTask
                        ? taskHref(item.projectId, item.id)
                        : milestoneHref(item.projectId);
                      const dotColor = isTask
                        ? (PRIORITY_DOT[item.priorityCode] || 'bg-blue-500')
                        : 'bg-purple-500';

                      return (
                        <Link
                          key={`${item.type}-${item.id}`}
                          to={href}
                          className="block p-1.5 rounded bg-surface border border-border/80 text-[10px] space-y-0.5 shadow-2xs hover:border-border transition-colors group"
                          title={`${item.title} (${item.projectName})`}
                        >
                          <div className="flex items-center gap-1 font-medium text-content group-hover:text-primary truncate">
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
                            <span className="truncate">{item.title}</span>
                          </div>
                          <div className="text-[9px] text-content-muted truncate pl-2.5">
                            {item.projectName}
                          </div>
                        </Link>
                      );
                    })}

                    {items.length > 2 && (
                      <p className="text-[9px] font-medium text-content-muted px-1 pt-0.5">
                        +{items.length - 2} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Agenda View */}
        {viewMode === 'agenda' && (
          <div className="mt-3 space-y-2 max-h-52 overflow-y-auto pr-1">
            {totalItemsCount === 0 ? (
              <div className="py-6 text-center space-y-1 text-content-muted">
                <LuCircleCheck className="w-6 h-6 text-emerald-500 mx-auto opacity-80" />
                <p className="text-xs font-semibold text-content">No deadlines scheduled</p>
                <p className="text-[11px]">All milestones and tasks are clear for the next 7 days.</p>
              </div>
            ) : (
              week.map((day) => {
                const items = calendarItemsByDay.get(day.key) || [];
                if (items.length === 0) return null;
                const fullDayLabel = day.date.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                });

                return (
                  <div key={day.key} className="space-y-1">
                    <div className="text-[10px] font-semibold text-content-muted uppercase tracking-wider">
                      {fullDayLabel} {day.isToday && '(Today)'}
                    </div>
                    {items.map((item) => {
                      const isTask = item.type === 'TASK';
                      const href = isTask
                        ? taskHref(item.projectId, item.id)
                        : milestoneHref(item.projectId);
                      const dotColor = isTask
                        ? (PRIORITY_DOT[item.priorityCode] || 'bg-blue-500')
                        : 'bg-purple-500';

                      return (
                        <Link
                          key={`${item.type}-${item.id}`}
                          to={href}
                          className="flex items-center justify-between p-2 rounded bg-surface-muted/50 hover:bg-surface-muted border border-border/60 transition-colors text-xs group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                            <span className="font-medium text-content group-hover:text-primary truncate">
                              {item.title}
                            </span>
                          </div>
                          <span className="text-[11px] text-content-muted shrink-0 ml-2">
                            {item.projectName}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="pt-2.5 mt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-content-muted">
        <span>Read-only sync with projects &amp; calendar</span>
        <Link to="/tasks/my" className="text-content hover:text-primary font-medium transition-colors">
          Full Schedule →
        </Link>
      </div>
    </div>
  );
};
