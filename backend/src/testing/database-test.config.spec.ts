import { requirePostgresTestUrl } from './database-test.config';

describe('requirePostgresTestUrl', () => {
  it('accepts only the dedicated local PostgreSQL test target', () => {
    expect(
      requirePostgresTestUrl({
        POSTGRES_TEST_URL:
          'postgresql://taskforge_test:taskforge_test@localhost:54330/taskforge_test',
      }),
    ).toContain('localhost:54330/taskforge_test');
  });

  it('fails closed for a remote or non-test database target', () => {
    expect(() =>
      requirePostgresTestUrl({
        POSTGRES_TEST_URL:
          'postgresql://user:password@db.example.test:5432/app',
      }),
    ).toThrow('localhost:54330/taskforge_test');
  });
});
