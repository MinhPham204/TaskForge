import React from 'react';

/**
 * CustomTooltip - Reusable floating tooltip matching the TaskForge design tokens
 * and the user's legacy chart tooltip layout.
 */
const CustomTooltip = ({ active, title, value, color, unit, x = 0, y = 0 }) => {
  if (!active || value === undefined || value === null) {
    return null;
  }

  return (
    <div
      className="absolute pointer-events-none z-30 transform -translate-x-1/2 -translate-y-full transition-all duration-100 ease-out"
      style={{ left: `${x}px`, top: `${y - 10}px` }}
    >
      <div className="bg-surface/95 backdrop-blur-md border border-border shadow-xl rounded-xl p-3 min-w-[120px] text-left">
        <div className="flex items-center gap-1.5 mb-1">
          {color && (
            <span
              className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-sm"
              style={{ backgroundColor: color }}
            />
          )}
          <p className="text-xs font-semibold text-content tracking-wide truncate">
            {title}
          </p>
        </div>
        <p className="text-xs text-content-muted flex items-baseline gap-1">
          <span>Count:</span>
          <span className="text-sm font-bold text-content">{value}</span>
          {unit ? <span className="text-[11px] text-content-muted">({unit})</span> : null}
        </p>
      </div>
    </div>
  );
};

export default CustomTooltip;
export { CustomTooltip };
