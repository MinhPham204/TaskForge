import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import { TaskStatusSemanticCategory } from '../src/modules/projects/persistence/typeorm/project.entities';
import { createP12WorkflowFixture } from './fixtures/p12-workflow.fixture';

describe('P12-07 actual Board transition consumers', () => {
  let app: INestApplication;
  let storageRoot: string;
  const previousRoot = process.env.STORAGE_LOCAL_ROOT;
  afterAll(async () => {
    await app?.close();
    if (previousRoot === undefined) delete process.env.STORAGE_LOCAL_ROOT;
    else process.env.STORAGE_LOCAL_ROOT = previousRoot;
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });
  it('reconciles real transitions, domain denials and a lost response after commit', async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'taskforge-p12-board-'));
    process.env.STORAGE_LOCAL_ROOT = storageRoot;
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    const f = await createP12WorkflowFixture(app);
    const scenario = f.scenarios.DRAFT;
    const headers = await f.headers('pm');
    const contributorHeaders = await f.headers('contributor');
    const readerHeaders = await f.headers('readAll');
    const awaitUrl = await app.getUrl();
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [join(__dirname, '../../frontend/scripts/p12-board-integration.mjs')],
        { timeout: 60000 },
        (error, stdout, stderr) => {
          if (error) reject(new Error(`Frontend HTTP probe failed: ${stderr}`));
          else resolve(stdout);
        },
      );
      child.stdin!.end(
        JSON.stringify({
          baseURL: awaitUrl,
          accessToken: headers.Authorization.slice(7),
          organizationId: headers['x-organization-id'],
          userId: f.actors.pm.user.id,
          checklistTaskId: scenario.checklist.id,
          approvalTaskId: scenario.approval.id,
          statuses: scenario.statuses,
          contributorHeaders,
          readerHeaders,
          otherHeaders: f.otherHeaders,
          terminalProjects: ['COMPLETED', 'ARCHIVED'].map((state) => ({
            projectId: f.scenarios[state].project.id,
            taskId: f.scenarios[state].manual.id,
            statusId: f.scenarios[state].statuses[0].id,
          })),
          completedStatusId: scenario.statuses.find(
            (status) =>
              status.semanticCategory === TaskStatusSemanticCategory.COMPLETED,
          )!.id,
          projectId: f.scenarios.DRAFT.project.id,
          taskId: f.scenarios.DRAFT.manual.id,
        }),
      );
    });
    expect(output).toContain(
      'frontend-to-Nest Board persisted acceptance passed',
    );
  }, 90000);
});
