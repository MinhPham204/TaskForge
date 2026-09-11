import type { QueryRunner } from 'typeorm';
import { EnablePostgresExtensions20260904000000 } from './migrations/20260904000000-enable-extensions';

describe('EnablePostgresExtensions20260904000000', () => {
  const query = jest.fn<Promise<void>, [string]>();
  const queryRunner = { query } as unknown as QueryRunner;

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue(undefined);
  });

  it('enables only shared PostgreSQL extensions', async () => {
    const migration = new EnablePostgresExtensions20260904000000();

    await migration.up(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'CREATE EXTENSION IF NOT EXISTS "pgcrypto"',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'CREATE EXTENSION IF NOT EXISTS "citext"',
    );
  });

  it('reverts extensions in dependency-safe order', async () => {
    const migration = new EnablePostgresExtensions20260904000000();

    await migration.down(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'DROP EXTENSION IF EXISTS "citext"',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'DROP EXTENSION IF EXISTS "pgcrypto"',
    );
  });
});
