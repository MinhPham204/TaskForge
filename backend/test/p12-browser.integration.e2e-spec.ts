import { JwtService } from '@nestjs/jwt';
import { PostgresInvitationMembershipService } from '../src/modules/onboarding/application/invitation-membership.service';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import { EmailService } from '../src/common/services/email.service';
import { RedisService } from '../src/common/services/redis.service';
import {
  UserEntity,
  OrganizationInvitationEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { createP12WorkflowFixture } from './fixtures/p12-workflow.fixture';
import { resetDigest } from '../src/modules/onboarding/application/password-reset';

describe('P12-11 integrated real-API Chromium acceptance', () => {
  let app: INestApplication;
  let redis: Redis;
  let storageRoot: string;
  const previousRoot = process.env.STORAGE_LOCAL_ROOT;
  const mail = new Map<string, string>();
  const testPassword = 'P12-browser-test-password!';
  const controlKey = randomUUID();
  const cleanupKeys: string[] = [];
  afterAll(async () => {
    await app?.close();
    if (redis) {
      if (redis.status === 'ready' && cleanupKeys.length)
        await redis.del(...cleanupKeys);
      if (redis.status === 'ready') await redis.quit();
      else redis.disconnect(false);
    }
    if (previousRoot === undefined) delete process.env.STORAGE_LOCAL_ROOT;
    else process.env.STORAGE_LOCAL_ROOT = previousRoot;
    if (storageRoot) {
      const target = resolve(storageRoot);
      if (
        dirname(target) !== resolve(tmpdir()) ||
        !basename(target).startsWith('taskforge-p12-browser-')
      )
        throw new Error('Unexpected test storage cleanup target');
      await rm(target, { recursive: true, force: true });
    }
  });

  it('exercises shipped pages, mutations, persisted reads, denied/failure counterparts and session recovery', async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'taskforge-p12-browser-'));
    process.env.STORAGE_LOCAL_ROOT = storageRoot;
    redis = new Redis({
      host: '127.0.0.1',
      port: 6380,
      maxRetriesPerRequest: 1,
    });
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    })
      .overrideProvider(RedisService)
      .useValue(new RedisService(redis))
      .overrideProvider(EmailService)
      .useValue({
        sendPasswordResetEmail: (email: string, otp: string) => {
          mail.set(email, otp);
          return Promise.resolve();
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // Ephemeral loopback-only fixture control: never part of the production module.
    app.use('/__p12/reset-code', (req: Request, res: Response) => {
      if (req.headers['x-p12-harness'] !== controlKey) {
        res.sendStatus(403);
        return;
      }
      const email = typeof req.query.email === 'string' ? req.query.email : '';
      res.json({ code: mail.get(email) ?? null });
    });
    await app.listen(0, '127.0.0.1');
    const db = app.get(DataSource);
    // Composition root enforces localhost:54330/taskforge_test before connecting.
    await db.query('TRUNCATE TABLE audit_logs, users CASCADE');
    const f = await createP12WorkflowFixture(app);
    const hash = await bcrypt.hash(testPassword, 4);
    for (const actor of Object.values(f.actors))
      await db
        .getRepository(UserEntity)
        .update(actor.user.id, { passwordHash: hash });
    const empty = await db.getRepository(UserEntity).save({
      email: `p12-empty-${randomUUID()}@example.test`,
      name: 'Empty browser actor',
      passwordHash: hash,
      emailVerifiedAt: new Date(),
      disabledAt: null,
    });
    const invitations = app.get(PostgresInvitationMembershipService);
    const inviteFixtures: Record<
      string,
      { id: string; email: string; token: string; invitationId: string }
    > = {};
    for (const kind of ['valid', 'expired', 'revoked']) {
      const recipient = await db.getRepository(UserEntity).save({
        email: 'p12-invite-' + kind + '-' + randomUUID() + '@example.test',
        name: 'P12 invited ' + kind,
        passwordHash: hash,
        emailVerifiedAt: new Date(),
        disabledAt: null,
      });
      const created = await invitations.createInvitation(
        f.actors.pm.user.id,
        f.workspace.organizationId,
        { email: recipient.email, expiresAt: new Date(Date.now() + 86400000) },
      );
      inviteFixtures[kind] = {
        id: recipient.id,
        email: recipient.email,
        token: created.token,
        invitationId: created.invitation.id,
      };
      if (kind === 'expired')
        await db
          .getRepository(OrganizationInvitationEntity)
          .update(created.invitation.id, {
            expiresAt: new Date(Date.now() - 60000),
          });
      if (kind === 'revoked')
        await invitations.revokeInvitation(
          f.actors.pm.user.id,
          f.workspace.organizationId,
          created.invitation.id,
        );
    }
    const secondWorkspace = await app
      .get(PostgresOrganizationOnboardingService)
      .createOrganization(f.actors.pm.user.id, {
        name: 'P12 browser second workspace',
      });
    for (const email of [
      ...Object.values(f.actors).map((a) => a.user.email),
      empty.email,
    ]) {
      for (const kind of ['challenge', 'cooldown', 'send-window'])
        cleanupKeys.push(`auth-reset:${kind}:${resetDigest(email)}`);
    }
    for (const ip of ['127.0.0.1', '::ffff:127.0.0.1'])
      for (const kind of ['send-ip', 'verify-ip'])
        cleanupKeys.push(`auth-reset:${kind}:${resetDigest(ip)}`);
    await redis.del(...cleanupKeys);
    const expiredAccessToken = await app
      .get(JwtService)
      .signAsync(
        { sub: f.actors.pm.user.id, email: f.actors.pm.user.email },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: -1 },
      );
    const expiredRefreshToken = await app.get(JwtService).signAsync(
      {
        sub: f.actors.pm.user.id,
        email: f.actors.pm.user.email,
        purpose: 'refresh',
      },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: -1 },
    );
    const apiUrl = await app.getUrl();
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [join(__dirname, '../../frontend/scripts/p12-browser.mjs')],
        { timeout: 540000, maxBuffer: 2 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error)
            reject(
              new Error(`Browser acceptance failed: ${stdout}\n${stderr}`),
            );
          else resolve(stdout);
        },
      );
      child.stdout?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n'))
          if (line.startsWith('P12 browser PASS:')) console.log(line);
      });
      child.stdin!.end(
        JSON.stringify({
          baseURL: apiUrl,
          invites: inviteFixtures,
          expiredAccessToken,
          expiredRefreshToken,
          controlKey,
          password: testPassword,
          organizationId: f.workspace.organizationId,
          teamId: f.workspace.generalTeamId,
          secondOrganizationId: secondWorkspace.organizationId,
          actors: Object.fromEntries(
            Object.entries(f.actors).map(([name, actor]) => [
              name,
              {
                id: actor.user.id,
                email: actor.user.email,
                name: actor.user.name,
                projectMembershipId: actor.projectMembershipId,
              },
            ]),
          ),
          emptyActor: { id: empty.id, email: empty.email },
          scenarios: Object.fromEntries(
            Object.entries(f.scenarios).map(([state, scenario]) => [
              state,
              {
                projectId: scenario.project.id,
                manual: scenario.manual.id,
                checklist: scenario.checklist.id,
                approval: scenario.approval.id,
                completed: scenario.completed.id,
                milestoneId: scenario.milestoneId,
                statuses: scenario.statuses.map((s) => ({
                  id: s.id,
                  semanticCategory: s.semanticCategory,
                  name: s.name,
                })),
              },
            ]),
          ),
        }),
      );
    });
    expect(output).toContain(
      process.env.P12_BROWSER_SCOPE === 'bootstrap'
        ? 'P12 browser bootstrap diagnostic passed'
        : 'P12 browser integrated acceptance passed',
    );
    console.log(output.trim());
  }, 570000);
});
