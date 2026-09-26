import React, { useState, useRef, useMemo } from 'react';
import CustomTooltip from './CustomTooltip.jsx';

/**
 * Priority color mapping according to the legacy TaskForge design
 */
const getBarColor = (entry) => {
  const priority = String(entry?.priority || entry?.name || '').toLowerCase();
  switch (priority) {
    case 'urgent':
      return '#E11D48'; // Vibrant rose/crimson
    case 'high':
      return '#FF1F57'; // Vibrant hot pink/red
    case 'medium':
      return '#FE9900'; // Vibrant orange/amber
    case 'low':
      return '#00BC7D'; // Vibrant emerald green
    default:
      return '#00BC7D';
  }
};

function getRoundedTopPath(x, y, w, h, r = 10) {
  if (h <= 0) return '';
  const actualR = Math.min(r, w / 2, h);
  if (actualR <= 0) {
    return `M ${x} ${y + h} L ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} Z`;
  }
  return [
    `M ${x.toFixed(2)} ${(y + h).toFixed(2)}`,
    `L ${x.toFixed(2)} ${(y + actualR).toFixed(2)}`,
    `Q ${x.toFixed(2)} ${y.toFixed(2)} ${(x + actualR).toFixed(2)} ${y.toFixed(2)}`,
    `L ${(x + w - actualR).toFixed(2)} ${y.toFixed(2)}`,
    `Q ${(x + w).toFixed(2)} ${y.toFixed(2)} ${(x + w).toFixed(2)} ${(y + actualR).toFixed(2)}`,
    `L ${(x + w).toFixed(2)} ${(y + h).toFixed(2)}`,
    'Z',
  ].join(' ');
}

/**
 * CustomBarchart - Native SVG Bar chart replicating the legacy Recharts design
 * with priority colors, rounded top bars (radius [10, 10, 0, 0]), clean axes,
 * interactive hover effects, and custom tooltip.
 */
const CustomBarchart = ({ data = [], height = 300 }) => {
  const containerRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const maxCount = useMemo(() => {
    const rawMax = Math.max(...(data || []).map((d) => Number(d.count) || 0), 0);
    if (rawMax <= 2) return 4;
    if (rawMax <= 5) return 6;
    if (rawMax <= 10) return 10;
    return Math.ceil(rawMax * 1.25);
  }, [data]);

  const yTicks = useMemo(() => {
    const steps = 4;
    const ticks = [];
    for (let i = 0; i <= steps; i++) {
      ticks.push(Math.round((maxCount / steps) * i));
    }
    return Array.from(new Set(ticks));
  }, [maxCount]);

  const handleMouseMove = (e, index) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setHoveredIndex(index);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  // Dimensions
  const svgWidth = 440;
  const svgHeight = 250;
  const padding = { top: 25, right: 20, bottom: 35, left: 35 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  const barCount = data.length || 1;
  const slotWidth = chartWidth / barCount;
  const barWidth = Math.min(44, Math.max(28, slotWidth * 0.48));

  const hoveredItem = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full flex flex-col items-center justify-between"
      style={{ minHeight: `${height}px` }}
    >
      {/* Floating Tooltip */}
      {hoveredItem && (
        <CustomTooltip
          active={true}
          title={hoveredItem.priority || hoveredItem.name}
          value={hoveredItem.count}
          color={getBarColor(hoveredItem)}
          x={tooltipPos.x}
          y={tooltipPos.y}
        />
      )}

      {/* SVG Bar Chart Canvas */}
      <div className="w-full flex-1 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <filter id="bar-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.2" />
            </filter>
          </defs>

          {/* Y-Axis Horizontal Grid Lines & Labels */}
          {yTicks.map((val) => {
            const tickY = padding.top + chartHeight - (val / maxCount) * chartHeight;
            return (
              <g key={`ytick-${val}`}>
                <line
                  x1={padding.left}
                  y1={tickY}
                  x2={padding.left + chartWidth}
                  y2={tickY}
                  stroke="currentColor"
                  strokeDasharray="2 3"
                  className="text-border/30"
                />
                <text
                  x={padding.left - 8}
                  y={tickY}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="text-[11px] font-mono fill-content-muted"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((entry, index) => {
            const count = Number(entry.count) || 0;
            const barHeight = (count / maxCount) * chartHeight;
            const barX = padding.left + index * slotWidth + (slotWidth - barWidth) / 2;
            const barY = padding.top + chartHeight - barHeight;
            const color = getBarColor(entry);
            const isHovered = hoveredIndex === index;

            // Background slot track (subtle pillar for visual balance)
            const trackPath = getRoundedTopPath(
              barX,
              padding.top,
              barWidth,
              chartHeight,
              8
            );

            // Active bar path with rounded top corners
            const barPath = getRoundedTopPath(
              barX,
              barY,
              barWidth,
              barHeight,
              10
            );

            return (
              <g
                key={`bar-group-${index}`}
                className="cursor-pointer group"
                onMouseMove={(e) => handleMouseMove(e, index)}
                onMouseLeave={handleMouseLeave}
              >
                {/* Background Track */}
                <path
                  d={trackPath}
                  className="fill-surface-muted/60 transition-colors"
                />

                {/* Animated / Colored Bar */}
                {barHeight > 0 && (
                  <path
                    d={barPath}
                    fill={color}
                    className="transition-all duration-150"
                    style={{
                      filter: isHovered ? 'url(#bar-shadow)' : 'none',
                      opacity: hoveredIndex !== null && !isHovered ? 0.65 : 1,
                      transform: isHovered ? 'scaleY(1.02)' : 'scaleY(1)',
                      transformOrigin: `${barX + barWidth / 2}px ${padding.top + chartHeight}px`,
                    }}
                  />
                )}

                {/* Top Value Pill (when count > 0) */}
                {count > 0 && (
                  <text
                    x={barX + barWidth / 2}
                    y={Math.max(padding.top + 10, barY - 6)}
                    textAnchor="middle"
                    className={`text-[11px] font-bold font-mono transition-colors ${
                      isHovered ? 'fill-content' : 'fill-content-muted'
                    }`}
                  >
                    {count}
                  </text>
                )}

                {/* X-Axis Category Label */}
                <text
                  x={barX + barWidth / 2}
                  y={padding.top + chartHeight + 20}
                  textAnchor="middle"
                  className={`text-xs font-medium transition-colors ${
                    isHovered ? 'fill-content font-semibold' : 'fill-content-muted'
                  }`}
                >
                  {entry.priority || entry.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default CustomBarchart;
export { CustomBarchart };
