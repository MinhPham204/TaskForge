import React from 'react';
import { LuTriangleAlert, LuCircleCheck, LuClock, LuCircleAlert } from 'react-icons/lu';

/**
 * PriorityBars - Linear / Craft style cellular signal bars
 * 1 bar for Low, 2 bars for Medium, 3 bars for High, Alert icon for Urgent.
 */
export const PriorityBars = ({
  priority = 'MEDIUM',
  showLabel = true,
  className = '',
}) => {
  const p = String(priority || 'MEDIUM').toUpperCase();

  if (p === 'URGENT') {
    return (
      <span
        className={`inline-flex items-center gap-1 text-red-500 dark:text-red-400 font-medium ${className}`.trim()}
        title="Urgent Priority"
      >
        <LuTriangleAlert className="w-3 h-3 text-red-500 shrink-0" aria-hidden="true" />
        {showLabel && <span className="hidden sm:inline text-[11px]">Urgent</span>}
      </span>
    );
  }

  if (p === 'HIGH') {
    return (
      <span
        className={`inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium ${className}`.trim()}
        title="High Priority"
      >
        <span className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
          <span className="w-0.5 h-1.5 bg-amber-500 rounded-xs" />
          <span className="w-0.5 h-2.5 bg-amber-500 rounded-xs" />
          <span className="w-0.5 h-3.5 bg-amber-500 rounded-xs" />
        </span>
        {showLabel && <span className="hidden sm:inline text-[11px]">High</span>}
      </span>
    );
  }

  if (p === 'LOW') {
    return (
      <span
        className={`inline-flex items-center gap-1 text-content-muted font-medium ${className}`.trim()}
        title="Low Priority"
      >
        <span className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
          <span className="w-0.5 h-1.5 bg-content-muted/70 rounded-xs" />
          <span className="w-0.5 h-2.5 bg-border rounded-xs" />
          <span className="w-0.5 h-3.5 bg-border rounded-xs" />
        </span>
        {showLabel && <span className="hidden sm:inline text-[11px]">Low</span>}
      </span>
    );
  }

  // MEDIUM (Default)
  return (
    <span
      className={`inline-flex items-center gap-1 text-content-muted font-medium ${className}`.trim()}
      title="Medium Priority"
    >
      <span className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
        <span className="w-0.5 h-1.5 bg-content-muted/70 rounded-xs" />
        <span className="w-0.5 h-2.5 bg-content-muted/70 rounded-xs" />
        <span className="w-0.5 h-3.5 bg-border rounded-xs" />
      </span>
      {showLabel && <span className="hidden sm:inline text-[11px]">Medium</span>}
    </span>
  );
};

/**
 * LinearStatusIcon - Discrete status indicator icon
 */
export const LinearStatusIcon = ({ category, status, className = '' }) => {
  const cat = String(category || status || '').toUpperCase();

  if (cat === 'COMPLETED') {
    return <LuCircleCheck className={`w-3.5 h-3.5 text-emerald-500 shrink-0 ${className}`.trim()} aria-label="Completed" />;
  }

  if (cat === 'IN_PROGRESS') {
    return <LuClock className={`w-3.5 h-3.5 text-blue-500 shrink-0 ${className}`.trim()} aria-label="In Progress" />;
  }

  if (cat === 'REVIEW' || cat === 'IN_REVIEW') {
    return <LuCircleAlert className={`w-3.5 h-3.5 text-purple-500 shrink-0 ${className}`.trim()} aria-label="In Review" />;
  }

  // NOT_STARTED / TODO / CANCELLED
  return (
    <span
      className={`w-3.5 h-3.5 rounded-full border border-dashed border-content-muted/60 shrink-0 ${className}`.trim()}
      aria-label="To Do"
    />
  );
};

export default PriorityBars;
