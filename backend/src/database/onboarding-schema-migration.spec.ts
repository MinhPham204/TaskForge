import type { QueryRunner } from 'typeorm';
import { CreateOnboardingSchema20260905000000 } from './migrations/20260905000000-create-onboarding-schema';

describe('CreateOnboardingSchema20260905000000', () => {
  const query = jest.fn<Promise<void>, [string]>();
  const queryRunner = { query } as unknown as QueryRunner;

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue(undefined);
  });

  it('creates the onboarding tables with same-tenant and lifecycle constraints', async () => {
    await new CreateOnboardingSchema20260905000000().up(queryRunner);

    const sql = query.mock.calls[0][0];
    expect(sql).toContain(
      "CREATE TYPE organization_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER')",
    );
    expect(sql).toContain('CREATE TABLE users');
    expect(sql).toContain('CREATE TABLE organization_memberships');
    expect(sql).toContain('CREATE TABLE organization_invitations');
    expect(sql).toContain('CREATE TABLE teams');
    expect(sql).toContain('CREATE TABLE team_members');
    expect(sql).toContain('uq_organization_memberships_active_owner');
    expect(sql).toContain('uq_organization_invitations_pending_email');
    expect(sql).toContain('fk_team_members_team_same_organization');
    expect(sql).toContain('fk_team_members_membership_same_organization');
  });

  it('drops dependent onboarding tables before their enum types', async () => {
    await new CreateOnboardingSchema20260905000000().down(queryRunner);

    const sql = query.mock.calls[0][0];
    expect(sql.indexOf('DROP TABLE team_members')).toBeLessThan(
      sql.indexOf('DROP TABLE organization_memberships'),
    );
    expect(sql.indexOf('DROP TABLE organization_memberships')).toBeLessThan(
      sql.indexOf('DROP TYPE organization_membership_state'),
    );
  });
});
