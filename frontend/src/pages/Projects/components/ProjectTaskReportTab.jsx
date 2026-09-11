import React, { useState } from 'react';
import {
  useGetProjectTaskReportQuery,
  exportProjectTasksCsv,
} from '../../../services/taskApi';
import {
  useGetProjectMembersQuery,
} from '../../../services/projectApi';
import { LoadingState, ErrorState } from '../../../components/common/PageState';
import {
  TaskStatusBadge,
  PriorityBadge,
} from './TaskStatusBadge';
import {
  LuDownload,
  LuUsers,
  LuCircleCheck,
  LuTriangleAlert,
  LuListTodo,
  LuTrendingUp,
  LuCircleX,
} from 'react-icons/lu';

const ProjectTaskReportTab = ({ projectId, onSelectTask }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetProjectTaskReportQuery({ projectId });

  const { data: members = [] } = useGetProjectMembersQuery(projectId);

  const handleExport = async () => {
    setIsExporting(true);
    setExportError('');
    try {
      await exportProjectTasksCsv(projectId);
    } catch (err) {
      setExportError(err.message || 'Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading project report & workload..." />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to load report"
        message={error?.data?.message || 'Could not retrieve project report.'}
        onRetry={refetch}
      />
    );
  }

  const { summary = {}, workload = [], tasks = [] } = report || {};

  return (
    <div className="space-y-6">
      {/* Export & Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Project Performance & Workload</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Key execution metrics, team member workloads, and status overview.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || tasks.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
        >
          <LuDownload className="w-4 h-4" />
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {exportError && (
        <div className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {exportError}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium">Total Tasks</span>
            <LuListTodo className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.total || 0}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-emerald-600">
            <span className="text-xs font-medium">Completed</span>
            <LuCircleCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700">{summary.completed || 0}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-amber-600">
            <span className="text-xs font-medium">Overdue</span>
            <LuTriangleAlert className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-700">{summary.overdue || 0}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium">Cancelled</span>
            <LuCircleX className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-700">{summary.cancelled || 0}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-blue-600">
            <span className="text-xs font-medium">Avg. Progress</span>
            <LuTrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-700">{summary.averageProgress || 0}%</p>
        </div>
      </div>

      {/* Member Workload Section */}
      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-xs space-y-4">
        <h4 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
          <LuUsers className="w-4 h-4 text-primary" />
          Member Workload (Active Non-Completed Tasks)
        </h4>

        {workload.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">
            No active assigned tasks across members.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {workload.map((w) => {
              const member = members.find(
                (m) => (m.id || m.organizationMembershipId) === w.projectMembershipId
              );
              return (
                <div
                  key={w.projectMembershipId}
                  className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between text-xs"
                >
                  <div className="truncate mr-2">
                    <p className="font-semibold text-gray-800 truncate">
                      {member?.user?.name || member?.user?.email || w.projectMembershipId}
                    </p>
                    <p className="text-[11px] text-gray-500">{member?.role || 'CONTRIBUTOR'}</p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                    {w.activeTaskCount} tasks
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tasks Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-xs overflow-hidden space-y-3 p-5">
        <h4 className="text-xs font-semibold text-gray-900">Task Overview List ({tasks.length})</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Title</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Team</th>
                <th className="py-2.5 px-3">Progress</th>
                <th className="py-2.5 px-3">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => onSelectTask?.(task.id)}
                  className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                >
                  <td className="py-2.5 px-3 font-semibold text-gray-900 max-w-xs truncate">
                    {task.title}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <TaskStatusBadge
                      category={task.semanticCategory}
                      label={task.statusName}
                    />
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <PriorityBadge priority={task.priorityCode} />
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-gray-600">
                    {task.owningTeamName}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="font-semibold text-gray-700">
                      {task.effectiveProgress}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-gray-500">
                    {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProjectTaskReportTab;
