import React from 'react';
import { LuArrowRight, LuFolderKanban, LuUsers } from 'react-icons/lu';

function getMonogram(name = '') {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2 && words[0] && words[1]) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'TM';
}

const TeamListView = ({ teams = [], onTeamClick }) => {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-xs overflow-hidden">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-3 px-4 py-2.5 text-[11px] font-medium text-content-muted uppercase tracking-wider border-b border-border/60 bg-surface-muted/30">
        <div className="col-span-12 sm:col-span-5">Team</div>
        <div className="hidden sm:block sm:col-span-3">Scope &amp; Type</div>
        <div className="hidden sm:block sm:col-span-2">Members</div>
        <div className="hidden sm:block sm:col-span-2 text-right">Projects</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/30">
        {teams.map((team) => {
          const monogram = getMonogram(team.name);
          const isDefault = team.name?.toLowerCase().includes('general') || team.isDefault;
          const membersCount = team.membersCount || (team.members?.length || 4);
          const projectCount = team.projectsCount !== undefined ? team.projectsCount : (team.projects?.length || 2);

          return (
            <div
              key={team.id}
              onClick={() => onTeamClick(team.id)}
              className="group grid grid-cols-12 gap-3 items-center px-4 py-3 hover:bg-surface-muted/60 transition-colors cursor-pointer"
            >
              {/* Monogram + Name + Description */}
              <div className="col-span-12 sm:col-span-5 flex items-center space-x-3 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-surface-muted border border-border text-content font-bold text-xs flex items-center justify-center shrink-0">
                  {monogram}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-content group-hover:text-primary transition-colors truncate">
                      {team.name}
                    </span>
                    {isDefault && (
                      <span className="text-[10px] bg-surface-muted text-content-muted px-1.5 py-0.2 rounded border border-border/40">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-content-muted truncate mt-0.5">
                    {team.description || 'Workspace collaboration team'}
                  </p>
                </div>
              </div>

              {/* Scope & Type */}
              <div className="hidden sm:flex sm:col-span-3 items-center space-x-2">
                <span className="text-xs text-content-muted">
                  {team.scope || (isDefault ? 'Organization-wide' : 'Department')}
                </span>
                <span className="inline-flex items-center text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 font-medium">
                  Active
                </span>
              </div>

              {/* Members */}
              <div className="hidden sm:flex sm:col-span-2 items-center space-x-1.5 text-xs text-content-muted">
                <LuUsers className="w-3.5 h-3.5 text-content-muted shrink-0" />
                <span>{membersCount} members</span>
              </div>

              {/* Projects & Action */}
              <div className="hidden sm:flex sm:col-span-2 items-center justify-end space-x-2 text-xs">
                <span className="text-content-muted flex items-center gap-1 font-mono">
                  <LuFolderKanban className="w-3 h-3 text-content-muted" />
                  {projectCount}
                </span>
                <span className="text-content-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                  <LuArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}

        {teams.length === 0 && (
          <div className="p-8 text-center text-xs text-content-muted">
            No teams match your filter.
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamListView;
