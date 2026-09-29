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
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-surface p-3 rounded-xl border border-border shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <LuSearch className="absolute left-3 top-2.5 w-4 h-4 text-content-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface border border-border text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-content-muted/60"
            />
          </div>

          <select
            value={statusId}
            onChange={(e) => setStatusId(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-surface text-content focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-surface text-content focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-surface text-content focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-content-muted bg-surface border border-border rounded-lg hover:bg-surface-muted hover:text-content transition-colors shadow-xs cursor-pointer disabled:opacity-50"
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
        <div className="p-2.5 text-xs text-danger-content bg-danger-surface border border-danger-border rounded-lg">
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
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 cursor-pointer"
              >
                <LuPlus className="w-3.5 h-3.5" />
                Create Task
              </button>
            )
          }
        />
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted border-b border-border text-content-muted font-semibold uppercase tracking-wider text-[10px]">
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
              <tbody className="divide-y divide-border">
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    onClick={() => onSelectTask(task.id)}
                    className="hover:bg-surface-muted/60 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 max-w-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-content truncate">
                          {task.title}
                        </span>
                        {task.requiresApproval && (
                          <span title="Requires Approval" className="text-purple-600 dark:text-purple-400 shrink-0">
                            <LuShieldCheck className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-[11px] text-content-muted truncate mt-0.5">
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
                    <td className="py-3 px-4 whitespace-nowrap text-content-muted">
                      {task.owningTeamName}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 w-28">
                        <div className="flex-1 bg-surface-muted rounded-full h-1.5 overflow-hidden border border-border/40">
                          <div
                            className="bg-primary h-1.5 rounded-full"
                            style={{ width: `${task.effectiveProgress}%` }}
                          />
                        </div>
                        <span className="font-medium text-content-muted">
                          {task.effectiveProgress}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-content-muted">
                      {task.dueAt ? (
                        <span className="inline-flex items-center gap-1">
                          <LuCalendar className="w-3.5 h-3.5 text-content-muted/70" />
                          {new Date(task.dueAt).toLocaleDateString()}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-content-muted">
                      {task.assigneeProjectMembershipIds?.length > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium bg-surface-muted border border-border px-2 py-0.5 rounded-full">
                          <LuUsers className="w-3 h-3 text-content-muted" />
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
                        Open Details
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
