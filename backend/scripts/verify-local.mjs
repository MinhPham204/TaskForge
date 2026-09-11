import { spawnSync } from 'node:child_process';
import { postgresTestEnvironment } from './test-environment.mjs';

const npmCli = process.env.npm_execpath;
const environment = postgresTestEnvironment();

if (!npmCli) {
  throw new Error('Run this workflow through npm so npm_execpath is available.');
}

function runNpm(args, useTestEnvironment = false) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: process.cwd(),
    env: useTestEnvironment ? environment : process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runNpm(['run', 'test:db:up']);
runNpm(['run', 'test:db:migrate'], true);
runNpm(['test', '--', '--runInBand']);
runNpm(['run', 'test:integration'], true);
runNpm(['run', 'test:storage:minio'], true);
runNpm(['run', 'build']);
