import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ApprovalRequestState {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

@Entity({ name: 'tasks' })
@Check(
  'chk_tasks_approval_configuration',
  '(requires_approval AND approver_project_membership_id IS NOT NULL) OR (NOT requires_approval AND approver_project_membership_id IS NULL)',
)
@Check('chk_tasks_manual_progress_range', 'manual_progress BETWEEN 0 AND 100')
@Index(
  'uq_tasks_organization_project_id',
  ['organizationId', 'projectId', 'id'],
  {
    unique: true,
  },
)
@Index('idx_tasks_board', [
  'organizationId',
  'projectId',
  'statusId',
  'archivedAt',
  'createdAt',
])
@Index('idx_tasks_project_team_due', [
  'organizationId',
  'projectId',
  'owningTeamId',
  'archivedAt',
  'dueAt',
])
@Index('idx_tasks_due_at_active', ['organizationId', 'dueAt'], {
  where: 'archived_at IS NULL AND due_at IS NOT NULL',
})
@Index('idx_tasks_milestone', ['organizationId', 'projectId', 'milestoneId'], {
  where: 'milestone_id IS NOT NULL',
})
export class TaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'owning_team_id', type: 'uuid' })
  owningTeamId!: string;

  @Column({ name: 'status_id', type: 'uuid' })
  statusId!: string;

  @Column({ name: 'creator_project_membership_id', type: 'uuid' })
  creatorProjectMembershipId!: string;

  @Column({ name: 'milestone_id', type: 'uuid', nullable: true })
  milestoneId!: string | null;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ name: 'priority_code', type: 'varchar', length: 32 })
  priorityCode!: string;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'manual_progress', type: 'smallint', default: 0 })
  manualProgress!: number;

  @Column({ name: 'requires_approval', type: 'boolean', default: false })
  requiresApproval!: boolean;

  @Column({
    name: 'approver_project_membership_id',
    type: 'uuid',
    nullable: true,
  })
  approverProjectMembershipId!: string | null;

  @Column({ type: 'bigint', default: 0 })
  version!: string;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'task_assignees' })
@Index('idx_task_assignees_my_tasks', [
  'organizationId',
  'projectMembershipId',
  'removedAt',
  'taskId',
])
@Index('idx_task_assignees_task_detail', [
  'organizationId',
  'projectId',
  'taskId',
  'removedAt',
])
export class TaskAssigneeEntity {
  @PrimaryColumn({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @PrimaryColumn({ name: 'project_membership_id', type: 'uuid' })
  projectMembershipId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'assigned_by_project_membership_id', type: 'uuid' })
  assignedByProjectMembershipId!: string;

  @Column({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt!: Date | null;
}

@Entity({ name: 'task_checklist_items' })
@Check('chk_task_checklist_items_position_nonnegative', 'position >= 0')
@Check(
  'chk_task_checklist_items_completion_pair',
  '(completed_at IS NULL) = (completed_by_project_membership_id IS NULL)',
)
@Index('uq_task_checklist_items_active_position', ['taskId', 'position'], {
  unique: true,
  where: 'removed_at IS NULL',
})
@Index('idx_task_checklist_items_task', [
  'organizationId',
  'projectId',
  'taskId',
  'removedAt',
  'position',
])
export class TaskChecklistItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'integer' })
  position!: number;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({
    name: 'completed_by_project_membership_id',
    type: 'uuid',
    nullable: true,
  })
  completedByProjectMembershipId!: string | null;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'task_approval_requests' })
@Check('chk_task_approval_requests_number', 'request_number > 0')
@Check(
  'chk_task_approval_requests_resolution',
  "(state = 'PENDING' AND resolved_by_membership_id IS NULL AND resolved_at IS NULL) OR (state <> 'PENDING' AND resolved_by_membership_id IS NOT NULL AND resolved_at IS NOT NULL)",
)
@Check(
  'chk_task_approval_requests_reason',
  "state NOT IN ('REJECTED', 'CANCELLED') OR length(btrim(resolution_reason)) > 0",
)
@Index('uq_task_approval_requests_number', ['taskId', 'requestNumber'], {
  unique: true,
})
@Index('uq_task_approval_requests_pending', ['taskId'], {
  unique: true,
  where: "state = 'PENDING'",
})
@Index('uq_task_approval_requests_idempotency', ['taskId', 'idempotencyKey'], {
  unique: true,
  where: 'idempotency_key IS NOT NULL',
})
@Index('idx_task_approval_requests_queue', [
  'organizationId',
  'projectId',
  'approverProjectMembershipId',
  'state',
  'requestedAt',
])
@Index('idx_task_approval_requests_history', ['taskId', 'requestNumber'])
export class ApprovalRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @Column({ name: 'request_number', type: 'integer' })
  requestNumber!: number;

  @Column({ name: 'requested_by_membership_id', type: 'uuid' })
  requestedByMembershipId!: string;

  @Column({ name: 'approver_project_membership_id', type: 'uuid' })
  approverProjectMembershipId!: string;

  @Column({
    type: 'enum',
    enum: ApprovalRequestState,
    enumName: 'approval_request_state',
  })
  state!: ApprovalRequestState;

  @Column({ name: 'request_reason', type: 'text', nullable: true })
  requestReason!: string | null;

  @Column({ name: 'resolution_reason', type: 'text', nullable: true })
  resolutionReason!: string | null;

  @Column({ name: 'resolved_by_membership_id', type: 'uuid', nullable: true })
  resolvedByMembershipId!: string | null;

  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt!: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'idempotency_key', type: 'text', nullable: true })
  idempotencyKey!: string | null;
}

@Entity({ name: 'comments' })
@Index('idx_comments_timeline', [
  'organizationId',
  'projectId',
  'taskId',
  'createdAt',
])
export class CommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @Column({ name: 'author_project_membership_id', type: 'uuid' })
  authorProjectMembershipId!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'deleted_by_membership_id', type: 'uuid', nullable: true })
  deletedByMembershipId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
