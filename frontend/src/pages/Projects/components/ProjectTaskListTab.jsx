import React, { useState } from 'react';
import {
  useGetProjectTasksQuery,
  exportProjectTasksCsv,
} from '../../../services/taskApi';
import {
  useGetProjectStatusesQuery,
  useGetProjectTeamsQuery,
} from '../../../services/projectApi';
import {
  TaskStatusBadge,
  PriorityBadge,
} from './TaskStatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../../../components/common/PageState';
import {
  LuPlus,
  LuSearch,
  LuDownload,
  LuCalendar,
  LuUsers,
  LuShieldCheck,
  LuListTodo,
} from 'react-icons/lu';

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const ProjectTaskListTab = ({
  projectId,
  canManage,
  onSelectTask,
  onCreateTask,
}) => {
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [priorityCode, setPriorityCode] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const queryParams = {
    projectId,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(statusId ? { statusId } : {}),
    ...(teamId ? { teamId } : {}),
    ...(priorityCode ? { priorityCode } : {}),
  };

  const {
    data: tasks = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGetProjectTasksQuery(queryParams);

  const { data: statuses = [] } = useGetProjectStatusesQuery(projectId);
  const { data: teams = [] } = useGetProjectTeamsQuery(projectId);

  const handleExport = async () => {
    setIsExporting(true);
    setExportError('');
    try {
      const { projectId: _, ...filters } = queryParams;
      await exportProjectTasksCsv(projectId, filters);
    } catch (err) {
      setExportError(err.message || 'Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading tasks..." />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to load tasks"
        message={error?.data?.message || 'Could not retrieve tasks.'}
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-gray-100 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <LuSearch className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <select
            value={statusId}
            onChange={(e) => setStatusId(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All Statuses</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All Teams</option>
            {teams.map((t) => (
              <option key={t.teamId || t.id} value={t.teamId || t.id}>
                {t.teamName || t.name || t.teamId || t.id}
              </option>
            ))}
          </select>

          <select
            value={priorityCode}
            onChange={(e) => setPriorityCode(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || tasks.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <LuDownload className="w-4 h-4" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>

          {canManage && (
            <button
              type="button"
              onClick={onCreateTask}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
            >
              <LuPlus className="w-4 h-4" />
              Create Task
            </button>
          )}
        </div>
      </div>

      {exportError && (
        <div className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {exportError}
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          icon={LuListTodo}
          title="No tasks found"
          description="Try adjusting your search criteria or create a new task."
          action={
            canManage && (
              <button
                type="button"
                onClick={onCreateTask}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90"
              >
                <LuPlus className="w-3.5 h-3.5" />
                Create Task
              </button>
            )
          }
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Task</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Team</th>
                  <th className="py-3 px-4">Progress</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Assignees</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    onClick={() => onSelectTask(task.id)}
                    className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 max-w-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-900 truncate">
                          {task.title}
                        </span>
                        {task.requiresApproval && (
                          <span title="Requires Approval" className="text-purple-600 shrink-0">
                            <LuShieldCheck className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                          {task.description}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <TaskStatusBadge
                        category={task.semanticCategory}
                        label={task.statusName}
                      />
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <PriorityBadge priority={task.priorityCode} />
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-gray-700">
                      {task.owningTeamName}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 w-28">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full"
                            style={{ width: `${task.effectiveProgress}%` }}
                          />
                        </div>
                        <span className="font-medium text-gray-700">
                          {task.effectiveProgress}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-gray-600">
                      {task.dueAt ? (
                        <span className="inline-flex items-center gap-1">
                          <LuCalendar className="w-3.5 h-3.5 text-gray-400" />
                          {new Date(task.dueAt).toLocaleDateString()}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-gray-600">
                      {task.assigneeProjectMembershipIds?.length > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium bg-gray-100 px-2 py-0.5 rounded-full">
                          <LuUsers className="w-3 h-3 text-gray-500" />
                          {task.assigneeProjectMembershipIds.length}
                        </span>
                      ) : (
                        'None'
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTask(task.id);
                        }}
                        className="text-primary hover:text-primary/80 font-medium cursor-pointer"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectTaskListTab;
