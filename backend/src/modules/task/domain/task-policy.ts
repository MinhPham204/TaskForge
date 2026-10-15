import { ConflictException, ForbiddenException } from '@nestjs/common';
import { withErrorCode } from '../../../common/http/coded-error';

export interface TaskCapability {
  allowed: boolean;
  reason: string | null;
}
export interface TaskPolicyFacts {
  projectState: string;
  archivedAt: Date | null;
  actorProjectMembershipId: string | null;
  actorProjectRole: string | null;
  creatorProjectMembershipId: string;
  assigneeProjectMembershipIds: string[];
  semanticCategory: string;
  checklistItemCount: number;
  hasPendingApproval: boolean;
}

export function taskMutabilityReason(
  projectState: string,
  archivedAt: Date | null,
): string | null {
  if (projectState === 'COMPLETED' || projectState === 'ARCHIVED')
    return 'PROJECT_READ_ONLY';
  if (archivedAt) return 'TASK_ARCHIVED';
  return null;
}

export function assertTaskMutable(
  projectState: string,
  archivedAt: Date | null,
): void {
  const reason = taskMutabilityReason(projectState, archivedAt);
  if (reason)
    throw withErrorCode(
      new ConflictException(
        reason === 'PROJECT_READ_ONLY'
          ? 'Completed and archived projects are read-only'
          : 'Archived tasks are read-only',
      ),
      reason,
    );
}

export function hasTaskExecutionAccess(
  memberId: string,
  role: string | null,
  creatorId: string,
  assigneeIds: string[],
): boolean {
  return (
    role === 'PROJECT_MANAGER' ||
    memberId === creatorId ||
    assigneeIds.includes(memberId)
  );
}

export function assertTaskExecutionAccess(
  memberId: string,
  role: string | null,
  creatorId: string,
  assigneeIds: string[],
): void {
  if (!hasTaskExecutionAccess(memberId, role, creatorId, assigneeIds))
    throw withErrorCode(
      new ForbiddenException(
        'Only the Task creator, an active assignee or an active Project Manager may execute this Task',
      ),
      'TASK_EXECUTION_ACCESS_REQUIRED',
    );
}

export function taskCapabilities(facts: TaskPolicyFacts) {
  const stateReason = taskMutabilityReason(
    facts.projectState,
    facts.archivedAt,
  );
  const memberReason =
    stateReason ??
    (facts.actorProjectMembershipId ? null : 'PROJECT_MEMBERSHIP_REQUIRED');
  const managerReason =
    memberReason ??
    (facts.actorProjectRole === 'PROJECT_MANAGER'
      ? null
      : 'PROJECT_MANAGER_REQUIRED');
  const executionReason =
    memberReason ??
    (hasTaskExecutionAccess(
      facts.actorProjectMembershipId!,
      facts.actorProjectRole,
      facts.creatorProjectMembershipId,
      facts.assigneeProjectMembershipIds,
    )
      ? null
      : 'TASK_EXECUTION_ACCESS_REQUIRED');
  const checklistReason =
    executionReason ??
    (facts.semanticCategory === 'COMPLETED' ? 'TASK_COMPLETED' : null);
  const decision = (reason: string | null): TaskCapability => ({
    allowed: reason === null,
    reason,
  });
  return {
    editContent: decision(executionReason),
    editManagement: decision(managerReason),
    editProgress: decision(
      checklistReason ??
        (facts.checklistItemCount > 0
          ? 'TASK_PROGRESS_CHECKLIST_DERIVED'
          : null),
    ),
    editChecklist: decision(checklistReason),
    // Permission to request a transition; target-specific domain constraints remain server-validated.
    transition: decision(executionReason),
    assign: decision(managerReason),
    unassign: decision(managerReason),
    configureApproval: decision(
      managerReason ??
        (facts.hasPendingApproval ? 'TASK_APPROVAL_PENDING' : null),
    ),
    // Read visibility was checked before constructing this response. D12-01/02 apply.
    comment: decision(memberReason),
    readAttachments: decision(null),
    uploadAttachment: decision(memberReason),
    unlinkAttachment: decision(memberReason),
  };
}

export type TaskCapabilities = ReturnType<typeof taskCapabilities>;
