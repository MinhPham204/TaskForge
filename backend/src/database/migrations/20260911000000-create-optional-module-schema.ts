import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOptionalModuleSchema20260911000000 implements MigrationInterface {
  name = 'CreateOptionalModuleSchema20260911000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE risk_state AS ENUM ('OPEN', 'MITIGATING', 'RESOLVED');

      CREATE TABLE milestones (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        status_code varchar(32) NOT NULL,
        due_date date NOT NULL,
        closed_at timestamptz NULL,
        archived_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_milestones_status_code
          CHECK (status_code IN ('OPEN', 'CLOSED')),
        CONSTRAINT chk_milestones_closed_at
          CHECK (
            (status_code = 'OPEN' AND closed_at IS NULL) OR
            (status_code = 'CLOSED' AND closed_at IS NOT NULL)
          ),
        CONSTRAINT uq_milestones_organization_project_id
          UNIQUE (organization_id, project_id, id),
        CONSTRAINT fk_milestones_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id)
          ON DELETE RESTRICT
      );
      CREATE INDEX idx_milestones_project_archived_due
        ON milestones (organization_id, project_id, archived_at, due_date);

      ALTER TABLE tasks
        ADD CONSTRAINT fk_tasks_milestone_same_project
        FOREIGN KEY (organization_id, project_id, milestone_id)
        REFERENCES milestones (organization_id, project_id, id)
        ON DELETE RESTRICT;

      CREATE TABLE documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        title text NOT NULL,
        content text NOT NULL,
        author_project_membership_id uuid NOT NULL,
        last_edited_by_project_membership_id uuid NOT NULL,
        archived_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_documents_organization_project_id
          UNIQUE (organization_id, project_id, id),
        CONSTRAINT fk_documents_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_documents_author_same_project
          FOREIGN KEY (organization_id, project_id, author_project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_documents_last_editor_same_project
          FOREIGN KEY (organization_id, project_id, last_edited_by_project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id)
          ON DELETE RESTRICT
      );
      CREATE INDEX idx_documents_project_archived_updated
        ON documents (organization_id, project_id, archived_at, updated_at DESC);

      CREATE TABLE risks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        likelihood_code varchar(32) NOT NULL,
        impact_code varchar(32) NOT NULL,
        owner_project_membership_id uuid NOT NULL,
        mitigation text NOT NULL DEFAULT '',
        state risk_state NOT NULL,
        archived_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_risks_likelihood_code
          CHECK (likelihood_code IN ('LOW', 'MEDIUM', 'HIGH')),
        CONSTRAINT chk_risks_impact_code
          CHECK (impact_code IN ('LOW', 'MEDIUM', 'HIGH')),
        CONSTRAINT uq_risks_organization_project_id
          UNIQUE (organization_id, project_id, id),
        CONSTRAINT fk_risks_project_same_organization
          FOREIGN KEY (organization_id, project_id)
          REFERENCES projects (organization_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_risks_owner_same_project
          FOREIGN KEY (organization_id, project_id, owner_project_membership_id)
          REFERENCES project_memberships (organization_id, project_id, id)
          ON DELETE RESTRICT
      );
      CREATE INDEX idx_risks_project_state_archived
        ON risks (organization_id, project_id, state, archived_at);
      CREATE INDEX idx_risks_project_owner_archived
        ON risks (organization_id, project_id, owner_project_membership_id, archived_at);

      CREATE TABLE risk_task_links (
        organization_id uuid NOT NULL,
        project_id uuid NOT NULL,
        risk_id uuid NOT NULL,
        task_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (risk_id, task_id),
        CONSTRAINT fk_risk_task_links_risk_same_project
          FOREIGN KEY (organization_id, project_id, risk_id)
          REFERENCES risks (organization_id, project_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_risk_task_links_task_same_project
          FOREIGN KEY (organization_id, project_id, task_id)
          REFERENCES tasks (organization_id, project_id, id)
          ON DELETE RESTRICT
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tasks DROP CONSTRAINT fk_tasks_milestone_same_project;
      DROP TABLE risk_task_links;
      DROP TABLE risks;
      DROP TABLE documents;
      DROP TABLE milestones;
      DROP TYPE risk_state;
    `);
  }
}
