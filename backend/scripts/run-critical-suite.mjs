import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postgresTestEnvironment } from './test-environment.mjs';

// These are the production-risk E2E/integration suites. Keep schema-only tests
// here too: migration correctness is part of the regression gate, not a unit-only
// concern. Each suite runs in its own Jest process to isolate database state and
// close its DataSource/Redis/Worker handles before the next suite starts.
const testFiles = [
  'test/account-security.integration.e2e-spec.ts',
  'test/collaboration-cross-capability.integration.e2e-spec.ts',
  'test/collaboration-files-schema.integration.e2e-spec.ts',
  'test/collaboration-http.integration.e2e-spec.ts',
  'test/dashboard-read.integration.e2e-spec.ts',
  'test/email-queue.integration.e2e-spec.ts',
  'test/file-relations.integration.e2e-spec.ts',
  'test/file-storage.integration.e2e-spec.ts',
  'test/notification.integration.e2e-spec.ts',
  'test/onboarding-contract.e2e-spec.ts',
  'test/onboarding.integration.e2e-spec.ts',
  'test/optional-modules-cross-capability.integration.e2e-spec.ts',
  'test/outbox.integration.e2e-spec.ts',
  'test/personal-preferences.integration.e2e-spec.ts',
  'test/project-authorization.integration.e2e-spec.ts',
  'test/project-lifecycle.integration.e2e-spec.ts',
  'test/project-module.integration.e2e-spec.ts',
  'test/project-participants.integration.e2e-spec.ts',
  'test/project-qualification.integration.e2e-spec.ts',
  'test/project-schema.integration.e2e-spec.ts',
  'test/project-status.integration.e2e-spec.ts',
  'test/project-task-dependencies.integration.e2e-spec.ts',
  'test/runtime.e2e-spec.ts',
  'test/seed.integration.e2e-spec.ts',
  'test/task-lifecycle.integration.e2e-spec.ts',
  'test/task-read-models.integration.e2e-spec.ts',
  'test/task-schema.integration.e2e-spec.ts',
  'test/team.integration.e2e-spec.ts',
];

const resultsDirectory = mkdtempSync(join(tmpdir(), 'taskforge-critical-'));
let suiteCount = 0;
let testCount = 0;

try {
  for (const [index, testFile] of testFiles.entries()) {
    const resultFile = join(resultsDirectory, `${index}.json`);
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/jest/bin/jest.js',
        testFile,
        '--config',
        'test/jest-e2e.json',
        '--runInBand',
        '--json',
        '--outputFile',
        resultFile,
      ],
      {
        cwd: process.cwd(),
        env: postgresTestEnvironment(),
        stdio: 'inherit',
      },
    );
    if (result.error) throw result.error;

    const report = JSON.parse(readFileSync(resultFile, 'utf8'));
    suiteCount += report.numTotalTestSuites;
    testCount += report.numTotalTests;

    if (result.status !== 0 || !report.success) {
      process.exit(result.status ?? 1);
    }
  }

  console.log(
    `Critical PostgreSQL regression passed: ${suiteCount} suites, ${testCount} tests.`,
  );
} finally {
  rmSync(resultsDirectory, { recursive: true, force: true });
}
