import React from 'react';

/**
 * CountText - Semantic Micro-Component
 * Displays item/task counters as neutral typography next to headers or tab titles.
 * Replaces high-contrast colored round pills to eliminate badge clutter.
 *
 * @param {Object} props
 * @param {number|string} props.count - Number of items
 * @param {string} [props.label] - Optional label (e.g. 'tasks', 'open')
 * @param {'parenthesis'|'bullet'|'bracket'|'bare'} [props.variant='parenthesis'] - Formatting style
 * @param {string} [props.className] - Additional classes
 */
export const CountText = ({
  count,
  label,
  variant = 'parenthesis',
  className = '',
}) => {
  if (count === undefined || count === null) return null;

  const textPart = label ? `${count} ${label}` : String(count);

  let formatted = textPart;
  if (variant === 'parenthesis') {
    formatted = `(${textPart})`;
  } else if (variant === 'bullet') {
    formatted = `· ${textPart}`;
  } else if (variant === 'bracket') {
    formatted = `[${textPart}]`;
  }

  return (
    <span
      className={`text-content-muted font-normal text-xs tracking-normal ${className}`.trim()}
    >
      {formatted}
    </span>
  );
};

export default CountText;
