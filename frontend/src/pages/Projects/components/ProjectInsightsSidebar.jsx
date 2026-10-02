import React from 'react';
import { LuDownload, LuExternalLink } from 'react-icons/lu';

const ProjectInsightsSidebar = ({ onExport, milestones = [], allocations = [] }) => {
  const defaultMilestones = [
    { title: 'SaaS Core v2 Freeze', date: 'Nov 1, 2026', dotColor: 'bg-amber-500' },
    { title: 'Mobile Beta Kickoff', date: 'Dec 16, 2026', dotColor: 'bg-blue-500' },
    { title: 'SOC2 Type II Audit', date: 'Completed Oct 31', dotColor: 'bg-emerald-500' },
  ];

  const defaultAllocations = [
    { name: 'Marketing & Growth', percent: 40, barColor: 'bg-indigo-600' },
    { name: 'Operations & CX', percent: 35, barColor: 'bg-emerald-500' },
    { name: 'Product & Creative', percent: 25, barColor: 'bg-rose-500' },
  ];

  const activeMilestones = milestones.length > 0 ? milestones : defaultMilestones;
  const activeAllocations = allocations.length > 0 ? allocations : defaultAllocations;

  return (
    <aside className="w-72 shrink-0 border-l border-border bg-surface-muted/40 hidden lg:flex flex-col justify-between overflow-y-auto p-4 select-none rounded-xl">
      <div className="space-y-5">
        {/* Section: Overview */}
        <div>
          <h2 className="text-xs font-semibold text-content">Initiatives overview</h2>
          <p className="text-[11px] text-content-muted mt-0.5">
            Target deliverables and milestones for Q4.
          </p>
        </div>

        {/* Milestones list (Linear style) */}
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] font-medium uppercase tracking-wider text-content-muted">
              Milestones
            </span>
            <span className="text-[11px] text-content-muted hover:text-content transition-colors flex items-center gap-1 cursor-pointer">
              <span>Roadmap</span>
              <LuExternalLink className="w-2.5 h-2.5" />
            </span>
          </div>
          <div className="space-y-2.5">
            {activeMilestones.map((m) => (
              <div key={m.title} className="flex items-start space-x-2">
                <div className={`w-1.5 h-1.5 rounded-full ${m.dotColor} mt-1.5 shrink-0`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-content truncate">{m.title}</p>
                  <p className="text-[11px] text-content-muted font-mono">{m.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Allocation / Capacity */}
        <div className="space-y-3 pt-3 border-t border-border">
          <span className="text-[11px] font-medium uppercase tracking-wider text-content-muted">
            Department Allocation
          </span>
          <div className="space-y-2.5 text-xs">
            {activeAllocations.map((a) => (
              <div key={a.name}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-content-muted font-medium">{a.name}</span>
                  <span className="text-content font-mono font-medium">{a.percent}%</span>
                </div>
                <div className="w-full bg-surface-muted border border-border/40 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`${a.barColor} h-full rounded-full transition-all duration-300`}
                    style={{ width: `${a.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Export action */}
      <div className="pt-4 border-t border-border mt-6">
        <button
          type="button"
          onClick={onExport}
          className="w-full py-1.5 px-2.5 text-xs text-content-muted hover:text-content border border-border hover:border-border/80 rounded-md transition-colors flex items-center justify-center space-x-1.5 bg-surface hover:bg-surface-muted shadow-2xs cursor-pointer"
        >
          <LuDownload className="w-3.5 h-3.5 text-content-muted" />
          <span className="font-medium">Export report</span>
        </button>
      </div>
    </aside>
  );
};

export default ProjectInsightsSidebar;
