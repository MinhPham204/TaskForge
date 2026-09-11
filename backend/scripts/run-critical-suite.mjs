import { spawnSync } from 'node:child_process';
import { postgresTestEnvironment } from './test-environment.mjs';

const testFiles = [
  'test/onboarding.integration.e2e-spec.ts',
  'test/onboarding-contract.e2e-spec.ts',
  'test/team.integration.e2e-spec.ts',
  'test/project-lifecycle.integration.e2e-spec.ts',
  'test/project-participants.integration.e2e-spec.ts',
  'test/project-authorization.integration.e2e-spec.ts',
  'test/task-lifecycle.integration.e2e-spec.ts',
  'test/task-read-models.integration.e2e-spec.ts',
  'test/collaboration-cross-capability.integration.e2e-spec.ts',
  'test/file-storage.integration.e2e-spec.ts',
  'test/optional-modules-cross-capability.integration.e2e-spec.ts',
  'test/email-queue.integration.e2e-spec.ts',
];

for (const testFile of testFiles) {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/jest/bin/jest.js',
      testFile,
      '--config',
      'test/jest-e2e.json',
      '--runInBand',
    ],
    {
      cwd: process.cwd(),
      env: postgresTestEnvironment(),
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
