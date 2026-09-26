import type { QueryRunner } from 'typeorm';
import { CreateUserPreferences20260913000000 } from './migrations/20260913000000-create-user-preferences';

describe('CreateUserPreferences20260913000000', () => {
  const query = jest.fn<Promise<void>, [string]>();
  const queryRunner = { query } as unknown as QueryRunner;

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue(undefined);
  });

  it('creates global preferences with safe defaults and constrained week start', async () => {
    await new CreateUserPreferences20260913000000().up(queryRunner);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE user_preferences'));
    const sql = query.mock.calls[0][0];
    expect(sql).toContain("timezone varchar(64) NOT NULL DEFAULT 'UTC'");
    expect(sql).toContain('in_app_notifications_enabled boolean NOT NULL DEFAULT true');
    expect(sql).toContain('CHECK (week_starts_on IN (0, 1))');
  });
});
