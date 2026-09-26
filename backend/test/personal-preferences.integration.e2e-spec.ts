import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { PostgresNotificationService } from '../src/modules/collaboration/application/notification.service';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('Personal preferences integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let onboarding: PostgresOrganizationOnboardingService;
  let notifications: PostgresNotificationService;
  let httpServer: Parameters<typeof request>[0];
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    dataSource = app.get(DataSource);
    jwt = app.get(JwtService);
    onboarding = app.get(PostgresOrganizationOnboardingService);
    notifications = app.get(PostgresNotificationService);
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  });

  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(`
      TRUNCATE TABLE user_preferences, audit_logs, project_module_settings, project_task_statuses,
        project_memberships, project_teams, team_members,
        organization_invitations, organization_memberships, teams,
        organizations, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('persists global display settings and makes the supported in-app delivery toggle effective', async () => {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `preferences-${sequence}@example.test`,
      name: 'Preferences User',
      passwordHash: await bcrypt.hash('test-password', 4),
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
    const authorization = `Bearer ${await jwt.signAsync(
      { sub: user.id, email: user.email },
      { secret: process.env.JWT_ACCESS_SECRET },
    )}`;

    await request(httpServer)
      .get('/auth/preferences')
      .set('authorization', authorization)
      .expect(200)
      .expect({
        timezone: 'UTC',
        locale: 'en-US',
        weekStartsOn: 1,
        inAppNotificationsEnabled: true,
      });

    const disabled = await request(httpServer)
      .patch('/auth/preferences')
      .set('authorization', authorization)
      .send({
        timezone: 'Asia/Ho_Chi_Minh',
        locale: 'vi-VN',
        weekStartsOn: 0,
        inAppNotificationsEnabled: false,
      })
      .expect(200);
    expect(disabled.body).toEqual({
      timezone: 'Asia/Ho_Chi_Minh',
      locale: 'vi-VN',
      weekStartsOn: 0,
      inAppNotificationsEnabled: false,
    });

    await request(httpServer)
      .patch('/auth/preferences')
      .set('authorization', authorization)
      .send({ ...disabled.body, timezone: 'Unsupported/Zone' })
      .expect(400);

    const organization = await onboarding.createOrganization(user.id, { name: 'Preferences Workspace' });
    await expect(
      notifications.createForRecipient(organization.organizationId, {
        recipientUserId: user.id,
        typeCode: 'RISK_CREATED',
      }),
    ).resolves.toBeNull();

    await request(httpServer)
      .patch('/auth/preferences')
      .set('authorization', authorization)
      .send({ ...disabled.body, inAppNotificationsEnabled: true })
      .expect(200);
    await expect(
      notifications.createForRecipient(organization.organizationId, {
        recipientUserId: user.id,
        typeCode: 'RISK_CREATED',
      }),
    ).resolves.toMatchObject({ recipientUserId: user.id, deliveryStateCode: 'IN_APP' });
  });
});
