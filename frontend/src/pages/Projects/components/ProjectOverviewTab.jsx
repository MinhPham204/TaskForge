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
        <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-xs">
          <p className="text-xs text-gray-500 font-medium">Participating Teams</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{projectTeams.length}</p>
          <p className="text-[11px] text-gray-400 mt-1">Cross-team collaboration</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-xs">
          <p className="text-xs text-gray-500 font-medium">Project Members</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{projectMembers.length}</p>
          <p className="text-[11px] text-gray-400 mt-1">Managers & Contributors</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-xs">
          <p className="text-xs text-gray-500 font-medium">Configured Statuses</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{projectStatuses.length}</p>
          <p className="text-[11px] text-gray-400 mt-1">Lifecycle positions</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-xs">
          <p className="text-xs text-gray-500 font-medium">Enabled Modules</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {enabledModulesCount} / 4
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Active extensions</p>
        </div>
      </div>

      {/* Task Overview KPIs */}
      {taskOverview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium">Total Tasks</span>
              <LuListTodo className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{taskOverview.total || 0}</p>
          </div>

          <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-emerald-600">
              <span className="text-xs font-medium">Completed</span>
              <LuCircleCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-emerald-700">{taskOverview.completed || 0}</p>
          </div>

          <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-amber-600">
              <span className="text-xs font-medium">Overdue</span>
              <LuTriangleAlert className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-amber-700">{taskOverview.overdue || 0}</p>
          </div>

          <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-blue-600">
              <span className="text-xs font-medium">Avg. Progress</span>
              <LuTrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-blue-700">{taskOverview.averageProgress || 0}%</p>
          </div>
        </div>
      )}

      {/* Detail information */}
      <div className="bg-white border border-gray-100 rounded-lg p-6 shadow-xs">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Project Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <span className="text-xs text-gray-400 block mb-1">Description</span>
            <p className="text-gray-700 leading-relaxed text-sm">
              {project.description || 'No description provided for this project.'}
            </p>
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <span className="text-gray-400 block">Created On</span>
              <span className="text-gray-700 font-medium">
                {new Date(project.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block">Current Lifecycle State</span>
              <span className="text-gray-700 font-medium">{project.state}</span>
            </div>
            {project.completedAt && (
              <div>
                <span className="text-gray-400 block">Completed Date</span>
                <span className="text-emerald-700 font-medium">
                  {new Date(project.completedAt).toLocaleDateString()}
                </span>
              </div>
            )}
            {project.archivedAt && (
              <div>
                <span className="text-gray-400 block">Archived Date</span>
                <span className="text-red-700 font-medium">
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
