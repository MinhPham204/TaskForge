import React, { useEffect, useState } from 'react';
import {
  useGetProjectTaskBoardQuery,
  useTransitionTaskStatusMutation,
} from '../../../services/taskApi';
import {
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
  LuCalendar,
  LuUsers,
  LuShieldCheck,
  LuKanban,
} from 'react-icons/lu';

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const ProjectTaskBoardTab = ({
  projectId,
  canManage,
  onSelectTask,
  onCreateTask,
}) => {
  const [search, setSearch] = useState('');
  const [priorityCode, setPriorityCode] = useState('');
  const [teamId, setTeamId] = useState('');
  const [optimisticColumns, setOptimisticColumns] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [actionError, setActionError] = useState('');

  const queryParams = {
    projectId,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(priorityCode ? { priorityCode } : {}),
    ...(teamId ? { teamId } : {}),
  };

  const {
    data: columns = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGetProjectTaskBoardQuery(queryParams);

  const { data: teams = [] } = useGetProjectTeamsQuery(projectId);
  const [transitionTaskStatus] = useTransitionTaskStatusMutation();

  useEffect(() => {
    setOptimisticColumns(null);
  }, [columns]);

  if (isLoading) {
    return <LoadingState message="Loading task board..." />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to load task board"
        message={error?.data?.message || 'Could not retrieve board data.'}
        onRetry={refetch}
      />
    );
  }

  const displayColumns = optimisticColumns || columns;

  const handleDrop = async (statusId) => {
    if (!canManage || !draggedTaskId) return;
    const sourceColumn = displayColumns.find((column) =>
      column.tasks?.some((task) => task.id === draggedTaskId),
    );
    if (!sourceColumn || sourceColumn.id === statusId) {
      setDraggedTaskId(null);
      return;
    }

    const previousColumns = displayColumns;
    const movedTask = sourceColumn.tasks.find((task) => task.id === draggedTaskId);
    setActionError('');
    setOptimisticColumns(
      displayColumns.map((column) => {
        if (column.id === sourceColumn.id) {
          return { ...column, tasks: column.tasks.filter((task) => task.id !== draggedTaskId) };
        }
        if (column.id === statusId) {
          return { ...column, tasks: [...(column.tasks || []), { ...movedTask, statusId }] };
        }
        return column;
      }),
    );
    setDraggedTaskId(null);
    try {
      await transitionTaskStatus({ projectId, taskId: movedTask.id, statusId }).unwrap();
    } catch (requestError) {
      setOptimisticColumns(previousColumns);
      setActionError(
        requestError?.data?.message || 'Task could not move to this status. Check its checklist and approval requirements.',
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-gray-100 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
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
        </div>

        <div className="flex items-center gap-2">
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

      {actionError && (
        <div role="alert" className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {actionError}
        </div>
      )}

      {displayColumns.length === 0 ? (
        <EmptyState
          icon={LuKanban}
          title="No status columns found"
          description="Create project task statuses to view the board."
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 items-start">
          {displayColumns.map((column) => (
            <div
              key={column.id}
              onDragOver={(event) => canManage && event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(column.id);
              }}
              className="w-80 shrink-0 bg-gray-50/80 rounded-xl p-3 border border-gray-200/80 space-y-3"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-semibold text-gray-900">{column.name}</h4>
                  <TaskStatusBadge
                    category={column.semanticCategory}
                    label={column.semanticCategory}
                  />
                </div>
                <span className="text-[11px] font-semibold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                  {column.tasks?.length || 0}
                </span>
              </div>

              {/* Tasks List inside Column */}
              <div className="space-y-2.5 min-h-[150px]">
                {column.tasks?.map((task) => (
                  <button
                    type="button"
                    key={task.id}
                    onClick={() => onSelectTask(task.id)}
                    draggable={canManage}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', task.id);
                      setDraggedTaskId(task.id);
                    }}
                    onDragEnd={() => setDraggedTaskId(null)}
                    className="w-full text-left bg-white p-3.5 rounded-lg border border-gray-200/90 hover:border-primary/50 shadow-xs hover:shadow-md transition-all cursor-pointer space-y-2.5 disabled:cursor-default"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h5 className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2">
                        {task.title}
                      </h5>
                      <PriorityBadge priority={task.priorityCode} />
                    </div>

                    {task.description && (
                      <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span>Progress</span>
                        <span className="font-semibold text-gray-700">
                          {task.effectiveProgress}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all"
                          style={{ width: `${task.effectiveProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-100">
                      <span className="truncate max-w-[110px]" title={task.owningTeamName}>
                        {task.owningTeamName}
                      </span>

                      <div className="flex items-center gap-2">
                        {task.requiresApproval && (
                          <span
                            title="Requires Approval"
                            className="text-purple-600 bg-purple-50 p-1 rounded"
                          >
                            <LuShieldCheck className="w-3.5 h-3.5" />
                          </span>
                        )}

                        {task.dueAt && (
                          <span className="inline-flex items-center gap-1 text-gray-600">
                            <LuCalendar className="w-3 h-3" />
                            {new Date(task.dueAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}

                        {task.assigneeProjectMembershipIds?.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-gray-600">
                            <LuUsers className="w-3 h-3" />
                            {task.assigneeProjectMembershipIds.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}

                {(!column.tasks || column.tasks.length === 0) && (
                  <div className="py-8 text-center text-gray-400 text-xs italic">
                    No tasks in this status
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectTaskBoardTab;
