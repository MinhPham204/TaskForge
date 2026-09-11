import React from 'react';
import {
  LuActivity,
  LuClock,
  LuRotateCcw,
  LuFolder,
  LuCircleCheck,
  LuListTodo,
  LuUsers,
  LuShieldCheck,
  LuMessageSquare,
  LuFileText,
  LuSettings,
} from 'react-icons/lu';
import { LoadingState, ErrorState, EmptyState } from '../../../components/common/PageState';
import { useGetProjectActivitiesQuery } from '../../../services/collaborationApi';

const actionIcons = {
  PROJECT_CREATED: LuFolder,
  PROJECT_UPDATED: LuFolder,
  PROJECT_ACTIVATED: LuCircleCheck,
  PROJECT_COMPLETED: LuCircleCheck,
  PROJECT_REOPENED: LuRotateCcw,
  PROJECT_ARCHIVED: LuFolder,
  PROJECT_RESTORED: LuRotateCcw,
  PARTICIPANT_ADDED: LuUsers,
  PARTICIPANT_REMOVED: LuUsers,
  TASK_CREATED: LuListTodo,
  TASK_UPDATED: LuListTodo,
  TASK_ARCHIVED: LuListTodo,
  TASK_STATUS_CHANGED: LuCircleCheck,
  CHECKLIST_ITEM_ADDED: LuCircleCheck,
  CHECKLIST_ITEM_TOGGLED: LuCircleCheck,
  COMMENT_ADDED: LuMessageSquare,
  APPROVAL_REQUESTED: LuShieldCheck,
  APPROVAL_RESOLVED: LuShieldCheck,
  FILE_ADDED: LuFileText,
  FILE_REMOVED: LuFileText,
};

const formatActionText = (entry) => {
  const code = entry.actionCode || '';
  const meta = entry.safeMetadata || {};

  switch (code) {
    case 'PROJECT_CREATED':
      return 'created this project';
    case 'PROJECT_UPDATED':
      return 'updated project details';
    case 'PROJECT_ACTIVATED':
      return 'activated this project';
    case 'PROJECT_COMPLETED':
      return 'marked this project as completed';
    case 'PROJECT_REOPENED':
      return 'reopened this project';
    case 'PROJECT_ARCHIVED':
      return 'archived this project';
    case 'PROJECT_RESTORED':
      return 'restored this project';
    case 'PARTICIPANT_ADDED':
      return meta.participantName
        ? `added ${meta.participantName} to the project`
        : 'added a member to the project';
    case 'PARTICIPANT_REMOVED':
      return 'removed a member from the project';
    case 'TASK_CREATED':
      return meta.taskTitle
        ? `created task "${meta.taskTitle}"`
        : 'created a task';
    case 'TASK_UPDATED':
      return meta.taskTitle
        ? `updated task "${meta.taskTitle}"`
        : 'updated a task';
    case 'TASK_STATUS_CHANGED':
      return meta.statusName
        ? `moved task status to "${meta.statusName}"`
        : 'changed task status';
    case 'TASK_ARCHIVED':
      return meta.taskTitle
        ? `archived task "${meta.taskTitle}"`
        : 'archived a task';
    case 'CHECKLIST_ITEM_ADDED':
      return 'added a checklist item';
    case 'CHECKLIST_ITEM_TOGGLED':
      return meta.completed ? 'completed a checklist item' : 'reopened a checklist item';
    case 'COMMENT_ADDED':
      return 'commented on a task';
    case 'APPROVAL_REQUESTED':
      return 'requested task approval';
    case 'APPROVAL_RESOLVED':
      return meta.action
        ? `${meta.action} task approval`
        : 'resolved task approval';
    case 'FILE_ADDED':
      return meta.displayName || meta.originalName
        ? `added file "${meta.displayName || meta.originalName}"`
        : 'added a file to project';
    case 'FILE_REMOVED':
      return 'removed a file from project';
    default:
      return code.replace(/_/g, ' ').toLowerCase();
  }
};

const ProjectActivityTab = ({ projectId }) => {
  const {
    data: activities = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGetProjectActivitiesQuery(projectId);

  if (isLoading) {
    return <LoadingState message="Loading project activity timeline..." />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to Load Activities"
        message={error?.data?.message || 'Unable to retrieve timeline for this project.'}
        onRetry={refetch}
      />
    );
  }

  if (activities.length === 0) {
    return (
      <EmptyState
        title="No Activity Yet"
        message="Activities and milestones for this project will appear here as work progresses."
        icon={LuClock}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <LuActivity className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-gray-900">Project Activity Timeline</h2>
          <span className="text-xs text-gray-500 font-normal">
            ({activities.length} recorded {activities.length === 1 ? 'event' : 'events'})
          </span>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
        >
          <LuRotateCcw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Timeline List */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="relative border-l-2 border-gray-200 ml-4 pl-6 space-y-6">
          {activities.map((entry) => {
            const Icon = actionIcons[entry.actionCode] || LuActivity;
            const actorDisplay = entry.actorName || entry.actorEmail || 'A project member';

            return (
              <div key={entry.id} className="relative group">
                {/* Timeline node icon */}
                <div className="absolute -left-[35px] top-0 w-8 h-8 rounded-full bg-white border-2 border-primary text-primary flex items-center justify-center shadow-xs">
                  <Icon className="w-4 h-4" />
                </div>

                {/* Event Card */}
                <div className="p-3.5 bg-gray-50/75 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-900">{actorDisplay}</span>
                      <span className="text-gray-600">{formatActionText(entry)}</span>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {new Date(entry.occurredAt).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Contextual badge */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 font-medium">
                      {entry.subjectType}
                    </span>
                    {entry.safeMetadata?.priority && (
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        Priority: {String(entry.safeMetadata.priority)}
                      </span>
                    )}
                    {entry.safeMetadata?.reason && (
                      <p className="text-xs text-gray-500 italic">
                        Reason: {String(entry.safeMetadata.reason)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ProjectActivityTab;
