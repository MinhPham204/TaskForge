import React, { useState } from 'react';
import {
  useGetProjectTaskBoardQuery,
  useTransitionTaskStatusMutation,
} from '../../../services/taskApi';
import { useGetProjectTeamsQuery, useGetProjectMembersQuery } from '../../../services/projectApi';
import { LoadingState, ErrorState, EmptyState } from '../../../components/common/PageState';
import { LuKanban } from 'react-icons/lu';
import BoardFilterBar from './board/BoardFilterBar';
import BoardColumn from './board/BoardColumn';
import useBoardTransitions from './board/useBoardTransitions';

const ProjectTaskBoardTab = ({
  projectId,
  canCreateTask = false,
  onSelectTask,
  onCreateTask,
  onSwitchTab,
}) => {
  const [search, setSearch] = useState('');
  const [priorityCode, setPriorityCode] = useState('');
  const [teamId, setTeamId] = useState('');

  const queryParams = {
    projectId,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(priorityCode ? { priorityCode } : {}),
    ...(teamId ? { teamId } : {}),
  };

  const {
    currentData: columns = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useGetProjectTaskBoardQuery(queryParams, { refetchOnMountOrArgChange: true });

  const { currentData: teams = [] } = useGetProjectTeamsQuery(projectId);
  const { currentData: members = [] } = useGetProjectMembersQuery(projectId);
  const [transitionTaskStatus] = useTransitionTaskStatusMutation();

  const { board, dragOverColumnId, busy, blocked, message: actionError } = useBoardTransitions({
    queryParams, columns, transition: transitionTaskStatus, refetch, isFetching,
  });

  if (isLoading || (isFetching && columns.length === 0)) {
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
      {busy && <p role="status" className="text-xs text-content-muted">Saving move and refreshing Board…</p>}
      {blocked && !busy && <p role="status" className="text-xs text-content-muted">Refresh the Board before moving another Task.</p>}
      <button type="button" onClick={() => board.refresh()} disabled={busy || isFetching} className="text-xs text-primary">Refresh Board</button>
      {columns.length === 0 ? (
        <EmptyState
          icon={LuKanban}
          title="No status columns found"
          description="Create project task statuses to view the board."
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-6 items-start min-h-[550px] custom-scrollbar scroll-smooth">
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              members={members}
              isDragOver={dragOverColumnId === column.id}
              dragBlocked={busy || blocked || isFetching}
              onDragOver={board.over}
              onDragEnter={board.over}
              onDragLeave={board.leave}
              onDrop={board.drop}
              onSelectTask={onSelectTask}
              onDragStart={board.start}
              onDragEnd={board.end}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectTaskBoardTab;
