import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ProjectRole {
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  CONTRIBUTOR = 'CONTRIBUTOR',
}

export enum ProjectState {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export enum TaskStatusSemanticCategory {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ProjectModuleCode {
  MILESTONES = 'MILESTONES',
  DOCUMENTS = 'DOCUMENTS',
  FILES = 'FILES',
  RISKS = 'RISKS',
}

@Entity({ name: 'projects' })
@Index('uq_projects_organization_id', ['organizationId', 'id'], {
  unique: true,
})
@Index('idx_projects_organization_state_updated_at', [
  'organizationId',
  'state',
  'updatedAt',
])
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'enum', enum: ProjectState, enumName: 'project_state' })
  state!: ProjectState;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'created_by_membership_id', type: 'uuid' })
  createdByMembershipId!: string;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @Column({ type: 'bigint', default: 0 })
  version!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'project_teams' })
@Index(
  'uq_project_teams_organization_project_team',
  ['organizationId', 'projectId', 'teamId'],
  { unique: true },
)
export class ProjectTeamEntity {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @PrimaryColumn({ name: 'team_id', type: 'uuid' })
  teamId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'added_by_membership_id', type: 'uuid' })
  addedByMembershipId!: string;

  @Column({ name: 'added_at', type: 'timestamptz' })
  addedAt!: Date;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt!: Date | null;
}

@Entity({ name: 'project_memberships' })
@Index(
  'uq_project_memberships_project_organization_membership',
  ['projectId', 'organizationMembershipId'],
  { unique: true },
)
@Index(
  'uq_project_memberships_organization_project_id',
  ['organizationId', 'projectId', 'id'],
  { unique: true },
)
@Index('idx_project_memberships_project_removed_role', [
  'organizationId',
  'projectId',
  'removedAt',
  'role',
])
@Index('idx_project_memberships_membership_removed', [
  'organizationId',
  'organizationMembershipId',
  'removedAt',
])
export class ProjectMembershipEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'organization_membership_id', type: 'uuid' })
  organizationMembershipId!: string;

  @Column({ type: 'enum', enum: ProjectRole, enumName: 'project_role' })
  role!: ProjectRole;

  @Column({ name: 'added_at', type: 'timestamptz' })
  addedAt!: Date;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'project_task_statuses' })
@Index(
  'uq_project_task_statuses_organization_project_id',
  ['organizationId', 'projectId', 'id'],
  { unique: true },
)
@Index('uq_project_task_statuses_active_position', ['projectId', 'position'], {
  unique: true,
  where: '"archived_at" IS NULL',
})
@Index('idx_project_task_statuses_project_archived_position', [
  'organizationId',
  'projectId',
  'archivedAt',
  'position',
])
export class ProjectTaskStatusEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({
    name: 'semantic_category',
    type: 'enum',
    enum: TaskStatusSemanticCategory,
    enumName: 'task_status_semantic_category',
  })
  semanticCategory!: TaskStatusSemanticCategory;

  @Column({ type: 'integer' })
  position!: number;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @Column({ type: 'bigint', default: 0 })
  version!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'project_module_settings' })
export class ProjectModuleSettingEntity {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @PrimaryColumn({
    name: 'module_code',
    type: 'enum',
    enum: ProjectModuleCode,
    enumName: 'project_module_code',
  })
  moduleCode!: ProjectModuleCode;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'boolean' })
  enabled!: boolean;

  @Column({ type: 'bigint', default: 0 })
  version!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
