import React from 'react';

/**
 * Maps semantic category codes to dot indicator colors.
 */
export const STATUS_DOT_COLORS = {
  NOT_STARTED: 'bg-slate-400 dark:bg-slate-500',
  IN_PROGRESS: 'bg-blue-500 dark:bg-blue-400',
  REVIEW: 'bg-purple-500 dark:bg-purple-400',
  COMPLETED: 'bg-emerald-500 dark:bg-emerald-400',
  CANCELLED: 'bg-zinc-400 dark:bg-zinc-500',
};

export const STATUS_DEFAULT_LABELS = {
  NOT_STARTED: 'To Do',
  IN_PROGRESS: 'In Progress',
  REVIEW: 'In Review',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
};

/**
 * StatusText - Semantic Micro-Component
 * Displays task/workflow status with a subtle colored dot and clean text.
 * Replaces colored pill backgrounds to eliminate visual noise.
 *
 * @param {Object} props
 * @param {string} [props.category] - Semantic category (NOT_STARTED, IN_PROGRESS, REVIEW, COMPLETED, CANCELLED)
 * @param {string} [props.label] - Custom display label (e.g. status name)
 * @param {boolean} [props.showDot=true] - Whether to show the colored circle dot
 * @param {'sm'|'md'} [props.size='sm'] - Text size variant
 * @param {string} [props.className] - Additional styling classes
 */
export const StatusText = ({
  category,
  label,
  showDot = true,
  size = 'sm',
  className = '',
}) => {
  const normalizedCategory = String(category || '').toUpperCase();
  const dotColor = STATUS_DOT_COLORS[normalizedCategory] || 'bg-slate-400 dark:bg-slate-500';
  const displayLabel = label || STATUS_DEFAULT_LABELS[normalizedCategory] || category || 'Unknown';

  const sizeClass = size === 'md' ? 'text-sm' : 'text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium text-content ${sizeClass} ${className}`.trim()}
      title={`Status: ${displayLabel}`}
    >
      {showDot && (
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}
          aria-hidden="true"
        />
      )}
      <span>{displayLabel}</span>
    </span>
  );
};

export default StatusText;
