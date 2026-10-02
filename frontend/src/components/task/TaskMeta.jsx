import React from 'react';
import { LuCalendar, LuUsers, LuUser, LuBuilding2 } from 'react-icons/lu';
import Avatar from '../Avatar.jsx';
import { isTaskOverdue } from '../../utils/taskAttention.js';

/**
 * TaskMeta - Semantic Micro-Component
 * Standardized, aligned metadata row (Assignee, Due Date, Team, Progress).
 * Designed for synchronized presentation across Table rows, Kanban cards, and Modal headers.
 * 
 * Rules:
 * - Hides 0% and 100% progress indicators by default to reduce visual noise.
 * - Displays clean, accessible metadata tokens with semantic theme tokens.
 *
 * @param {Object} props
 * @param {Object} [props.task] - Task object to extract metadata automatically
 * @param {string} [props.teamName] - Explicit team name
 * @param {string|Date} [props.dueAt] - Explicit due date
 * @param {string} [props.semanticCategory] - Task category to determine overdue styling
 * @param {Object|string} [props.assignee] - Single assignee (user object or name string)
 * @param {number} [props.assigneeCount] - Count of assignees
 * @param {number} [props.progress] - Effective progress percentage (0 - 100)
 * @param {boolean} [props.showTeam=true]
 * @param {boolean} [props.showDueDate=true]
 * @param {boolean} [props.showAssignee=true]
 * @param {boolean} [props.forceProgress=false] - If true, displays progress even if 0% or 100%
 * @param {boolean} [props.compact=false] - Compact spacing for tight cards or list rows
 * @param {string} [props.className] - Additional styling classes
 */
export const TaskMeta = ({
  task,
  teamName: explicitTeamName,
  dueAt: explicitDueAt,
  semanticCategory: explicitCategory,
  assignee: explicitAssignee,
  assigneeCount: explicitAssigneeCount,
  progress: explicitProgress,
  showTeam = true,
  showDueDate = true,
  showAssignee = true,
  forceProgress = false,
  compact = false,
  className = '',
}) => {
  // Extract values from task object or explicit props
  const team = explicitTeamName ?? task?.owningTeamName;
  const due = explicitDueAt ?? task?.dueAt ?? task?.dueDate;
  const category = explicitCategory ?? task?.semanticCategory;
  const progress = explicitProgress ?? task?.effectiveProgress;
  
  let assigneeCount = explicitAssigneeCount;
  if (assigneeCount === undefined) {
    if (Array.isArray(task?.assigneeProjectMembershipIds)) {
      assigneeCount = task.assigneeProjectMembershipIds.length;
    } else if (Array.isArray(task?.assignees)) {
      assigneeCount = task.assignees.length;
    }
  }

  const assignee = explicitAssignee ?? task?.assignee ?? (Array.isArray(task?.assignees) && task.assignees.length === 1 ? task.assignees[0] : null);

  const overdue = due ? isTaskOverdue(due, category) : false;

  const formattedDate = due
    ? new Date(due).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: compact ? undefined : 'numeric',
      })
    : null;

  // Rule: Only show progress when in-flight (0 < progress < 100), unless explicitly forced
  const hasMeaningfulProgress =
    progress !== undefined &&
    progress !== null &&
    (forceProgress || (progress > 0 && progress < 100));

  const textClass = compact ? 'text-[11px]' : 'text-xs';
  const iconClass = compact ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <div
      className={`flex items-center flex-wrap gap-x-3 gap-y-1 text-content-muted ${textClass} ${className}`.trim()}
    >
      {/* Team */}
      {showTeam && team && (
        <span
          className="inline-flex items-center gap-1 truncate max-w-[130px]"
          title={`Team: ${team}`}
        >
          <LuBuilding2 className={`${iconClass} shrink-0 opacity-70`} aria-hidden="true" />
          <span className="truncate">{team}</span>
        </span>
      )}

      {/* Due Date */}
      {showDueDate && formattedDate && (
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap ${
            overdue ? 'text-rose-600 dark:text-rose-400 font-medium' : ''
          }`}
          title={overdue ? `Overdue: ${formattedDate}` : `Due: ${formattedDate}`}
        >
          <LuCalendar className={`${iconClass} shrink-0 opacity-70`} aria-hidden="true" />
          <span>{formattedDate}</span>
        </span>
      )}

      {/* Assignee / Assignees Count */}
      {showAssignee && (
        <>
          {assigneeCount !== undefined && assigneeCount > 1 ? (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap"
              title={`${assigneeCount} Assignees`}
            >
              <LuUsers className={`${iconClass} shrink-0 opacity-70`} aria-hidden="true" />
              <span>{assigneeCount}</span>
            </span>
          ) : assignee ? (
            <span
              className="inline-flex items-center gap-1.5 whitespace-nowrap truncate max-w-[120px]"
              title={`Assignee: ${typeof assignee === 'string' ? assignee : assignee.name || assignee.email}`}
            >
              {typeof assignee === 'object' && assignee.name ? (
                <>
                  <Avatar
                    src={assignee.avatarUrl}
                    name={assignee.name}
                    className={compact ? 'h-4 w-4 text-[9px]' : 'h-4 w-4 text-[10px]'}
                  />
                  <span className="truncate">{assignee.name}</span>
                </>
              ) : (
                <>
                  <LuUser className={`${iconClass} shrink-0 opacity-70`} aria-hidden="true" />
                  <span className="truncate">{typeof assignee === 'string' ? assignee : 'Assigned'}</span>
                </>
              )}
            </span>
          ) : null}
        </>
      )}

      {/* Meaningful In-Flight Progress */}
      {hasMeaningfulProgress && (
        <span
          className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-content-muted"
          title={`Progress: ${progress}%`}
        >
          <span>{progress}%</span>
        </span>
      )}
    </div>
  );
};

export default TaskMeta;
