import React, { useState, useRef, useMemo } from 'react';
import CustomTooltip from './CustomTooltip.jsx';
import CustomLegend from './CustomLegend.jsx';

const DEFAULT_COLORS = [
  '#3B82F6', // Blue (In Progress)
  '#10B981', // Emerald (Completed)
  '#F59E0B', // Amber (In Review / High)
  '#94A3B8', // Slate (To Do / Backlog)
  '#EF4444', // Red (Overdue / Blocked)
  '#8B5CF6', // Purple
];

function getArcPath(cx, cy, rInner, rOuter, startAngle, endAngle) {
  const isFullCircle = endAngle - startAngle >= 2 * Math.PI - 0.0001;
  const actualEndAngle = isFullCircle ? startAngle + 2 * Math.PI - 0.0001 : endAngle;

  const x1Outer = cx + rOuter * Math.cos(startAngle);
  const y1Outer = cy + rOuter * Math.sin(startAngle);
  const x2Outer = cx + rOuter * Math.cos(actualEndAngle);
  const y2Outer = cy + rOuter * Math.sin(actualEndAngle);

  const x1Inner = cx + rInner * Math.cos(actualEndAngle);
  const y1Inner = cy + rInner * Math.sin(actualEndAngle);
  const x2Inner = cx + rInner * Math.cos(startAngle);
  const y2Inner = cy + rInner * Math.sin(startAngle);

  const largeArcFlag = actualEndAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${x1Outer.toFixed(3)} ${y1Outer.toFixed(3)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${x2Outer.toFixed(3)} ${y2Outer.toFixed(3)}`,
    `L ${x1Inner.toFixed(3)} ${y1Inner.toFixed(3)}`,
    `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${x2Inner.toFixed(3)} ${y2Inner.toFixed(3)}`,
    'Z',
  ].join(' ');
}

/**
 * CustomPieChart - Native SVG Donut chart replicating the legacy Recharts design
 * with hollow center, status breakdown, interactive hover slices, custom tooltip,
 * and circular dot legend. Supports TaskForge semantic design tokens.
 */
const CustomPieChart = ({
  data = [],
  colors = DEFAULT_COLORS,
  title,
  unit = 'Tasks',
  height = 320,
}) => {
  const containerRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const totalCount = useMemo(() => {
    return data.reduce((acc, item) => acc + (Number(item.count) || 0), 0);
  }, [data]);

  const slices = useMemo(() => {
    if (!data || data.length === 0 || totalCount <= 0) return [];

    let currentAngle = -Math.PI / 2;
    return data
      .filter((item) => Number(item.count) > 0)
      .map((item, index) => {
        const count = Number(item.count) || 0;
        const angleSpan = (count / totalCount) * 2 * Math.PI;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angleSpan;
        currentAngle = endAngle;

        const color = item.color || colors[index % colors.length];
        const statusName = item.status || item.name || `Status ${index + 1}`;

        return {
          ...item,
          index,
          statusName,
          count,
          percentage: Math.round((count / totalCount) * 100),
          startAngle,
          endAngle,
          color,
        };
      });
  }, [data, colors, totalCount]);

  const legendPayload = useMemo(() => {
    return (data || []).map((item, index) => ({
      name: item.status || item.name || `Status ${index + 1}`,
      count: Number(item.count) || 0,
      color: item.color || colors[index % colors.length],
    }));
  }, [data, colors]);

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

  const cx = 160;
  const cy = 125;
  const outerR = 92;
  const innerR = 66;

  const hoveredSlice = hoveredIndex !== null ? slices.find((s) => s.index === hoveredIndex) : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full flex flex-col items-center justify-between"
      style={{ minHeight: `${height}px` }}
    >
      {/* Tooltip */}
      {hoveredSlice && (
        <CustomTooltip
          active={true}
          title={hoveredSlice.statusName}
          value={hoveredSlice.count}
          color={hoveredSlice.color}
          unit={`${hoveredSlice.percentage}%`}
          x={tooltipPos.x}
          y={tooltipPos.y}
        />
      )}

      {/* SVG Canvas */}
      <div className="w-full flex-1 flex items-center justify-center">
        <svg
          viewBox="0 0 320 250"
          className="w-full max-w-[320px] h-auto overflow-visible select-none"
        >
          <defs>
            <filter id="pie-slice-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.25" />
            </filter>
          </defs>

          {totalCount === 0 ? (
            /* Empty State Donut Ring */
            <g>
              <circle
                cx={cx}
                cy={cy}
                r={(outerR + innerR) / 2}
                fill="none"
                stroke="currentColor"
                strokeWidth={outerR - innerR}
                className="text-border/60"
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-content-muted text-xs font-medium"
              >
                No task data
              </text>
            </g>
          ) : (
            <g>
              {slices.map((slice) => {
                const isHovered = hoveredIndex === slice.index;
                const rOut = isHovered ? outerR + 5 : outerR;
                const rIn = isHovered ? innerR - 2 : innerR;
                const path = getArcPath(cx, cy, rIn, rOut, slice.startAngle, slice.endAngle);

                return (
                  <path
                    key={`slice-${slice.index}`}
                    d={path}
                    fill={slice.color}
                    className="transition-all duration-150 cursor-pointer outline-none"
                    style={{
                      transformOrigin: `${cx}px ${cy}px`,
                      filter: isHovered ? 'url(#pie-slice-glow)' : 'none',
                      opacity: hoveredIndex !== null && !isHovered ? 0.6 : 1,
                    }}
                    onMouseMove={(e) => handleMouseMove(e, slice.index)}
                    onMouseLeave={handleMouseLeave}
                  />
                );
              })}

              {/* Center Content */}
              <g
                className="pointer-events-none"
                style={{ transform: 'translate(0, 0)' }}
              >
                <text
                  x={cx}
                  y={cy - 4}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-bold fill-content text-2xl tracking-tight"
                >
                  {hoveredSlice ? hoveredSlice.count : totalCount}
                </text>
                <text
                  x={cx}
                  y={cy + 18}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="text-[11px] font-medium fill-content-muted uppercase tracking-wider"
                >
                  {hoveredSlice ? hoveredSlice.statusName : unit}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>

      {/* Custom Legend */}
      <CustomLegend
        payload={legendPayload}
        activeIndex={hoveredIndex}
        onItemHover={(idx) => setHoveredIndex(idx)}
        onItemLeave={() => setHoveredIndex(null)}
      />
    </div>
  );
};

export default CustomPieChart;
export { CustomPieChart };
