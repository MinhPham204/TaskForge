import { spawnSync } from 'node:child_process';

// Explicit target: never load .env or inherit its remote migration connection.
const databaseUrl =
  'postgresql://taskforge:taskforge@localhost:54329/taskforge';
const environment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  MIGRATION_DATABASE_URL: databaseUrl,
  DATABASE_SSL: 'false',
  DATABASE_SYNCHRONIZE: 'false',
  NODE_ENV: 'development',
};

for (const args of [
  [
    'node_modules/typeorm/cli-ts-node-commonjs.js',
    'migration:run',
    '-d',
    'src/database/data-source.ts',
  ],
  [
    '-r',
    'ts-node/register',
    '-r',
    'tsconfig-paths/register',
    'src/database/seed/existing-account-sample-seed.ts',
    '--confirm-seed',
    '--create-local-accounts',
  ],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
