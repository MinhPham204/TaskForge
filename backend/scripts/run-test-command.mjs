import { spawnSync } from 'node:child_process';
import { postgresTestEnvironment } from './test-environment.mjs';

const command = process.argv[2];
const args = process.argv.slice(3);

if (!command) {
  throw new Error('A command is required.');
}

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  env: postgresTestEnvironment(),
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
