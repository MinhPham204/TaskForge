import React from 'react';

/**
 * CustomLegend - Minimalist centered legend with colored circular dots
 * matching the legacy design and TaskForge semantic theme tokens.
 */
const CustomLegend = ({
  payload = [],
  onItemHover,
  onItemLeave,
  activeIndex = null,
}) => {
  if (!payload || payload.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center items-center gap-x-5 gap-y-2 mt-4 px-2">
      {payload.map((entry, index) => {
        const isHovered = activeIndex === index;
        const isMuted = activeIndex !== null && !isHovered;
        const label = entry.name || entry.value || entry.status || entry.priority;

        return (
          <div
            key={`legend-${index}`}
            onMouseEnter={() => onItemHover && onItemHover(index, entry)}
            onMouseLeave={() => onItemLeave && onItemLeave()}
            className={`flex items-center space-x-2 transition-all duration-150 cursor-pointer select-none ${
              isMuted ? 'opacity-35 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform shadow-xs"
              style={{
                backgroundColor: entry.color,
                boxShadow: isHovered
                  ? `0 0 0 2px var(--color-surface, #fff), 0 0 0 4px ${entry.color}`
                  : 'none',
              }}
            />
            <span className="text-xs text-content font-medium">
              {label}
            </span>
            {entry.count !== undefined && (
              <span className="text-[11px] text-content-muted font-mono font-medium">
                ({entry.count})
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CustomLegend;
export { CustomLegend };
