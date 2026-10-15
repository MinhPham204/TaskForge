import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import { createP12WorkflowFixture } from './fixtures/p12-workflow.fixture';

describe('P12-03 actual frontend HTTP multipart consumers', () => {
  let app: INestApplication;
  let storageRoot: string;
  const previousRoot = process.env.STORAGE_LOCAL_ROOT;
  afterAll(async () => {
    await app?.close();
    if (previousRoot === undefined) delete process.env.STORAGE_LOCAL_ROOT;
    else process.env.STORAGE_LOCAL_ROOT = previousRoot;
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });
  it('uploads/lists/downloads/unlinks Task attachments and Project files through real Axios/RTK HTTP', async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'taskforge-p12-http-'));
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
    const headers = await f.headers('pm');
    const awaitUrl = await app.getUrl();
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [join(__dirname, '../../frontend/scripts/p12-http-integration.mjs')],
        { timeout: 30000 },
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
          projectId: f.scenarios.DRAFT.project.id,
          taskId: f.scenarios.DRAFT.manual.id,
        }),
      );
    });
    expect(output).toContain(
      'frontend-to-Nest HTTP multipart/list/download/unlink passed',
    );
  }, 60000);
});
