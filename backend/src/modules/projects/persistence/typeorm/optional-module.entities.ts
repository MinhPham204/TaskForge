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

export enum MilestoneStatusCode {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum RiskScaleCode {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum RiskState {
  OPEN = 'OPEN',
  MITIGATING = 'MITIGATING',
  RESOLVED = 'RESOLVED',
}

@Entity({ name: 'milestones' })
@Check('chk_milestones_status_code', "status_code IN ('OPEN', 'CLOSED')")
@Check(
  'chk_milestones_closed_at',
  "(status_code = 'OPEN' AND closed_at IS NULL) OR (status_code = 'CLOSED' AND closed_at IS NOT NULL)",
)
@Index('uq_milestones_organization_project_id', ['organizationId', 'projectId', 'id'], {
  unique: true,
})
@Index('idx_milestones_project_archived_due', [
  'organizationId',
  'projectId',
  'archivedAt',
  'dueDate',
])
export class MilestoneEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @Column({ type: 'text' }) name!: string;
  @Column({ type: 'text', default: '' }) description!: string;
  @Column({ name: 'status_code', type: 'varchar', length: 32 }) statusCode!: MilestoneStatusCode;
  @Column({ name: 'due_date', type: 'date' }) dueDate!: string;
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true }) closedAt!: Date | null;
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true }) archivedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'documents' })
@Index('uq_documents_organization_project_id', ['organizationId', 'projectId', 'id'], {
  unique: true,
})
@Index('idx_documents_project_archived_updated', [
  'organizationId',
  'projectId',
  'archivedAt',
  'updatedAt',
])
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @Column({ type: 'text' }) title!: string;
  @Column({ type: 'text' }) content!: string;
  @Column({ name: 'author_project_membership_id', type: 'uuid' }) authorProjectMembershipId!: string;
  @Column({ name: 'last_edited_by_project_membership_id', type: 'uuid' }) lastEditedByProjectMembershipId!: string;
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true }) archivedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'risks' })
@Check('chk_risks_likelihood_code', "likelihood_code IN ('LOW', 'MEDIUM', 'HIGH')")
@Check('chk_risks_impact_code', "impact_code IN ('LOW', 'MEDIUM', 'HIGH')")
@Index('uq_risks_organization_project_id', ['organizationId', 'projectId', 'id'], {
  unique: true,
})
@Index('idx_risks_project_state_archived', ['organizationId', 'projectId', 'state', 'archivedAt'])
@Index('idx_risks_project_owner_archived', ['organizationId', 'projectId', 'ownerProjectMembershipId', 'archivedAt'])
export class RiskEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @Column({ type: 'text' }) title!: string;
  @Column({ type: 'text', default: '' }) description!: string;
  @Column({ name: 'likelihood_code', type: 'varchar', length: 32 }) likelihoodCode!: RiskScaleCode;
  @Column({ name: 'impact_code', type: 'varchar', length: 32 }) impactCode!: RiskScaleCode;
  @Column({ name: 'owner_project_membership_id', type: 'uuid' }) ownerProjectMembershipId!: string;
  @Column({ type: 'text', default: '' }) mitigation!: string;
  @Column({ type: 'enum', enum: RiskState, enumName: 'risk_state' }) state!: RiskState;
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true }) archivedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'risk_task_links' })
export class RiskTaskLinkEntity {
  @PrimaryColumn({ name: 'risk_id', type: 'uuid' }) riskId!: string;
  @PrimaryColumn({ name: 'task_id', type: 'uuid' }) taskId!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
