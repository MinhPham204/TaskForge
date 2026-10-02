import React from 'react';
import {
  LuBuilding2,
  LuFolderKanban,
  LuArrowRight,
  LuEllipsisVertical,
  LuLayers,
} from 'react-icons/lu';

const THEME_PALETTES = [
  { badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200/60' },
  { badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200/60' },
  { badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200/60' },
  { badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200/60' },
  { badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200/60' },
  { badge: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200/60' },
];

function getMonogram(name = '') {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2 && words[0] && words[1]) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'TM';
}

function getPalette(id = '') {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }
  return THEME_PALETTES[Math.abs(hash) % THEME_PALETTES.length];
}

const TeamCard = ({ team, onClick }) => {
  const monogram = getMonogram(team.name);
  const palette = getPalette(team.id || team.name);
  const isDefault = team.name?.toLowerCase().includes('general') || team.isDefault;
  const projectCount = team.projectsCount !== undefined ? team.projectsCount : (team.projects?.length || 2);
  const members = team.members || [];
  const membersCount = team.membersCount || (members.length > 0 ? members.length : 6);

  // Take first 3 members for avatar stack
  const previewMembers = members.slice(0, 3);
  const overflowCount = Math.max(0, membersCount - previewMembers.length);

  return (
    <div
      onClick={onClick}
      className="bg-surface border border-border/80 hover:border-border hover:shadow-xs rounded-xl p-5 transition-all duration-200 flex flex-col justify-between group cursor-pointer"
    >
      <div>
        {/* Card Header: Monogram + Name + Options */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-lg font-bold text-xs flex items-center justify-center border shadow-2xs shrink-0 ${palette.badge}`}
            >
              {monogram}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <h3 className="text-sm font-semibold text-content group-hover:text-primary transition-colors truncate">
                  {team.name}
                </h3>
                {isDefault ? (
                  <span className="text-[10px] bg-surface-muted text-content-muted px-1.5 py-0.5 rounded font-medium border border-border/60">
                    Default
                  </span>
                ) : (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium border border-primary/20">
                    Department
                  </span>
                )}
              </div>
              <p className="text-[11px] text-content-muted flex items-center mt-0.5 truncate">
                <LuBuilding2 className="w-3 h-3 mr-1 text-content-muted shrink-0" />
                <span className="truncate">{team.scope || (isDefault ? 'Organization-wide' : 'Core Department')}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onClick) onClick();
            }}
            className="text-content-muted hover:text-content p-1 rounded hover:bg-surface-muted transition-colors cursor-pointer"
            title="Team options"
          >
            <LuEllipsisVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        <p className="text-xs text-content-muted mt-3 line-clamp-2 leading-relaxed">
          {team.description || 'Dedicated collaboration group for coordinating initiatives, deliverables, and permissions.'}
        </p>

        {/* Team Meta: Projects & Status */}
        <div className="mt-4 flex items-center space-x-2">
          <span className="inline-flex items-center text-[11px] text-content-muted font-medium bg-surface-muted px-2 py-0.5 rounded border border-border/60">
            <LuFolderKanban className="w-3 h-3 mr-1 text-content-muted" />
            {projectCount} {projectCount === 1 ? 'project' : 'projects'}
          </span>
          <span className="inline-flex items-center text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-medium border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
            Active
          </span>
        </div>
      </div>

      {/* Card Bottom: Member Avatars Stack & Action */}
      <div className="mt-5 pt-3.5 border-t border-border/60 flex items-center justify-between">
        {/* Avatars Stack */}
        <div className="flex items-center -space-x-1.5">
          {previewMembers.length > 0 ? (
            previewMembers.map((m, idx) => {
              const name = m.user?.name || m.name || 'Member';
              const initials = getMonogram(name);
              return (
                <div
                  key={m.id || idx}
                  className="w-6 h-6 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[10px] font-medium border-2 border-surface ring-1 ring-border/50"
                  title={name}
                >
                  {initials}
                </div>
              );
            })
          ) : (
            <>
              <div className="w-6 h-6 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[10px] font-medium border-2 border-surface ring-1 ring-border/50">
                AJ
              </div>
              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-medium border-2 border-surface ring-1 ring-border/50">
                SL
              </div>
            </>
          )}

          {overflowCount > 0 && (
            <div className="w-6 h-6 rounded-full bg-surface-muted text-content-muted flex items-center justify-center text-[10px] font-semibold border-2 border-surface ring-1 border-border">
              +{overflowCount}
            </div>
          )}
        </div>

        {/* View Team Link */}
        <div className="text-xs font-medium text-content-muted group-hover:text-primary flex items-center space-x-1 transition-colors">
          <span>View team</span>
          <LuArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
};

export default TeamCard;
