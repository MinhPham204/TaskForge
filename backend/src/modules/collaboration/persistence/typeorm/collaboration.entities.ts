import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'stored_files' })
@Check('chk_stored_files_size_nonnegative', 'size_bytes >= 0')
@Index('uq_stored_files_organization_id', ['organizationId', 'id'], { unique: true })
@Index('uq_stored_files_provider_object', ['storageProviderCode', 'objectKey'], { unique: true })
export class StoredFileEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ name: 'storage_provider_code', type: 'varchar', length: 32 }) storageProviderCode!: string;
  @Column({ name: 'object_key', type: 'text' }) objectKey!: string;
  @Column({ name: 'original_name', type: 'text' }) originalName!: string;
  @Column({ name: 'media_type', type: 'text', nullable: true }) mediaType!: string | null;
  @Column({ name: 'size_bytes', type: 'bigint' }) sizeBytes!: string;
  @Column({ name: 'checksum_sha256', type: 'text', nullable: true }) checksumSha256!: string | null;
  @Column({ name: 'uploaded_by_membership_id', type: 'uuid' }) uploadedByMembershipId!: string;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'task_attachments' })
@Index('uq_task_attachments_active_file', ['taskId', 'storedFileId'], { unique: true, where: 'removed_at IS NULL' })
export class TaskAttachmentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @Column({ name: 'task_id', type: 'uuid' }) taskId!: string;
  @Column({ name: 'stored_file_id', type: 'uuid' }) storedFileId!: string;
  @Column({ name: 'attached_by_project_membership_id', type: 'uuid' }) attachedByProjectMembershipId!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true }) removedAt!: Date | null;
}

@Entity({ name: 'project_files' })
@Index('uq_project_files_active_file', ['projectId', 'storedFileId'], { unique: true, where: 'removed_at IS NULL' })
export class ProjectFileEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @Column({ name: 'stored_file_id', type: 'uuid' }) storedFileId!: string;
  @Column({ name: 'added_by_project_membership_id', type: 'uuid' }) addedByProjectMembershipId!: string;
  @Column({ name: 'display_name', type: 'text', nullable: true }) displayName!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true }) removedAt!: Date | null;
}

@Entity({ name: 'activity_entries' })
@Index('uq_activity_entries_source_event', ['organizationId', 'sourceEventId'], { unique: true, where: 'source_event_id IS NOT NULL' })
@Index('idx_activity_entries_timeline', ['organizationId', 'projectId', 'occurredAt'])
export class ActivityEntryEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ name: 'project_id', type: 'uuid', nullable: true }) projectId!: string | null;
  @Column({ name: 'actor_membership_id', type: 'uuid', nullable: true }) actorMembershipId!: string | null;
  @Column({ name: 'action_code', type: 'varchar', length: 64 }) actionCode!: string;
  @Column({ name: 'subject_type', type: 'varchar', length: 64 }) subjectType!: string;
  @Column({ name: 'subject_id', type: 'uuid', nullable: true }) subjectId!: string | null;
  @Column({ name: 'safe_metadata', type: 'jsonb', default: () => "'{}'::jsonb" }) safeMetadata!: Record<string, unknown>;
  @Column({ name: 'source_event_id', type: 'uuid', nullable: true }) sourceEventId!: string | null;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
}

@Entity({ name: 'audit_logs' })
@Check('chk_audit_logs_tenant_context', 'organization_id IS NOT NULL OR (project_id IS NULL AND actor_membership_id IS NULL)')
@Index('idx_audit_logs_organization_timeline', ['organizationId', 'occurredAt'])
@Index('idx_audit_logs_project_timeline', ['organizationId', 'projectId', 'occurredAt'])
@Index('idx_audit_logs_actor_timeline', ['actorUserId', 'occurredAt'])
@Index('idx_audit_logs_target_timeline', ['targetType', 'targetId', 'occurredAt'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid', nullable: true }) organizationId!: string | null;
  @Column({ name: 'project_id', type: 'uuid', nullable: true }) projectId!: string | null;
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId!: string | null;
  @Column({ name: 'actor_membership_id', type: 'uuid', nullable: true }) actorMembershipId!: string | null;
  @Column({ name: 'action_code', type: 'varchar', length: 96 }) actionCode!: string;
  @Column({ name: 'target_type', type: 'varchar', length: 64 }) targetType!: string;
  @Column({ name: 'target_id', type: 'uuid', nullable: true }) targetId!: string | null;
  @Column({ name: 'outcome_code', type: 'varchar', length: 32 }) outcomeCode!: string;
  @Column({ type: 'text', nullable: true }) reason!: string | null;
  @Column({ name: 'before_data', type: 'jsonb', nullable: true }) beforeData!: Record<string, unknown> | null;
  @Column({ name: 'after_data', type: 'jsonb', nullable: true }) afterData!: Record<string, unknown> | null;
  @Column({ name: 'correlation_id', type: 'uuid', nullable: true }) correlationId!: string | null;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
}

@Entity({ name: 'notifications' })
@Index('uq_notifications_recipient_deduplication', ['organizationId', 'recipientUserId', 'deduplicationKey'], { unique: true, where: 'deduplication_key IS NOT NULL' })
@Index('idx_notifications_inbox', ['organizationId', 'recipientUserId', 'readAt', 'createdAt'])
@Index('idx_notifications_delivery', ['deliveryStateCode', 'createdAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ name: 'project_id', type: 'uuid', nullable: true }) projectId!: string | null;
  @Column({ name: 'recipient_user_id', type: 'uuid' }) recipientUserId!: string;
  @Column({ name: 'type_code', type: 'varchar', length: 64 }) typeCode!: string;
  @Column({ name: 'resource_type', type: 'varchar', length: 64, nullable: true }) resourceType!: string | null;
  @Column({ name: 'resource_id', type: 'uuid', nullable: true }) resourceId!: string | null;
  @Column({ name: 'safe_payload', type: 'jsonb', default: () => "'{}'::jsonb" }) safePayload!: Record<string, unknown>;
  @Column({ name: 'delivery_state_code', type: 'varchar', length: 32 }) deliveryStateCode!: string;
  @Column({ name: 'deduplication_key', type: 'text', nullable: true }) deduplicationKey!: string | null;
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true }) readAt!: Date | null;
  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true }) deliveredAt!: Date | null;
  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true }) failedAt!: Date | null;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
