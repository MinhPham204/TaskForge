import React from 'react';
import { LuRotateCw, LuUserPlus } from 'react-icons/lu';

const TeamOverviewSidebar = ({
  totalTeams = 6,
  totalMembers = 48,
  onInviteClick,
  onResendInvite,
}) => {
  const departmentAllocations = [
    { name: 'Engineering & Cloud', percent: 42, barColor: 'bg-indigo-600' },
    { name: 'Product & Design', percent: 25, barColor: 'bg-rose-500' },
    { name: 'Customer Operations', percent: 20, barColor: 'bg-teal-500' },
    { name: 'Marketing & Growth', percent: 13, barColor: 'bg-emerald-500' },
  ];

  const pendingInvites = [
    { email: 'david.choi@taskforge.dev', team: 'Frontend Engineering' },
    { email: 'elena.rostova@partner.io', team: 'Product & Design' },
  ];

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-surface-muted/30 p-5 hidden xl:block space-y-6 select-none rounded-xl">
      {/* Title */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-content-muted">
          Teams Overview
        </h2>
        <p className="text-xs text-content-muted mt-0.5">
          Summary of organizational structure.
        </p>
      </div>

      {/* Numerical Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-surface rounded-lg border border-border shadow-2xs">
          <span className="text-[11px] font-medium text-content-muted">Total Teams</span>
          <p className="text-xl font-bold text-content mt-1 font-mono">{totalTeams}</p>
        </div>
        <div className="p-3 bg-surface rounded-lg border border-border shadow-2xs">
          <span className="text-[11px] font-medium text-content-muted">Total Members</span>
          <p className="text-xl font-bold text-content mt-1 font-mono">{totalMembers}</p>
        </div>
      </div>

      {/* Headcount Share Progress */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">
            Headcount Share
          </h3>
          <span className="text-[11px] font-medium text-primary hover:underline cursor-pointer">
            Details
          </span>
        </div>
        <div className="space-y-2.5">
          {departmentAllocations.map((dept) => (
            <div key={dept.name}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-content font-medium">{dept.name}</span>
                <span className="text-content-muted font-mono">{dept.percent}%</span>
              </div>
              <div className="h-1.5 w-full bg-surface-muted border border-border/40 rounded-full overflow-hidden">
                <div
                  className={`h-full ${dept.barColor} rounded-full transition-all duration-300`}
                  style={{ width: `${dept.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Invites */}
      {onResendInvite && <div className="pt-4 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">
            Pending Invites
          </h3>
          <span className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded border border-amber-500/20">
            {pendingInvites.length} pending
          </span>
        </div>
        <div className="space-y-2">
          {pendingInvites.map((invite) => (
            <div
              key={invite.email}
              className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-surface border border-border shadow-2xs"
            >
              <div className="min-w-0 pr-2">
                <p className="font-medium text-content truncate">{invite.email}</p>
                <p className="text-[10px] text-content-muted truncate">{invite.team}</p>
              </div>
              <button
                type="button"
                onClick={() => onResendInvite && onResendInvite(invite.email)}
                className="text-content-muted hover:text-primary p-1 rounded hover:bg-surface-muted transition-colors cursor-pointer"
                title="Resend invitation"
              >
                <LuRotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>}

      {/* Invite CTA Button */}
      {onInviteClick && <div className="pt-2">
        <button
          type="button"
          onClick={onInviteClick}
          className="w-full py-2 px-3 border border-border rounded-lg text-xs font-medium text-content hover:bg-surface-muted transition-colors flex items-center justify-center space-x-1.5 shadow-2xs bg-surface cursor-pointer"
        >
          <LuUserPlus className="w-3.5 h-3.5 text-content-muted" />
          <span>Invite Organization Members</span>
        </button>
      </div>}
    </aside>
  );
};

export default TeamOverviewSidebar;
