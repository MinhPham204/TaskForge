import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Global, user-owned presentation and in-app delivery preferences. */
export class CreateUserPreferences20260913000000 implements MigrationInterface {
  name = 'CreateUserPreferences20260913000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE user_preferences (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
        timezone varchar(64) NOT NULL DEFAULT 'UTC',
        locale varchar(35) NOT NULL DEFAULT 'en-US',
        week_starts_on smallint NOT NULL DEFAULT 1,
        in_app_notifications_enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_user_preferences_week_starts_on CHECK (week_starts_on IN (0, 1))
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE user_preferences');
  }
}
