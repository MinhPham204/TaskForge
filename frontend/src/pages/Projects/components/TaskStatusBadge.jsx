import React from 'react';
import {
  SEMANTIC_CATEGORY_STYLES,
  PRIORITY_STYLES,
  APPROVAL_STATE_STYLES,
} from './taskStyles.js';

export const TaskStatusBadge = ({ category, label }) => {
  const classes =
    SEMANTIC_CATEGORY_STYLES[category] || 'bg-gray-100 text-gray-700 border-gray-200';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${classes}`}
    >
      {label || category}
    </span>
  );
};

export const PriorityBadge = ({ priority }) => {
  const code = (priority || 'MEDIUM').toUpperCase();
  const classes = PRIORITY_STYLES[code] || PRIORITY_STYLES.MEDIUM;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-md border ${classes}`}
    >
      {code}
    </span>
  );
};

export const ApprovalStateBadge = ({ state }) => {
  const code = (state || 'PENDING').toUpperCase();
  const classes = APPROVAL_STATE_STYLES[code] || APPROVAL_STATE_STYLES.PENDING;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${classes}`}
    >
      {code}
    </span>
  );
};

export default TaskStatusBadge;
