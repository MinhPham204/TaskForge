import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSelectiveOutbox20260916000000 implements MigrationInterface {
  name = 'CreateSelectiveOutbox20260916000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE outbox_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        event_type varchar(64) NOT NULL,
        aggregate_id uuid NOT NULL,
        payload jsonb NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'PENDING',
        attempts integer NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL DEFAULT now(),
        claimed_at timestamptz NULL,
        published_at timestamptz NULL,
        processed_at timestamptz NULL,
        last_error text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_outbox_event_type CHECK (event_type IN ('ORGANIZATION_INVITATION_CREATED', 'TASK_APPROVAL_REQUESTED')),
        CONSTRAINT chk_outbox_status CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'PROCESSED', 'FAILED')),
        CONSTRAINT chk_outbox_attempts_nonnegative CHECK (attempts >= 0),
        CONSTRAINT uq_outbox_event_aggregate UNIQUE (event_type, aggregate_id)
      );
      CREATE INDEX idx_outbox_ready ON outbox_events (available_at, created_at)
        WHERE status IN ('PENDING', 'FAILED');
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE outbox_events');
  }
}
