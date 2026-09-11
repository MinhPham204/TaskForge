import type { MigrationInterface, QueryRunner } from 'typeorm';

/** P3-02: Team names are unique inside an Organization, including archives. */
export class EnforceTeamNameUniqueness20260907000000 implements MigrationInterface {
  name = 'EnforceTeamNameUniqueness20260907000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE teams ADD CONSTRAINT uq_teams_organization_name UNIQUE (organization_id, name)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE teams DROP CONSTRAINT uq_teams_organization_name',
    );
  }
}
