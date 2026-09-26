import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('Account profile and password integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let httpServer: Parameters<typeof request>[0];
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    jwt = app.get(JwtService);
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  });

  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(`
      TRUNCATE TABLE audit_logs, project_module_settings, project_task_statuses,
        project_memberships, project_teams, team_members,
        organization_invitations, organization_memberships, teams,
        organizations, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns and updates only mutable profile fields; verified email remains immutable', async () => {
    const user = await createUser('profile', 'current-password');
    const authorization = `Bearer ${await accessToken(user.id)}`;

    const initial = await request(httpServer)
      .get('/auth/me')
      .set('authorization', authorization)
      .expect(200);
    expect(initial.body).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      profileImageUrl: null,
    });
    expect(initial.body).not.toHaveProperty('passwordHash');
    expect(initial.body).not.toHaveProperty('refreshTokenHash');

    const updated = await request(httpServer)
      .patch('/auth/profile')
      .set('authorization', authorization)
      .send({ name: 'Updated Profile', profileImageUrl: 'https://example.test/avatar.png' })
      .expect(200);
    expect(updated.body).toEqual({
      id: user.id,
      name: 'Updated Profile',
      email: user.email,
      profileImageUrl: 'https://example.test/avatar.png',
    });

    await request(httpServer)
      .patch('/auth/profile')
      .set('authorization', authorization)
      .send({ email: 'other@example.test' })
      .expect(400);
    await expect(
      dataSource.getRepository(UserEntity).findOneByOrFail({ id: user.id }),
    ).resolves.toMatchObject({ email: user.email });
  });

  it('requires a valid current password, shared policy and confirmation before revoking refresh access', async () => {
    const user = await createUser('password', 'current-password');
    const rawRefreshToken = await refreshToken(user.id);
    user.refreshTokenHash = await bcrypt.hash(rawRefreshToken, 4);
    await dataSource.getRepository(UserEntity).save(user);
    const authorization = `Bearer ${await accessToken(user.id)}`;

    await request(httpServer)
      .patch('/auth/change-password')
      .set('authorization', authorization)
      .send({
        currentPassword: 'current-password',
        newPassword: 'short',
        confirmPassword: 'short',
      })
      .expect(400);
    await request(httpServer)
      .patch('/auth/change-password')
      .set('authorization', authorization)
      .send({
        currentPassword: 'current-password',
        newPassword: 'new-password',
        confirmPassword: 'different-password',
      })
      .expect(400);
    await request(httpServer)
      .patch('/auth/change-password')
      .set('authorization', authorization)
      .send({
        currentPassword: 'incorrect-password',
        newPassword: 'new-password',
        confirmPassword: 'new-password',
      })
      .expect(401);

    const changed = await request(httpServer)
      .patch('/auth/change-password')
      .set('authorization', authorization)
      .send({
        currentPassword: 'current-password',
        newPassword: 'new-password',
        confirmPassword: 'new-password',
      })
      .expect(200);
    expect(changed.body).toEqual({
      message: 'Password changed successfully. Please sign in again.',
    });
    expect(changed.body).not.toHaveProperty('password');
    expect(changed.body).not.toHaveProperty('currentPassword');
    expect(changed.body).not.toHaveProperty('newPassword');
    expect(changed.body).not.toHaveProperty('refreshToken');

    const credentials = await dataSource.query<
      Array<{ password_hash: string; refresh_token_hash: string | null }>
    >('SELECT password_hash, refresh_token_hash FROM users WHERE id = $1', [user.id]);
    expect(await bcrypt.compare('new-password', credentials[0].password_hash)).toBe(true);
    expect(credentials[0].refresh_token_hash).toBeNull();

    await request(httpServer)
      .post('/auth/refresh')
      .set('authorization', `Bearer ${rawRefreshToken}`)
      .expect(403);
    await request(httpServer)
      .post('/auth/login')
      .send({ email: user.email, password: 'current-password' })
      .expect(401);
    const login = await request(httpServer)
      .post('/auth/login')
      .send({ email: user.email, password: 'new-password' })
      .expect(201);
    expect(login.body).toEqual(expect.objectContaining({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: expect.objectContaining({ id: user.id, email: user.email }),
    }));

    const audit = await dataSource.query<
      Array<{ before_data: unknown; after_data: unknown }>
    >(
      "SELECT before_data, after_data FROM audit_logs WHERE action_code = 'AUTH_PASSWORD_CHANGED' AND actor_user_id = $1",
      [user.id],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual({ before_data: null, after_data: null });
  });

  async function createUser(
    prefix: string,
    password: string,
  ): Promise<UserEntity> {
    return dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: await bcrypt.hash(password, 4),
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
  }

  function accessToken(userId: string): Promise<string> {
    return jwt.signAsync(
      { sub: userId, email: 'ignored-by-guard@example.test' },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
  }

  function refreshToken(userId: string): Promise<string> {
    return jwt.signAsync(
      { sub: userId, email: 'ignored-by-refresh@example.test' },
      { secret: process.env.JWT_REFRESH_SECRET },
    );
  }
});
