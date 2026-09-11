import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Technical prerequisites shared by capability-owned schema migrations.
 *
 * This migration intentionally creates no business tables. The capability that
 * introduces a table owns its columns, constraints, and indexes.
 */
export class EnablePostgresExtensions20260904000000 implements MigrationInterface {
  name = 'EnablePostgresExtensions20260904000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "citext"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS "citext"');
    await queryRunner.query('DROP EXTENSION IF EXISTS "pgcrypto"');
  }
}
