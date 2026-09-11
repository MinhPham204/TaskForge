import type { MigrationInterface, QueryRunner } from 'typeorm';

/** P5 collaboration, governance and file-metadata persistence foundation. */
export class CreateCollaborationFilesSchema20260909000000 implements MigrationInterface {
  name = 'CreateCollaborationFilesSchema20260909000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE stored_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        storage_provider_code varchar(32) NOT NULL,
        object_key text NOT NULL,
        original_name text NOT NULL,
        media_type text NULL,
        size_bytes bigint NOT NULL,
        checksum_sha256 text NULL,
        uploaded_by_membership_id uuid NOT NULL,
        deleted_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_stored_files_organization_id UNIQUE (organization_id, id),
        CONSTRAINT uq_stored_files_provider_object UNIQUE (storage_provider_code, object_key),
        CONSTRAINT chk_stored_files_size_nonnegative CHECK (size_bytes >= 0),
        CONSTRAINT fk_stored_files_uploader_same_organization
          FOREIGN KEY (organization_id, uploaded_by_membership_id)
          REFERENCES organization_memberships (organization_id, id) ON DELETE RESTRICT
      );

      CREATE TABLE task_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        task_id uuid NOT NULL,
        stored_file_id uuid NOT NULL,
        attached_by_project_membership_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        removed_at timestamptz NULL,
        CONSTRAINT fk_task_attachments_task_same_project
          FOREIGN KEY (organization_id, project_id, task_id)
          REFERENCES tasks (organization_id, project_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_task_attachments_file_same_organization
          FOREIGN KEY (organization_id, stored_file_id)
          REFERENCES stored_files (organization_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_task_attachments_actor_same_project
          FOREIGN KEY (organization_id, project_id, attached_by_project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX uq_task_attachments_active_file
        ON task_attachments (task_id, stored_file_id) WHERE removed_at IS NULL;

      CREATE TABLE project_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        stored_file_id uuid NOT NULL,
        added_by_project_membership_id uuid NOT NULL,
        display_name text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        removed_at timestamptz NULL,
        CONSTRAINT fk_project_files_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_project_files_file_same_organization
          FOREIGN KEY (organization_id, stored_file_id)
          REFERENCES stored_files (organization_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_project_files_actor_same_project
          FOREIGN KEY (organization_id, project_id, added_by_project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX uq_project_files_active_file
        ON project_files (project_id, stored_file_id) WHERE removed_at IS NULL;

      CREATE TABLE activity_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NULL,
        actor_membership_id uuid NULL,
        action_code varchar(64) NOT NULL,
        subject_type varchar(64) NOT NULL,
        subject_id uuid NULL,
        safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        source_event_id uuid NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_activity_entries_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_activity_entries_actor_same_organization
          FOREIGN KEY (organization_id, actor_membership_id)
          REFERENCES organization_memberships (organization_id, id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX uq_activity_entries_source_event
        ON activity_entries (organization_id, source_event_id) WHERE source_event_id IS NOT NULL;
      CREATE INDEX idx_activity_entries_timeline
        ON activity_entries (organization_id, project_id, occurred_at DESC);

      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NULL,
        project_id uuid NULL,
        actor_user_id uuid NULL,
        actor_membership_id uuid NULL,
        action_code varchar(96) NOT NULL,
        target_type varchar(64) NOT NULL,
        target_id uuid NULL,
        outcome_code varchar(32) NOT NULL,
        reason text NULL,
        before_data jsonb NULL,
        after_data jsonb NULL,
        correlation_id uuid NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_audit_logs_tenant_context CHECK (
          organization_id IS NOT NULL OR (project_id IS NULL AND actor_membership_id IS NULL)
        ),
        CONSTRAINT fk_audit_logs_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_audit_logs_actor_user
          FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_audit_logs_actor_membership_same_organization
          FOREIGN KEY (organization_id, actor_membership_id)
          REFERENCES organization_memberships (organization_id, id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_audit_logs_organization_timeline
        ON audit_logs (organization_id, occurred_at DESC);
      CREATE INDEX idx_audit_logs_project_timeline
        ON audit_logs (organization_id, project_id, occurred_at DESC);
      CREATE INDEX idx_audit_logs_actor_timeline
        ON audit_logs (actor_user_id, occurred_at DESC);
      CREATE INDEX idx_audit_logs_target_timeline
        ON audit_logs (target_type, target_id, occurred_at DESC);

      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NULL,
        recipient_user_id uuid NOT NULL,
        type_code varchar(64) NOT NULL,
        resource_type varchar(64) NULL,
        resource_id uuid NULL,
        safe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        delivery_state_code varchar(32) NOT NULL,
        deduplication_key text NULL,
        read_at timestamptz NULL,
        delivered_at timestamptz NULL,
        failed_at timestamptz NULL,
        expires_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_notifications_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_notifications_recipient_user
          FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX uq_notifications_recipient_deduplication
        ON notifications (organization_id, recipient_user_id, deduplication_key)
        WHERE deduplication_key IS NOT NULL;
      CREATE INDEX idx_notifications_inbox
        ON notifications (organization_id, recipient_user_id, read_at, created_at DESC);
      CREATE INDEX idx_notifications_delivery
        ON notifications (delivery_state_code, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE notifications;
      DROP TABLE audit_logs;
      DROP TABLE activity_entries;
      DROP TABLE project_files;
      DROP TABLE task_attachments;
      DROP TABLE stored_files;
    `);
  }
}
