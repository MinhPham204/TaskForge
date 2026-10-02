import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Priority Distribution Card (Linear/Stripe Craft Style)
 * Renders a sleek segmented horizontal bar and 4 compact metric boxes.
 */
export const PriorityDistributionCard = ({
  tasks = [],
  focus,
}) => {
  const counts = {
    Urgent: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };

  if (tasks.length > 0) {
    for (const t of tasks) {
      const p = String(t.priorityCode || '').toUpperCase();
      if (p === 'URGENT') counts.Urgent++;
      else if (p === 'HIGH') counts.High++;
      else if (p === 'LOW') counts.Low++;
      else counts.Medium++;
    }
  } else if (focus && focus.total > 0) {
    counts.Urgent = focus.overdue || 0;
    counts.High = focus.dueToday || 0;
    counts.Medium = focus.upcoming || 0;
    counts.Low = Math.max(0, focus.total - counts.Urgent - counts.High - counts.Medium);
  }

  const total = counts.Urgent + counts.High + counts.Medium + counts.Low;
  const urgentPct = total > 0 ? (counts.Urgent / total) * 100 : 0;
  const highPct = total > 0 ? (counts.High / total) * 100 : 0;
  const mediumPct = total > 0 ? (counts.Medium / total) * 100 : 0;
  const lowPct = total > 0 ? (counts.Low / total) * 100 : 0;

  const immediateAttentionCount = counts.Urgent + counts.High;

  return (
    <div className="bg-surface border border-border rounded-lg p-4 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div>
            <h3 className="text-xs font-semibold text-content uppercase tracking-wider">
              Priority Distribution
            </h3>
            <p className="text-[11px] text-content-muted">Active workload breakdown</p>
          </div>
          <span className="text-xs font-mono text-content-muted">{total} tasks</span>
        </div>

        {/* Sleek Segmented Bar */}
        <div className="mt-4">
          <div className="h-2 w-full bg-surface-muted rounded-full overflow-hidden flex gap-0.5">
            {urgentPct > 0 && (
              <div
                style={{ width: `${urgentPct}%` }}
                className="bg-red-500 h-full rounded-xs transition-all duration-500"
                title={`Urgent: ${counts.Urgent}`}
              />
            )}
            {highPct > 0 && (
              <div
                style={{ width: `${highPct}%` }}
                className="bg-amber-500 h-full rounded-xs transition-all duration-500"
                title={`High: ${counts.High}`}
              />
            )}
            {mediumPct > 0 && (
              <div
                style={{ width: `${mediumPct}%` }}
                className="bg-blue-500 h-full rounded-xs transition-all duration-500"
                title={`Medium: ${counts.Medium}`}
              />
            )}
            {lowPct > 0 && (
              <div
                style={{ width: `${lowPct}%` }}
                className="bg-zinc-400 dark:bg-zinc-600 h-full rounded-xs transition-all duration-500"
                title={`Low: ${counts.Low}`}
              />
            )}
            {total === 0 && (
              <div className="w-full bg-border h-full rounded-xs" />
            )}
          </div>

          {/* Refined Linear-style Priority rows */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-xs">
            <div className="p-2 rounded bg-surface-muted/60 border border-border flex flex-col">
              <div className="flex items-center gap-1.5 text-[11px] text-content-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span>Urgent</span>
              </div>
              <span className="text-sm font-semibold text-content mt-1">{counts.Urgent}</span>
            </div>

            <div className="p-2 rounded bg-surface-muted/60 border border-border flex flex-col">
              <div className="flex items-center gap-1.5 text-[11px] text-content-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>High</span>
              </div>
              <span className="text-sm font-semibold text-content mt-1">{counts.High}</span>
            </div>

            <div className="p-2 rounded bg-surface-muted/60 border border-border flex flex-col">
              <div className="flex items-center gap-1.5 text-[11px] text-content-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span>Medium</span>
              </div>
              <span className="text-sm font-semibold text-content mt-1">{counts.Medium}</span>
            </div>

            <div className="p-2 rounded bg-surface-muted/60 border border-border flex flex-col">
              <div className="flex items-center gap-1.5 text-[11px] text-content-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 shrink-0" />
                <span>Low</span>
              </div>
              <span className="text-sm font-semibold text-content mt-1">{counts.Low}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-3 mt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-content-muted">
        <span>
          {immediateAttentionCount > 0
            ? `${immediateAttentionCount} task${immediateAttentionCount > 1 ? 's' : ''} require immediate attention`
            : 'All workloads on schedule'}
        </span>
        <Link to="/tasks/my" className="text-content hover:text-primary font-medium transition-colors">
          Filter urgent →
        </Link>
      </div>
    </div>
  );
};

/**
 * Workflow Stages Card (Linear/Stripe Craft Style)
 * Renders an SVG Donut chart (% Done) and a 2x2 grid of lifecycle stages.
 */
export const WorkflowStagesCard = ({
  tasks = [],
  focus,
  completionPercentage = 0,
}) => {
  const counts = {
    Done: 0,
    InReview: 0,
    InProgress: 0,
    ToDo: 0,
  };

  if (tasks.length > 0) {
    for (const t of tasks) {
      const cat = String(t.semanticCategory || '').toUpperCase();
      if (cat === 'COMPLETED') counts.Done++;
      else if (cat === 'IN_REVIEW' || cat === 'REVIEW') counts.InReview++;
      else if (cat === 'IN_PROGRESS') counts.InProgress++;
      else counts.ToDo++;
    }
  } else if (focus) {
    counts.Done = focus.completed || 0;
    counts.InProgress = focus.active || 0;
    counts.InReview = 0;
    counts.ToDo = Math.max(0, (focus.total || 0) - counts.Done - counts.InProgress);
  }

  const effectiveTotal = counts.Done + counts.InReview + counts.InProgress + counts.ToDo;
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76

  // SVG segments calculation
  const getStrokeDash = (count) => {
    if (effectiveTotal === 0 || count === 0) return `0 ${circumference}`;
    const len = (count / effectiveTotal) * circumference;
    return `${len} ${circumference - len}`;
  };

  const doneLen = effectiveTotal > 0 ? (counts.Done / effectiveTotal) * circumference : 0;
  const reviewLen = effectiveTotal > 0 ? (counts.InReview / effectiveTotal) * circumference : 0;
  const inProgressLen = effectiveTotal > 0 ? (counts.InProgress / effectiveTotal) * circumference : 0;

  return (
    <div className="bg-surface border border-border rounded-lg p-4 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div>
            <h3 className="text-xs font-semibold text-content uppercase tracking-wider">
              Workflow Stages
            </h3>
            <p className="text-[11px] text-content-muted">Task lifecycle velocity</p>
          </div>
          <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium">
            {completionPercentage}% complete
          </span>
        </div>

        {/* Donut and Grid */}
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-5">
          {/* Donut Graphic */}
          <div className="relative flex items-center justify-center shrink-0">
            <svg className="w-24 h-24 -rotate-90 transform" viewBox="0 0 100 100">
              {/* Background Circle */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                className="stroke-surface-muted"
                stroke="currentColor"
                strokeWidth="6"
              />
              {/* Done (Emerald) */}
              {counts.Done > 0 && (
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke="#10b981"
                  strokeWidth="6"
                  strokeDasharray={getStrokeDash(counts.Done)}
                  strokeDashoffset={0}
                  strokeLinecap="round"
                />
              )}
              {/* In Review (Purple) */}
              {counts.InReview > 0 && (
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke="#a855f7"
                  strokeWidth="6"
                  strokeDasharray={getStrokeDash(counts.InReview)}
                  strokeDashoffset={-doneLen}
                  strokeLinecap="round"
                />
              )}
              {/* In Progress (Blue) */}
              {counts.InProgress > 0 && (
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke="#3b82f6"
                  strokeWidth="6"
                  strokeDasharray={getStrokeDash(counts.InProgress)}
                  strokeDashoffset={-(doneLen + reviewLen)}
                  strokeLinecap="round"
                />
              )}
              {/* To Do (Zinc) */}
              {counts.ToDo > 0 && (
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke="#94a3b8"
                  strokeWidth="6"
                  strokeDasharray={getStrokeDash(counts.ToDo)}
                  strokeDashoffset={-(doneLen + reviewLen + inProgressLen)}
                  strokeLinecap="round"
                />
              )}
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center select-none pointer-events-none">
              <span className="text-xs font-semibold text-content tracking-tight">
                {completionPercentage}%
              </span>
              <span className="text-[9px] font-medium text-content-muted uppercase tracking-wider">
                Done
              </span>
            </div>
          </div>

          {/* 2x2 Stages Grid */}
          <div className="grid grid-cols-2 gap-2 flex-1 w-full text-xs">
            <div className="p-2 rounded bg-surface-muted/60 border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[11px] text-content truncate">Done</span>
              </div>
              <span className="text-xs font-semibold text-content font-mono ml-2">
                {counts.Done}
              </span>
            </div>

            <div className="p-2 rounded bg-surface-muted/60 border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                <span className="text-[11px] text-content truncate">In Review</span>
              </div>
              <span className="text-xs font-semibold text-content font-mono ml-2">
                {counts.InReview}
              </span>
            </div>

            <div className="p-2 rounded bg-surface-muted/60 border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span className="text-[11px] text-content truncate">In Progress</span>
              </div>
              <span className="text-xs font-semibold text-content font-mono ml-2">
                {counts.InProgress}
              </span>
            </div>

            <div className="p-2 rounded bg-surface-muted/60 border border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 shrink-0" />
                <span className="text-[11px] text-content truncate">To Do</span>
              </div>
              <span className="text-xs font-semibold text-content font-mono ml-2">
                {counts.ToDo}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-3 mt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-content-muted">
        <span>{counts.Done} of {effectiveTotal} tasks completed</span>
        <Link to="/tasks/my" className="text-content hover:text-primary font-medium transition-colors">
          View all tasks →
        </Link>
      </div>
    </div>
  );
};
