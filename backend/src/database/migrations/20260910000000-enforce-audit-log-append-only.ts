import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Prevent application or operational mistakes from rewriting governance history. */
export class EnforceAuditLogAppendOnly20260910000000 implements MigrationInterface {
  name = 'EnforceAuditLogAppendOnly20260910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs are append-only';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_audit_logs_append_only
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON audit_logs;
      DROP FUNCTION IF EXISTS prevent_audit_log_mutation();
    `);
  }
}
