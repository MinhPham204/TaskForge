import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';
import { createPostgresDataSourceOptions } from '../src/database/data-source.options';
import { requirePostgresTestUrl } from '../src/testing/database-test.config';
import { PrepareOrganizationRbac20260917000000 } from '../src/database/migrations/20260917000000-prepare-organization-rbac';
import { CutoverOrganizationRbac20260918000000 } from '../src/database/migrations/20260918000000-cutover-organization-rbac';

describe('P11 RBAC upgrade and rollback from enum schema', () => {
  let db: DataSource, runner: QueryRunner, schema: string;
  const prepare = new PrepareOrganizationRbac20260917000000(), cutover = new CutoverOrganizationRbac20260918000000();
  beforeAll(async () => {
    const options = createPostgresDataSourceOptions({ ...process.env, DATABASE_URL: requirePostgresTestUrl(process.env), MIGRATION_DATABASE_URL: undefined, DATABASE_SSL: 'false' });
    db = await new DataSource({ ...options, entities: [] }).initialize();
  });
  beforeEach(async () => {
    schema = `p11_migration_${randomUUID().replace(/-/g, '')}`;
    runner = db.createQueryRunner(); await runner.connect();
    await runner.query(`CREATE SCHEMA "${schema}"`); await runner.query(`SET search_path TO "${schema}", public`);
    for (const migration of db.migrations.filter((item) => Number(item.name!.match(/\d{14}$/)?.[0]) < 20260917000000 && !item.name!.startsWith('EnablePostgresExtensions')).sort((a, b) => Number(a.name!.match(/\d{14}$/)?.[0]) - Number(b.name!.match(/\d{14}$/)?.[0]))) await migration.up(runner);
    await runner.query(`INSERT INTO users(id,email,name,password_hash) VALUES ('00000000-0000-4000-8000-000000000001','legacy-owner@example.test','Legacy Owner','fixture'),('00000000-0000-4000-8000-000000000002','legacy-admin@example.test','Legacy Admin','fixture');
      INSERT INTO organizations(id,name) VALUES ('10000000-0000-4000-8000-000000000001','Legacy A'),('10000000-0000-4000-8000-000000000002','Legacy B');
      INSERT INTO organization_memberships(id,organization_id,user_id,role,state) VALUES
      ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','OWNER','ACTIVE'),
      ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','OWNER','ACTIVE'),
      ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','ADMIN','SUSPENDED');
      INSERT INTO organization_invitations(organization_id,email,invited_role,invited_by_membership_id,token_hash,expires_at) VALUES
      ('10000000-0000-4000-8000-000000000001','legacy-invitation@example.test','ADMIN','20000000-0000-4000-8000-000000000001','fixture',now()+interval '1 day');`);
  });
  afterEach(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner) { await runner.query('SET search_path TO public'); await runner.query(`DROP SCHEMA "${schema}" CASCADE`); await runner.release(); }
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
  async function transaction(work: () => Promise<void>) {
    await runner.startTransaction();
    try { await work(); await runner.commitTransaction(); }
    catch (error) { if (runner.isTransactionActive) await runner.rollbackTransaction(); throw error; }
  }
  it('backfills all roles/invitations/owners, enforces tenant/Owner integrity and drops enum authority', async () => {
    await transaction(() => prepare.up(runner));
    const mappings = await runner.query(`SELECT m.role::text legacy, r.system_code FROM organization_memberships m JOIN organization_roles r ON r.id=m.role_id`);
    expect(mappings).toHaveLength(3); expect(mappings.every((row: { legacy: string; system_code: string }) => row.legacy === row.system_code)).toBe(true);
    const grants = await runner.query(`SELECT r.system_code, count(p.permission_code)::int grants FROM organization_roles r LEFT JOIN organization_role_permissions p ON p.role_id=r.id GROUP BY r.id ORDER BY r.system_code`);
    expect(grants.filter((row: { system_code: string; grants: number }) => row.system_code === 'ADMIN').map((row: { grants: number }) => row.grants)).toEqual([13, 13]);
    expect(grants.filter((row: { system_code: string; grants: number }) => row.system_code === 'MEMBER').every((row: { grants: number }) => row.grants === 0)).toBe(true);
    expect((await runner.query(`SELECT r.system_code FROM organization_invitations i JOIN organization_roles r ON r.id=i.role_id`))[0].system_code).toBe('ADMIN');
    expect((await runner.query('SELECT owner_membership_id FROM organizations')).every((row: { owner_membership_id: string }) => !!row.owner_membership_id)).toBe(true);
    await transaction(() => cutover.up(runner));
    expect(await runner.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND ((table_name='organization_memberships' AND column_name='role') OR (table_name='organization_invitations' AND column_name='invited_role'))`, [schema])).toHaveLength(0);
    await expect(transaction(async () => { await runner.query(`UPDATE organization_memberships SET role_id=(SELECT id FROM organization_roles WHERE organization_id='10000000-0000-4000-8000-000000000002' AND system_code='MEMBER') WHERE id='20000000-0000-4000-8000-000000000003'`); })).rejects.toThrow();
    await expect(transaction(async () => { await runner.query(`UPDATE organization_memberships SET state='SUSPENDED' WHERE id='20000000-0000-4000-8000-000000000001'`); })).rejects.toThrow();
    await expect(transaction(async () => { await runner.query(`UPDATE organizations SET owner_membership_id='20000000-0000-4000-8000-000000000002' WHERE id='10000000-0000-4000-8000-000000000001'`); })).rejects.toThrow();
  });
  it('rolls cutover back to a working compatibility bridge and upgrades again', async () => {
    await transaction(() => prepare.up(runner)); await transaction(() => cutover.up(runner));
    await transaction(() => cutover.down(runner));
    await transaction(async () => { await runner.query(`UPDATE organization_memberships SET role='MEMBER' WHERE id='20000000-0000-4000-8000-000000000003'`); });
    expect((await runner.query(`SELECT r.system_code FROM organization_memberships m JOIN organization_roles r ON r.id=m.role_id WHERE m.id='20000000-0000-4000-8000-000000000003'`))[0].system_code).toBe('MEMBER');
    await transaction(() => cutover.up(runner));
    await runner.query(`INSERT INTO organization_roles(organization_id,name) VALUES ('10000000-0000-4000-8000-000000000001','Custom rollback blocker')`);
    await expect(transaction(() => cutover.down(runner))).rejects.toThrow('Cannot restore enum Organization roles');
  });
});
