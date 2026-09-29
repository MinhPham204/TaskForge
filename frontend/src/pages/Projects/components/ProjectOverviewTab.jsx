import React from 'react';
import { useGetProjectTaskOverviewQuery } from '../../../services/taskApi';
import {
  LuListTodo,
  LuCircleCheck,
  LuTriangleAlert,
  LuTrendingUp,
} from 'react-icons/lu';

const ProjectOverviewTab = ({
  project,
  projectTeams = [],
  projectMembers = [],
  projectStatuses = [],
  projectModules = [],
}) => {
  const enabledModulesCount = projectModules.filter((m) => m.enabled).length;

  const { data: taskOverview } = useGetProjectTaskOverviewQuery(
    { projectId: project.id },
    { skip: !project.id }
  );

  return (
    <div className="space-y-6">
      {/* Metric Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
          <p className="text-xs text-content-muted font-medium">Participating Teams</p>
          <p className="text-2xl font-bold text-content mt-1">{projectTeams.length}</p>
          <p className="text-[11px] text-content-muted/80 mt-1">Cross-team collaboration</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
          <p className="text-xs text-content-muted font-medium">Project Members</p>
          <p className="text-2xl font-bold text-content mt-1">{projectMembers.length}</p>
          <p className="text-[11px] text-content-muted/80 mt-1">Managers & Contributors</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
          <p className="text-xs text-content-muted font-medium">Configured Statuses</p>
          <p className="text-2xl font-bold text-content mt-1">{projectStatuses.length}</p>
          <p className="text-[11px] text-content-muted/80 mt-1">Lifecycle positions</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
          <p className="text-xs text-content-muted font-medium">Enabled Modules</p>
          <p className="text-2xl font-bold text-content mt-1">
            {enabledModulesCount} / 4
          </p>
          <p className="text-[11px] text-content-muted/80 mt-1">Active extensions</p>
        </div>
      </div>

      {/* Task Overview KPIs */}
      {taskOverview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface border border-border rounded-xl p-4 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-content-muted">
              <span className="text-xs font-medium">Total Tasks</span>
              <LuListTodo className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-content">{taskOverview.total || 0}</p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-4 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
              <span className="text-xs font-medium">Completed</span>
              <LuCircleCheck className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{taskOverview.completed || 0}</p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-4 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
              <span className="text-xs font-medium">Overdue</span>
              <LuTriangleAlert className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{taskOverview.overdue || 0}</p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-4 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
              <span className="text-xs font-medium">Avg. Progress</span>
              <LuTrendingUp className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{taskOverview.averageProgress || 0}%</p>
          </div>
        </div>
      )}

      {/* Detail information */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-xs">
        <h2 className="text-base font-semibold text-content mb-4">Project Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <span className="text-xs text-content-muted block mb-1">Description</span>
            <p className="text-content-muted leading-relaxed text-sm">
              {project.description || 'No description provided for this project.'}
            </p>
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <span className="text-content-muted block">Created On</span>
              <span className="text-content font-medium">
                {new Date(project.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="text-content-muted block">Current Lifecycle State</span>
              <span className="text-content font-medium">{project.state}</span>
            </div>
            {project.completedAt && (
              <div>
                <span className="text-content-muted block">Completed Date</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {new Date(project.completedAt).toLocaleDateString()}
                </span>
              </div>
            )}
            {project.archivedAt && (
              <div>
                <span className="text-content-muted block">Archived Date</span>
                <span className="text-red-600 dark:text-red-400 font-medium">
                  {new Date(project.archivedAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectOverviewTab;
