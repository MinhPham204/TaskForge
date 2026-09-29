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
  const [dragOverColumnId, setDragOverColumnId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
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
    if (!draggedTaskId) return;
    const sourceColumn = displayColumns.find((column) =>
      column.tasks?.some((task) => task.id === draggedTaskId),
    );
    if (!sourceColumn || sourceColumn.id === statusId) {
      setDraggedTaskId(null);
      setDragOverColumnId(null);
      setIsDragging(false);
      return;
    }

    const previousColumns = displayColumns;
    const targetTaskId = draggedTaskId;
    const movedTask = sourceColumn.tasks.find((task) => task.id === targetTaskId);
    setActionError('');
    setOptimisticColumns(
      displayColumns.map((column) => {
        if (column.id === sourceColumn.id) {
          return { ...column, tasks: column.tasks.filter((task) => task.id !== targetTaskId) };
        }
        if (column.id === statusId) {
          return { ...column, tasks: [...(column.tasks || []), { ...movedTask, statusId }] };
        }
        return column;
      }),
    );
    setDraggedTaskId(null);
    setDragOverColumnId(null);
    setIsDragging(false);
    try {
      await transitionTaskStatus({ projectId, taskId: targetTaskId, statusId }).unwrap();
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
        <div className="flex gap-4 overflow-x-auto pb-4 items-stretch min-h-[550px]">
          {displayColumns.map((column) => (
            <div
              key={column.id}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (dragOverColumnId !== column.id) {
                  setDragOverColumnId(column.id);
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragOverColumnId(column.id);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget)) return;
                if (dragOverColumnId === column.id) {
                  setDragOverColumnId(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragOverColumnId(null);
                handleDrop(column.id);
              }}
              className={`w-80 shrink-0 rounded-xl p-3 border flex flex-col space-y-3 transition-colors ${
                dragOverColumnId === column.id
                  ? 'bg-primary/10 border-primary ring-2 ring-primary/20 shadow-sm'
                  : 'bg-surface-muted border-border'
              }`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-semibold text-content">{column.name}</h4>
                  <TaskStatusBadge
                    category={column.semanticCategory}
                    label={column.semanticCategory}
                  />
                </div>
                <span className="text-[11px] font-semibold text-content-muted bg-surface border border-border px-2 py-0.5 rounded-full">
                  {column.tasks?.length || 0}
                </span>
              </div>

              {/* Tasks List inside Column */}
              <div
                className="space-y-2.5 flex-1 flex flex-col"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (dragOverColumnId !== column.id) {
                    setDragOverColumnId(column.id);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDragOverColumnId(null);
                  handleDrop(column.id);
                }}
              >
                {column.tasks?.map((task) => {
                  const isBeingDragged = draggedTaskId === task.id;

                  return (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      draggable={true}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', task.id);
                        setDraggedTaskId(task.id);
                        setIsDragging(true);
                      }}
                      onDragEnd={() => {
                        setDraggedTaskId(null);
                        setDragOverColumnId(null);
                        setTimeout(() => setIsDragging(false), 50);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        if (dragOverColumnId !== column.id) {
                          setDragOverColumnId(column.id);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setDragOverColumnId(null);
                        handleDrop(column.id);
                      }}
                      onClick={() => {
                        if (isDragging) return;
                        onSelectTask(task.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectTask(task.id);
                        }
                      }}
                      className={`w-full text-left bg-surface p-3.5 rounded-lg border border-border hover:border-primary/50 shadow-xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing space-y-2.5 select-none ${
                        isBeingDragged
                          ? 'opacity-40 ring-2 ring-primary border-primary scale-[0.98]'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="text-xs font-semibold text-content leading-snug line-clamp-2">
                          {task.title}
                        </h5>
                        <PriorityBadge priority={task.priorityCode} />
                      </div>

                      {task.description && (
                        <p className="text-[11px] text-content-muted line-clamp-2 leading-relaxed">
                          {task.description}
                        </p>
                      )}

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-content-muted">
                          <span>Progress</span>
                          <span className="font-semibold text-content">
                            {task.effectiveProgress}%
                          </span>
                        </div>
                        <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden border border-border/40">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${task.effectiveProgress}%` }}
                          />
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="flex items-center justify-between text-[10px] text-content-muted pt-2 border-t border-border">
                        <span className="truncate max-w-[110px]" title={task.owningTeamName}>
                          {task.owningTeamName}
                        </span>

                        <div className="flex items-center gap-2">
                          {task.requiresApproval && (
                            <span
                              title="Requires Approval"
                              className="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 p-1 rounded"
                            >
                              <LuShieldCheck className="w-3.5 h-3.5" />
                            </span>
                          )}

                          {task.dueAt && (
                            <span className="inline-flex items-center gap-1 text-content-muted">
                              <LuCalendar className="w-3.5 h-3.5" />
                              {new Date(task.dueAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          )}

                          {task.assigneeProjectMembershipIds?.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-content-muted">
                              <LuUsers className="w-3.5 h-3.5" />
                              {task.assigneeProjectMembershipIds.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {(!column.tasks || column.tasks.length === 0) ? (
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      if (dragOverColumnId !== column.id) {
                        setDragOverColumnId(column.id);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDragOverColumnId(null);
                      handleDrop(column.id);
                    }}
                    className={`py-8 text-center text-xs italic flex-1 flex items-center justify-center rounded-lg transition-colors ${
                      dragOverColumnId === column.id
                        ? 'border-2 border-dashed border-primary/50 bg-primary/10 text-primary font-medium'
                        : 'text-content-muted/60'
                    }`}
                  >
                    {dragOverColumnId === column.id ? '' : 'No tasks in this status'}
                  </div>
                ) : (
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      if (dragOverColumnId !== column.id) {
                        setDragOverColumnId(column.id);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDragOverColumnId(null);
                      handleDrop(column.id);
                    }}
                    className={`flex-1 min-h-[70px] rounded-lg transition-all flex items-center justify-center ${
                      dragOverColumnId === column.id
                        ? 'border-2 border-dashed border-primary/60 bg-primary/10 mt-1'
                        : 'border border-transparent'
                    }`}
                  />
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
