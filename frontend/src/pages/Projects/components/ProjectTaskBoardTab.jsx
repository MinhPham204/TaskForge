import React, { useEffect, useState } from 'react';
import {
  useGetProjectTaskBoardQuery,
  useTransitionTaskStatusMutation,
} from '../../../services/taskApi';
import { useGetProjectTeamsQuery } from '../../../services/projectApi';
import { LoadingState, ErrorState, EmptyState } from '../../../components/common/PageState';
import { LuKanban } from 'react-icons/lu';
import BoardFilterBar from './board/BoardFilterBar';
import BoardColumn from './board/BoardColumn';

const ProjectTaskBoardTab = ({
  projectId,
  canManage = false,
  canCreateTask = false,
  onSelectTask,
  onCreateTask,
  onSwitchTab,
}) => {
  const [search, setSearch] = useState('');
  const [priorityCode, setPriorityCode] = useState('');
  const [teamId, setTeamId] = useState('');
  const [optimisticColumns, setOptimisticColumns] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColumnId, setDragOverColumnId] = useState(null);
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

  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverColumnId(null);
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumnId !== columnId) {
      setDragOverColumnId(columnId);
    }
  };

  const handleDragEnter = (e, columnId) => {
    e.preventDefault();
    setDragOverColumnId(columnId);
  };

  const handleDragLeave = (e, columnId) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dragOverColumnId === columnId) {
      setDragOverColumnId(null);
    }
  };

  const handleDrop = async (e, targetStatusId) => {
    e.preventDefault();
    setDragOverColumnId(null);
    if (!draggedTaskId) return;

    const sourceColumn = displayColumns.find((col) =>
      col.tasks?.some((t) => t.id === draggedTaskId)
    );
    if (!sourceColumn || sourceColumn.id === targetStatusId) {
      setDraggedTaskId(null);
      return;
    }

    const previousColumns = displayColumns;
    const targetTaskId = draggedTaskId;
    const movedTask = sourceColumn.tasks.find((t) => t.id === targetTaskId);

    setActionError('');
    setOptimisticColumns(
      displayColumns.map((col) => {
        if (col.id === sourceColumn.id) {
          return { ...col, tasks: col.tasks.filter((t) => t.id !== targetTaskId) };
        }
        if (col.id === targetStatusId) {
          return { ...col, tasks: [...(col.tasks || []), { ...movedTask, statusId: targetStatusId }] };
        }
        return col;
      })
    );

    setDraggedTaskId(null);

    try {
      await transitionTaskStatus({ projectId, taskId: targetTaskId, statusId: targetStatusId }).unwrap();
    } catch (requestError) {
      setOptimisticColumns(previousColumns);
      setActionError(
        requestError?.data?.message || 'Task could not move to this status. Check its checklist and approval requirements.'
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <BoardFilterBar
        search={search}
        onSearchChange={setSearch}
        priorityCode={priorityCode}
        onPriorityChange={setPriorityCode}
        teamId={teamId}
        onTeamChange={setTeamId}
        teams={teams}
        onClearFilters={() => {
          setSearch('');
          setPriorityCode('');
          setTeamId('');
        }}
        canCreateTask={canCreateTask}
        onCreateTask={onCreateTask}
        onSwitchView={(view) => onSwitchTab && onSwitchTab(view)}
      />

      {/* Action Error Banner */}
      {actionError && (
        <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 rounded-lg">
          {actionError}
        </div>
      )}

      {/* Kanban Board Canvas */}
      {displayColumns.length === 0 ? (
        <EmptyState
          icon={LuKanban}
          title="No status columns found"
          description="Create project task statuses to view the board."
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-6 items-start min-h-[550px] custom-scrollbar scroll-smooth">
          {displayColumns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              dragOverColumnId={dragOverColumnId}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onSelectTask={onSelectTask}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectTaskBoardTab;
