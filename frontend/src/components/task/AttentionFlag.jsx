import React from 'react';
import {
  LuBan,
  LuClock,
  LuShieldAlert,
  LuTriangleAlert,
} from 'react-icons/lu';
import {
  getTaskAttentionFlag,
  ATTENTION_TYPES,
  ATTENTION_STYLES,
} from '../../utils/taskAttention.js';

const FLAG_ICONS = {
  [ATTENTION_TYPES.BLOCKED]: LuBan,
  [ATTENTION_TYPES.OVERDUE]: LuClock,
  [ATTENTION_TYPES.NEEDS_APPROVAL]: LuShieldAlert,
  [ATTENTION_TYPES.URGENT]: LuTriangleAlert,
};

/**
 * AttentionFlag - Semantic Micro-Component
 * The single, prominent badge reserved strictly for tasks requiring urgent intervention.
 * 
 * Precedence rule: Blocked -> Overdue -> Needs Approval -> Urgent.
 * If a task does not require urgent attention, this component renders null (zero badge noise).
 *
 * @param {Object} props
 * @param {Object} [props.task] - Task object to automatically evaluate
 * @param {Object} [props.flag] - Explicit flag object { type, label, tone, className }
 * @param {Date} [props.referenceDate] - Custom reference date for overdue calculation (default: now)
 * @param {boolean} [props.includeOverdue=false] - Whether to render Overdue badges (default false to prevent badge noise)
 * @param {'sm'|'md'} [props.size='sm'] - Badge size
 * @param {string} [props.className] - Additional classes
 */
export const AttentionFlag = ({
  task,
  flag: explicitFlag,
  referenceDate,
  includeOverdue = false,
  size = 'sm',
  className = '',
}) => {
  const flag =
    explicitFlag ||
    (task ? getTaskAttentionFlag(task, referenceDate, { includeOverdue }) : null);

  if (!flag) return null;
  if (!includeOverdue && flag.type === ATTENTION_TYPES.OVERDUE) return null;

  const IconComponent = FLAG_ICONS[flag.type] || LuTriangleAlert;
  const toneClass = flag.className || ATTENTION_STYLES[flag.tone] || ATTENTION_STYLES.danger;
  const sizeClass = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-md border shrink-0 ${toneClass} ${sizeClass} ${className}`.trim()}
      title={`Action Required: ${flag.label}`}
    >
      <IconComponent className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{flag.label}</span>
    </span>
  );
};

export default AttentionFlag;
