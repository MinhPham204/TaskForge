import React from 'react';
import { LuCalendar } from 'react-icons/lu';

const COLUMNS = [
  { id: 'ACTIVE', title: 'Active', subtitle: 'In flight & active sprint', badgeColor: 'bg-emerald-500' },
  { id: 'DRAFT', title: 'Backlog & Planning', subtitle: 'Proposals & architecture', badgeColor: 'bg-amber-500' },
  { id: 'COMPLETED', title: 'Completed', subtitle: 'Delivered & signed off', badgeColor: 'bg-blue-500' },
  { id: 'ARCHIVED', title: 'Archived', subtitle: 'Superseded initiatives', badgeColor: 'bg-zinc-400' },
];

const ProjectBoardView = ({
  projects = [],
  onProjectClick,
  getMonogram,
  getProjectTheme,
  formatSmartDueDate,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
      {COLUMNS.map((col) => {
        const colProjects = projects.filter((p) => p.state === col.id);

        return (
          <div
            key={col.id}
            className="bg-surface-muted/30 border border-border rounded-xl p-3 space-y-3 flex flex-col min-h-[380px]"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${col.badgeColor}`} />
                <span className="text-xs font-semibold text-content">{col.title}</span>
              </div>
              <span className="text-xs font-mono text-content-muted bg-surface-muted px-1.5 py-0.5 rounded border border-border/40">
                {colProjects.length}
              </span>
            </div>

            {/* Column Cards */}
            <div className="space-y-2.5 flex-1">
              {colProjects.map((project) => {
                const monogram = getMonogram ? getMonogram(project.name) : project.name.slice(0, 2).toUpperCase();
                const theme = getProjectTheme ? getProjectTheme(project.id) : { accent: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700' };
                const dueInfo = formatSmartDueDate ? formatSmartDueDate(project.dueDate) : null;
                const progress = project.state === 'COMPLETED' ? 100 : project.state === 'ARCHIVED' ? 100 : project.state === 'DRAFT' ? 45 : 72;

                return (
                  <div
                    key={project.id}
                    onClick={() => onProjectClick(project.id)}
                    className="bg-surface hover:bg-surface-muted/50 border border-border rounded-lg p-3 shadow-2xs hover:shadow-xs transition-all duration-150 cursor-pointer space-y-2.5 group"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] shrink-0 border ${theme.badge}`}>
                        {monogram}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-semibold text-content group-hover:text-primary transition-colors truncate">
                          {project.name}
                        </h4>
                        <p className="text-[11px] text-content-muted line-clamp-2 mt-0.5 leading-relaxed">
                          {project.description || 'No description provided.'}
                        </p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-content-muted">
                        <span>Progress</span>
                        <span className="font-mono">{progress}%</span>
                      </div>
                      <div className="w-full bg-surface-muted h-1 rounded-full overflow-hidden">
                        <div
                          className={`${theme.accent} h-full rounded-full transition-all`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-content-muted">
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded-full bg-zinc-800 text-white text-[8px] font-semibold flex items-center justify-center">
                          {project.viewer?.projectRole === 'PROJECT_MANAGER' ? 'AJ' : 'TM'}
                        </div>
                        <span className="truncate max-w-[90px]">
                          {project.viewer?.projectRole === 'PROJECT_MANAGER' ? 'Lead' : 'Member'}
                        </span>
                      </div>

                      {dueInfo && (
                        <div className="flex items-center gap-1 font-mono text-[10px]">
                          <LuCalendar className="w-3 h-3 text-content-muted" />
                          <span>{dueInfo.text}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {colProjects.length === 0 && (
                <div className="h-28 border border-dashed border-border/60 rounded-lg flex items-center justify-center text-xs text-content-muted/60">
                  No projects in this stage
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProjectBoardView;
