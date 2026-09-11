import type { MigrationInterface, QueryRunner } from 'typeorm';

/** P4 Task aggregate, execution children, comments and immutable approval cycles. */
export class CreateTaskSchema20260908000000 implements MigrationInterface {
  name = 'CreateTaskSchema20260908000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE approval_request_state AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

      CREATE TABLE tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        owning_team_id uuid NOT NULL,
        status_id uuid NOT NULL,
        creator_project_membership_id uuid NOT NULL,
        milestone_id uuid NULL,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        priority_code varchar(32) NOT NULL,
        due_at timestamptz NULL,
        manual_progress smallint NOT NULL DEFAULT 0,
        requires_approval boolean NOT NULL DEFAULT false,
        approver_project_membership_id uuid NULL,
        version bigint NOT NULL DEFAULT 0,
        archived_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_tasks_organization_project_id UNIQUE (organization_id, project_id, id),
        CONSTRAINT chk_tasks_manual_progress_range CHECK (manual_progress BETWEEN 0 AND 100),
        CONSTRAINT chk_tasks_approval_configuration CHECK (
          (requires_approval AND approver_project_membership_id IS NOT NULL)
          OR (NOT requires_approval AND approver_project_membership_id IS NULL)
        ),
        CONSTRAINT fk_tasks_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_tasks_owning_team_same_project
          FOREIGN KEY (organization_id, project_id, owning_team_id)
          REFERENCES project_teams (organization_id, project_id, team_id) ON DELETE RESTRICT,
        CONSTRAINT fk_tasks_status_same_project
          FOREIGN KEY (organization_id, project_id, status_id)
          REFERENCES project_task_statuses (organization_id, project_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_tasks_creator_same_project
          FOREIGN KEY (organization_id, project_id, creator_project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_tasks_approver_same_project
          FOREIGN KEY (organization_id, project_id, approver_project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_tasks_board
        ON tasks (organization_id, project_id, status_id, archived_at, created_at DESC);
      CREATE INDEX idx_tasks_project_team_due
        ON tasks (organization_id, project_id, owning_team_id, archived_at, due_at);
      CREATE INDEX idx_tasks_due_at_active
        ON tasks (organization_id, due_at)
        WHERE archived_at IS NULL AND due_at IS NOT NULL;
      CREATE INDEX idx_tasks_milestone
        ON tasks (organization_id, project_id, milestone_id)
        WHERE milestone_id IS NOT NULL;

      CREATE TABLE task_assignees (
        task_id uuid NOT NULL,
        project_membership_id uuid NOT NULL,
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        assigned_by_project_membership_id uuid NOT NULL,
        assigned_at timestamptz NOT NULL DEFAULT now(),
        removed_at timestamptz NULL,
        PRIMARY KEY (task_id, project_membership_id),
        CONSTRAINT fk_task_assignees_task_same_project
          FOREIGN KEY (organization_id, project_id, task_id)
          REFERENCES tasks (organization_id, project_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_task_assignees_assignee_same_project
          FOREIGN KEY (organization_id, project_id, project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_task_assignees_actor_same_project
          FOREIGN KEY (organization_id, project_id, assigned_by_project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_task_assignees_my_tasks
        ON task_assignees (organization_id, project_membership_id, removed_at, task_id);
      CREATE INDEX idx_task_assignees_task_detail
        ON task_assignees (organization_id, project_id, task_id, removed_at);

      CREATE TABLE task_checklist_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        task_id uuid NOT NULL,
        text text NOT NULL,
        position integer NOT NULL,
        completed_at timestamptz NULL,
        completed_by_project_membership_id uuid NULL,
        removed_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_task_checklist_items_position_nonnegative CHECK (position >= 0),
        CONSTRAINT chk_task_checklist_items_completion_pair CHECK (
          (completed_at IS NULL) = (completed_by_project_membership_id IS NULL)
        ),
        CONSTRAINT fk_task_checklist_items_task_same_project
          FOREIGN KEY (organization_id, project_id, task_id)
          REFERENCES tasks (organization_id, project_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_task_checklist_items_completer_same_project
          FOREIGN KEY (organization_id, project_id, completed_by_project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX uq_task_checklist_items_active_position
        ON task_checklist_items (task_id, position) WHERE removed_at IS NULL;
      CREATE INDEX idx_task_checklist_items_task
        ON task_checklist_items (organization_id, project_id, task_id, removed_at, position);

      CREATE TABLE task_approval_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        task_id uuid NOT NULL,
        request_number integer NOT NULL,
        requested_by_membership_id uuid NOT NULL,
        approver_project_membership_id uuid NOT NULL,
        state approval_request_state NOT NULL,
        request_reason text NULL,
        resolution_reason text NULL,
        resolved_by_membership_id uuid NULL,
        requested_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz NULL,
        idempotency_key text NULL,
        CONSTRAINT uq_task_approval_requests_number UNIQUE (task_id, request_number),
        CONSTRAINT chk_task_approval_requests_number CHECK (request_number > 0),
        CONSTRAINT chk_task_approval_requests_resolution CHECK (
          (state = 'PENDING' AND resolved_by_membership_id IS NULL AND resolved_at IS NULL)
          OR (state <> 'PENDING' AND resolved_by_membership_id IS NOT NULL AND resolved_at IS NOT NULL)
        ),
        CONSTRAINT chk_task_approval_requests_reason CHECK (
          state NOT IN ('REJECTED', 'CANCELLED') OR length(btrim(resolution_reason)) > 0
        ),
        CONSTRAINT fk_task_approval_requests_task_same_project
          FOREIGN KEY (organization_id, project_id, task_id)
          REFERENCES tasks (organization_id, project_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_task_approval_requests_approver_same_project
          FOREIGN KEY (organization_id, project_id, approver_project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_task_approval_requests_requester_same_organization
          FOREIGN KEY (organization_id, requested_by_membership_id)
          REFERENCES organization_memberships (organization_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_task_approval_requests_resolver_same_organization
          FOREIGN KEY (organization_id, resolved_by_membership_id)
          REFERENCES organization_memberships (organization_id, id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX uq_task_approval_requests_pending
        ON task_approval_requests (task_id) WHERE state = 'PENDING';
      CREATE UNIQUE INDEX uq_task_approval_requests_idempotency
        ON task_approval_requests (task_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX idx_task_approval_requests_queue
        ON task_approval_requests (organization_id, project_id, approver_project_membership_id, state, requested_at);
      CREATE INDEX idx_task_approval_requests_history
        ON task_approval_requests (task_id, request_number DESC);

      CREATE TABLE comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        task_id uuid NOT NULL,
        author_project_membership_id uuid NOT NULL,
        body text NOT NULL,
        edited_at timestamptz NULL,
        deleted_at timestamptz NULL,
        deleted_by_membership_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_comments_task_same_project
          FOREIGN KEY (organization_id, project_id, task_id)
          REFERENCES tasks (organization_id, project_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_comments_author_same_project
          FOREIGN KEY (organization_id, project_id, author_project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id) ON DELETE RESTRICT,
        CONSTRAINT fk_comments_deleter_same_organization
          FOREIGN KEY (organization_id, deleted_by_membership_id)
          REFERENCES organization_memberships (organization_id, id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_comments_timeline
        ON comments (organization_id, project_id, task_id, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE comments;
      DROP TABLE task_approval_requests;
      DROP TABLE task_checklist_items;
      DROP TABLE task_assignees;
      DROP TABLE tasks;
      DROP TYPE approval_request_state;
    `);
  }
}
