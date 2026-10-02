import React from 'react';
import { LuFlame, LuArrowUp, LuMinus, LuArrowDown } from 'react-icons/lu';

export const PRIORITY_CONFIG = {
  LOW: {
    label: 'Low',
    icon: LuArrowDown,
    style: 'text-content-muted',
    activeStyle: 'text-content-muted',
  },
  MEDIUM: {
    label: 'Medium',
    icon: LuMinus,
    style: 'text-content-muted',
    activeStyle: 'text-content-muted',
  },
  HIGH: {
    label: 'High',
    icon: LuArrowUp,
    style: 'text-content-muted',
    activeStyle: 'text-amber-600 dark:text-amber-400 font-medium',
  },
  URGENT: {
    label: 'Urgent',
    icon: LuFlame,
    style: 'text-content-muted',
    activeStyle: 'text-rose-600 dark:text-rose-400 font-semibold',
  },
};

/**
 * PriorityText - Semantic Micro-Component
 * Displays priority with subtle icon and text.
 * Strictly avoids loud pill backgrounds.
 * Only applies urgent alert color if priority is URGENT and the task is NOT completed/cancelled.
 *
 * @param {Object} props
 * @param {string} props.priority - Priority code (LOW, MEDIUM, HIGH, URGENT)
 * @param {string} [props.semanticCategory] - Semantic category of task (COMPLETED, CANCELLED, etc.)
 * @param {boolean} [props.isCompleted] - Optional explicit completion flag
 * @param {boolean} [props.showIcon=true] - Whether to render priority directional icon
 * @param {string} [props.className] - Additional styling classes
 */
export const PriorityText = ({
  priority = 'MEDIUM',
  semanticCategory,
  isCompleted,
  showIcon = true,
  className = '',
}) => {
  const normalizedPriority = String(priority || 'MEDIUM').toUpperCase();
  const config = PRIORITY_CONFIG[normalizedPriority] || PRIORITY_CONFIG.MEDIUM;
  const IconComponent = config.icon;

  const normalizedCategory = String(semanticCategory || '').toUpperCase();
  const isTerminal =
    isCompleted === true ||
    normalizedCategory === 'COMPLETED' ||
    normalizedCategory === 'CANCELLED';

  // Alert colors only apply when task is active (non-terminal)
  const priorityStyle = isTerminal ? config.style : config.activeStyle;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${priorityStyle} ${className}`.trim()}
      title={`Priority: ${config.label}${isTerminal ? ' (Resolved)' : ''}`}
    >
      {showIcon && <IconComponent className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      <span>{config.label}</span>
    </span>
  );
};

export default PriorityText;
