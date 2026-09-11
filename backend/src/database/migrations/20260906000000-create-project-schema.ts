import type { MigrationInterface, QueryRunner } from 'typeorm';

/** P3 project structure and relational participant/configuration constraints. */
export class CreateProjectSchema20260906000000 implements MigrationInterface {
  name = 'CreateProjectSchema20260906000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE project_role AS ENUM ('PROJECT_MANAGER', 'CONTRIBUTOR');
      CREATE TYPE project_state AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
      CREATE TYPE task_status_semantic_category AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED');
      CREATE TYPE project_module_code AS ENUM ('MILESTONES', 'DOCUMENTS', 'FILES', 'RISKS');

      CREATE TABLE projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        state project_state NOT NULL,
        start_date date NULL,
        due_date date NULL,
        created_by_membership_id uuid NOT NULL,
        completed_at timestamptz NULL,
        archived_at timestamptz NULL,
        version bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_projects_organization_id UNIQUE (organization_id, id),
        CONSTRAINT fk_projects_creator_same_organization
          FOREIGN KEY (organization_id, created_by_membership_id)
          REFERENCES organization_memberships (organization_id, id)
          ON DELETE RESTRICT
      );
      CREATE INDEX idx_projects_organization_state_updated_at
        ON projects (organization_id, state, updated_at DESC);

      CREATE TABLE project_teams (
        project_id uuid NOT NULL,
        team_id uuid NOT NULL,
        organization_id uuid NOT NULL,
        added_by_membership_id uuid NOT NULL,
        added_at timestamptz NOT NULL DEFAULT now(),
        removed_at timestamptz NULL,
        PRIMARY KEY (project_id, team_id),
        CONSTRAINT uq_project_teams_organization_project_team
          UNIQUE (organization_id, project_id, team_id),
        CONSTRAINT fk_project_teams_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_project_teams_team_same_organization
          FOREIGN KEY (organization_id, team_id)
          REFERENCES teams (organization_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_project_teams_actor_same_organization
          FOREIGN KEY (organization_id, added_by_membership_id)
          REFERENCES organization_memberships (organization_id, id)
          ON DELETE RESTRICT
      );

      CREATE TABLE project_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        organization_membership_id uuid NOT NULL,
        role project_role NOT NULL,
        added_at timestamptz NOT NULL DEFAULT now(),
        removed_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_project_memberships_project_organization_membership
          UNIQUE (project_id, organization_membership_id),
        CONSTRAINT uq_project_memberships_organization_project_id
          UNIQUE (organization_id, project_id, id),
        CONSTRAINT fk_project_memberships_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_project_memberships_membership_same_organization
          FOREIGN KEY (organization_id, organization_membership_id)
          REFERENCES organization_memberships (organization_id, id)
          ON DELETE RESTRICT
      );
      CREATE INDEX idx_project_memberships_project_removed_role
        ON project_memberships (organization_id, project_id, removed_at, role);
      CREATE INDEX idx_project_memberships_membership_removed
        ON project_memberships (organization_id, organization_membership_id, removed_at);

      CREATE TABLE project_task_statuses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        name text NOT NULL,
        semantic_category task_status_semantic_category NOT NULL,
        position integer NOT NULL,
        archived_at timestamptz NULL,
        version bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_project_task_statuses_position_nonnegative CHECK (position >= 0),
        CONSTRAINT uq_project_task_statuses_organization_project_id
          UNIQUE (organization_id, project_id, id),
        CONSTRAINT fk_project_task_statuses_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id)
          ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX uq_project_task_statuses_active_position
        ON project_task_statuses (project_id, position)
        WHERE archived_at IS NULL;
      CREATE INDEX idx_project_task_statuses_project_archived_position
        ON project_task_statuses (organization_id, project_id, archived_at, position);

      CREATE TABLE project_module_settings (
        project_id uuid NOT NULL,
        module_code project_module_code NOT NULL,
        organization_id uuid NOT NULL,
        enabled boolean NOT NULL,
        version bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, module_code),
        CONSTRAINT fk_project_module_settings_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id)
          ON DELETE RESTRICT
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE project_module_settings;
      DROP TABLE project_task_statuses;
      DROP TABLE project_memberships;
      DROP TABLE project_teams;
      DROP TABLE projects;
      DROP TYPE project_module_code;
      DROP TYPE task_status_semantic_category;
      DROP TYPE project_state;
      DROP TYPE project_role;
    `);
  }
}
