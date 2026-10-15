import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { EmailService } from '../src/common/services/email.service';
import { RedisService } from '../src/common/services/redis.service';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import { UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import {
  PasswordResetChallenges,
  resetDigest,
} from '../src/modules/onboarding/application/password-reset';
import * as audit from '../src/modules/collaboration/application/audit.writer';
import { PostgresAuthService } from '../src/modules/onboarding/application/auth.service';

describe('P12-10 reset/session — real PostgreSQL, HTTP and Redis (test mail only)', () => {
  let app: INestApplication;
  let db: DataSource;
  let client: Redis;
  let redis: RedisService;
  let challenges: PasswordResetChallenges;
  let email: string;
  let user: UserEntity;
  let code: string;
  let failMail = false;
  const ownedKeys = new Set<string>();
  const userIds: string[] = [];
  const ip = 'p12-test-ip';
  const key = (kind: string, value: string) =>
    `auth-reset:${kind}:${resetDigest(value)}`;
  const own = (address: string) => {
    ['challenge', 'cooldown', 'send-window'].forEach((kind) =>
      ownedKeys.add(key(kind, address)),
    );
    ['send-ip', 'verify-ip'].forEach((kind) =>
      ['::ffff:127.0.0.1', '127.0.0.1', '::1', ip].forEach((value) =>
        ownedKeys.add(key(kind, value)),
      ),
    );
  };
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const reset = (otp = code, password = 'new-test-password') =>
    request(server())
      .post('/auth/reset-password')
      .send({ email, otp, newPassword: password, confirmPassword: password });
  const send = (address = email) => ({
    expect: async (status: number) => {
      const result = await request(server())
        .post('/auth/forgot-password')
        .send({ email: address })
        .expect(status);
      await app.get(PostgresAuthService).onModuleDestroy();
      return result;
    },
  });

  beforeAll(async () => {
    // Fixed isolated Redis target; never load runtime .env or flush other keys.
    client = new Redis({
      host: '127.0.0.1',
      port: 6380,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    await new Promise<void>((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
    });
    redis = new RedisService(client);
    challenges = new PasswordResetChallenges(
      redis,
      process.env.JWT_REFRESH_SECRET ?? 'test-only-reset-secret',
    );
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    })
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(EmailService)
      .useValue({
        sendPasswordResetEmail: jest.fn((_email: string, otp: string) => {
          if (failMail)
            return Promise.reject(new Error('test provider unavailable'));
          code = otp;
          return Promise.resolve();
        }),
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    db = app.get(DataSource);
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    failMail = false;
    code = '';
    (app.get<EmailService>(EmailService).sendPasswordResetEmail as jest.Mock)
      .mockReset()
      .mockImplementation((_address: string, otp: string) => {
        if (failMail)
          return Promise.reject(new Error('test provider unavailable'));
        code = otp;
        return Promise.resolve();
      });
    if (ownedKeys.size) await client.del(...ownedKeys);
    email = `p12-reset-${randomUUID()}@example.test`;
    own(email);
    user = await db.getRepository(UserEntity).save({
      email,
      name: 'Reset Test',
      passwordHash: await bcrypt.hash('old-test-password', 4),
      emailVerifiedAt: new Date(),
      disabledAt: null,
    });
    userIds.push(user.id);
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    if (db && userIds.length) {
      // Append-only audit records can only be truncated in the guarded test DB.
      await db.query('TRUNCATE TABLE audit_logs');
      await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    }
    if (client && ownedKeys.size) await client.del(...ownedKeys);
    if (app) await app.close();
    if (client) await client.quit();
  });

  it('serves generic accepted responses, changes credentials once and revokes refresh with secret-free audit', async () => {
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'old-test-password' })
      .expect(201);
    const sent = await send(` ${email.toUpperCase()} `).expect(202);
    expect(sent.body as { message: string; retryAfter: number }).toMatchObject({
      retryAfter: 60,
    });
    expect(code).toMatch(/^\d{6}$/);
    const stored = await client.get(key('challenge', email));
    expect(stored).not.toContain(code);
    expect(await client.ttl(key('challenge', email))).toBeGreaterThan(0);
    const unknown = `absent-${randomUUID()}@example.test`;
    own(unknown);
    expect((await send(unknown).expect(202)).body).toEqual(sent.body);
    await reset().expect(200);
    await reset().expect(400);
    await request(server())
      .post('/auth/refresh')
      .set(
        'authorization',
        `Bearer ${(login.body as { refreshToken: string }).refreshToken}`,
      )
      .expect(403);
    await request(server())
      .post('/auth/login')
      .send({ email, password: 'old-test-password' })
      .expect(401);
    await request(server())
      .post('/auth/login')
      .send({ email, password: 'new-test-password' })
      .expect(201);
    const logs = await db.query<
      Array<{ before_data: unknown; after_data: unknown }>
    >(
      "SELECT before_data, after_data FROM audit_logs WHERE actor_user_id = $1 AND action_code = 'AUTH_PASSWORD_RESET'",
      [user.id],
    );
    expect(logs).toEqual([{ before_data: null, after_data: null }]);
  });

  it('enforces DTO, confirmation and byte policy without consuming a valid challenge', async () => {
    await send().expect(202);
    await reset('abc123').expect(400);
    await reset(code, 'short').expect(400);
    await reset(code, 'é'.repeat(37)).expect(400);
    await request(server())
      .post('/auth/reset-password')
      .send({
        email,
        otp: code,
        newPassword: 'new-test-password',
        confirmPassword: 'other-password',
      })
      .expect(400);
    await reset().expect(200);
  });

  it('rotates distinct full refresh tokens and rejects old credentials even after reset and new login', async () => {
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'old-test-password' })
      .expect(201);
    const original = (login.body as { refreshToken: string }).refreshToken;
    const rotated = await request(server())
      .post('/auth/refresh')
      .set('authorization', `Bearer ${original}`)
      .expect(201);
    const replacement = (rotated.body as { refreshToken: string }).refreshToken;
    expect(replacement === original).toBe(false);
    await request(server())
      .post('/auth/refresh')
      .set('authorization', `Bearer ${original}`)
      .expect(403);
    await send().expect(202);
    await reset().expect(200);
    await request(server())
      .post('/auth/login')
      .send({ email, password: 'new-test-password' })
      .expect(201);
    await request(server())
      .post('/auth/refresh')
      .set('authorization', `Bearer ${replacement}`)
      .expect(403);
  });

  it('rotates an existing legacy refresh credential into a full-token hash', async () => {
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'old-test-password' })
      .expect(201);
    const token = (login.body as { refreshToken: string }).refreshToken;
    await db
      .getRepository(UserEntity)
      .update(user.id, { refreshTokenHash: await bcrypt.hash(token, 4) });
    await request(server())
      .post('/auth/refresh')
      .set('authorization', `Bearer ${token}`)
      .expect(201);
    const rows = await db.query<Array<{ refresh_token_hash: string }>>(
      'SELECT refresh_token_hash FROM users WHERE id=$1',
      [user.id],
    );
    expect(rows[0].refresh_token_hash.startsWith('sha256:')).toBe(true);
    await request(server())
      .post('/auth/refresh')
      .set('authorization', `Bearer ${token}`)
      .expect(403);
  });

  it.each(['refresh', 'login'])(
    'prevents an in-flight %s from restoring credentials after reset',
    async (command) => {
      const login = await request(server())
        .post('/auth/login')
        .send({ email, password: 'old-test-password' })
        .expect(201);
      await send().expect(202);
      let reached!: () => void;
      let release!: () => void;
      const arrived = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const originalQuery = db.manager.query.bind(db.manager) as (
        sql: string,
        parameters?: unknown[],
      ) => Promise<unknown>;
      const query = jest
        .spyOn(db.manager, 'query')
        .mockImplementation(async (sql: string, parameters?: unknown[]) => {
          if (
            sql.includes(
              command === 'refresh'
                ? 'AND refresh_token_hash = $3'
                : 'AND password_hash = $3',
            )
          ) {
            reached();
            await released;
          }
          return originalQuery(sql, parameters);
        });
      const pending = (
        command === 'refresh'
          ? request(server())
              .post('/auth/refresh')
              .set(
                'authorization',
                `Bearer ${(login.body as { refreshToken: string }).refreshToken}`,
              )
          : request(server())
              .post('/auth/login')
              .send({ email, password: 'old-test-password' })
      ).then((response) => response);
      try {
        await arrived;
        await reset().expect(200);
        release();
        expect((await pending).status).toBe(command === 'refresh' ? 403 : 401);
        const rows = (await originalQuery(
          'SELECT refresh_token_hash FROM users WHERE id=$1',
          [user.id],
        )) as Array<{ refresh_token_hash: string | null }>;
        expect(rows[0].refresh_token_hash).toBeNull();
      } finally {
        release();
        query.mockRestore();
      }
    },
  );

  it('returns accepted while SMTP is pending and only activates after acceptance', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mail = app.get<EmailService>(EmailService);
    jest
      .spyOn(mail, 'sendPasswordResetEmail')
      .mockImplementation((_address: string, otp: string) => {
        code = otp;
        return waiting;
      });
    try {
      await request(server())
        .post('/auth/forgot-password')
        .send({ email })
        .expect(202);
      expect(
        (
          JSON.parse((await client.get(key('challenge', email))) ?? '{}') as {
            active: boolean;
          }
        ).active,
      ).toBe(false);
      await reset().expect(400);
      release();
      await app.get(PostgresAuthService).onModuleDestroy();
      await reset().expect(200);
    } finally {
      release();
      await app.get(PostgresAuthService).onModuleDestroy();
    }
  });

  it('bounds wrong attempts, expiration and replay; only one concurrent reset succeeds', async () => {
    await send().expect(202);
    const wrong = code === '111111' ? '222222' : '111111';
    for (let n = 0; n < 5; n++) await reset(wrong).expect(400);
    await reset().expect(400);
    await client.del(key('cooldown', email));
    await send().expect(202);
    await client.expire(key('challenge', email), 0);
    await reset().expect(400);
    await client.del(key('cooldown', email));
    await send().expect(202);
    const results = await Promise.all([reset(), reset()]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
  });

  it('enforces cooldown, email send-window and IP bounds using real atomic Redis scripts', async () => {
    await challenges.reserve(email, ip);
    await expect(challenges.reserve(email, ip)).rejects.toMatchObject({
      status: 429,
    });
    for (let n = 1; n < 5; n++) {
      await client.del(key('cooldown', email));
      await challenges.reserve(email, ip);
    }
    await client.del(key('cooldown', email));
    await expect(challenges.reserve(email, ip)).rejects.toMatchObject({
      status: 429,
    });
    await client.set(key('send-ip', ip), '20', 'EX', 900);
    await expect(challenges.reserve(email, ip)).rejects.toMatchObject({
      status: 429,
    });
    await client.set(key('verify-ip', ip), '30', 'EX', 900);
    await expect(challenges.consume(email, '111111', ip)).rejects.toMatchObject(
      { status: 429 },
    );
    const httpLimit = await send().expect(429);
    expect(
      (httpLimit.body as { retryAfter: number }).retryAfter,
    ).toBeGreaterThan(0);
  });

  it('isolates signup namespace and protects newer generations from late activation/cleanup', async () => {
    const signupKey = `otp:${email}`;
    ownedKeys.add(signupKey);
    await client.set(signupKey, 'test-signup-sentinel', 'EX', 300);
    const old = await challenges.create(email, user.id, user.passwordHash);
    const next = await challenges.create(email, user.id, user.passwordHash);
    await challenges.finish(email, old.generation, false);
    await challenges.finish(email, old.generation, true);
    await expect(challenges.consume(email, next.otp, ip)).rejects.toMatchObject(
      { status: 400 },
    );
    await challenges.finish(email, next.generation, true);
    expect(await challenges.consume(email, next.otp, ip)).toMatchObject({
      userId: user.id,
    });
    expect(await client.get(signupKey)).toBe('test-signup-sentinel');
  });

  it('keeps delivery failure indistinguishable and removes only its challenge; Redis outage fails closed', async () => {
    failMail = true;
    const failed = await send().expect(202);
    expect(await client.exists(key('challenge', email))).toBe(0);
    const unknown = `absent-${randomUUID()}@example.test`;
    own(unknown);
    expect((await send(unknown).expect(202)).body).toEqual(failed.body);
    jest
      .spyOn(redis, 'resetScript')
      .mockRejectedValue(new Error('test Redis outage'));
    expect(((await send().expect(503)).body as { code: string }).code).toBe(
      'RESET_UNAVAILABLE',
    );
    await reset('111111').expect(503);
  });

  it('rechecks disabled and changed credentials after challenge issuance', async () => {
    await send().expect(202);
    await db.getRepository(UserEntity).update(user.id, {
      passwordHash: await bcrypt.hash('changed-password', 4),
    });
    await reset().expect(400);
    await client.del(key('cooldown', email));
    await send().expect(202);
    await db
      .getRepository(UserEntity)
      .update(user.id, { disabledAt: new Date() });
    await reset().expect(400);
  });

  it('rolls back password and refresh revocation when audit fails; consumed code cannot be replayed', async () => {
    await send().expect(202);
    const before = await db.query<
      Array<{ password_hash: string; refresh_token_hash: string | null }>
    >('SELECT password_hash, refresh_token_hash FROM users WHERE id=$1', [
      user.id,
    ]);
    jest
      .spyOn(audit, 'writePostgresAudit')
      .mockRejectedValueOnce(new Error('test-only audit failure'));
    await reset().expect(500);
    expect(
      await db.query(
        'SELECT password_hash, refresh_token_hash FROM users WHERE id=$1',
        [user.id],
      ),
    ).toEqual(before);
    await reset().expect(400);
  });
});
