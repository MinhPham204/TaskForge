import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { PostgresAuthService } from '../src/modules/onboarding/application/auth.service';
import { PostgresInvitationMembershipService } from '../src/modules/onboarding/application/invitation-membership.service';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationEntity,
  OrganizationInvitationEntity,
  OrganizationRole,
  TeamEntity,
  TeamMemberEntity,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL onboarding integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let onboarding: PostgresOrganizationOnboardingService;
  let invitations: PostgresInvitationMembershipService;
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
    config = app.get(ConfigService);
    onboarding = app.get(PostgresOrganizationOnboardingService);
    invitations = app.get(PostgresInvitationMembershipService);
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  });

  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(`
      TRUNCATE TABLE project_module_settings, project_task_statuses,
        project_memberships, project_teams, team_members,
        organization_invitations, organization_memberships, teams,
        organizations, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('creates the Organization, active Owner Membership and General Team through the actual HTTP/database path', async () => {
    const user = await createUser('owner');

    const response = await request(httpServer)
      .post('/organizations')
      .set('authorization', `Bearer ${await accessToken(user.id)}`)
      .send({ name: 'Workspace Alpha' })
      .expect(201);

    const { organizationId } = response.body as { organizationId: string };
    expect(organizationId).toEqual(expect.any(String));

    const membership = await dataSource
      .getRepository(OrganizationMembershipEntity)
      .findOneByOrFail({ organizationId, userId: user.id });
    expect(membership.role).toBe(OrganizationRole.OWNER);
    expect(membership.state).toBe(OrganizationMembershipState.ACTIVE);

    const team = await dataSource
      .getRepository(TeamEntity)
      .createQueryBuilder('team')
      .where('team.organization_id = :organizationId', { organizationId })
      .getOneOrFail();
    expect(team.name).toBe('General');
    await expect(
      dataSource.getRepository(TeamMemberEntity).findOneByOrFail({
        teamId: team.id,
        organizationMembershipId: membership.id,
      }),
    ).resolves.toMatchObject({ organizationId });
  });

  it('creates only a global User during PostgreSQL signup', async () => {
    const auth = new PostgresAuthService(
      dataSource.manager,
      jwt,
      {} as never,
      {} as never,
      config,
    );
    const email = `signup-${sequence}@example.test`;
    const verifiedToken = jwt.sign(
      { email },
      { secret: process.env.JWT_VERIFIED_SECRET },
    );

    const result = await auth.completeSignup(verifiedToken, {
      fullName: 'Global Signup User',
      password: 'safe-test-password',
    });

    expect(result.user.email).toBe(email);
    await expect(
      dataSource.getRepository(OrganizationEntity).count(),
    ).resolves.toBe(0);
    await expect(
      dataSource.getRepository(OrganizationMembershipEntity).count(),
    ).resolves.toBe(0);
  });

  it('rolls every onboarding write back when the General Team insert fails in PostgreSQL', async () => {
    const user = await createUser('rollback-owner');
    const functionName = 'p2_09_reject_general_team';
    const triggerName = 'p2_09_reject_general_team_trigger';
    await dataSource.query(`
      CREATE FUNCTION ${functionName}() RETURNS trigger AS $$
      BEGIN
        IF NEW.name = 'General' THEN
          RAISE EXCEPTION 'P2-09 forced General Team failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON teams
      FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `);

    try {
      await expect(
        onboarding.createOrganization(user.id, { name: 'Must Roll Back' }),
      ).rejects.toThrow('P2-09 forced General Team failure');
    } finally {
      await dataSource.query(`DROP TRIGGER IF EXISTS ${triggerName} ON teams`);
      await dataSource.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    }

    await expect(
      dataSource.getRepository(OrganizationEntity).count({
        where: { name: 'Must Roll Back' },
      }),
    ).resolves.toBe(0);
  });

  it('rejects a valid workspace header when the invitation path targets another Organization', async () => {
    const user = await createUser('cross-tenant-owner');
    const nonMember = await createUser('non-member');
    const inactiveMember = await createUser('inactive-member');
    const first = await onboarding.createOrganization(user.id, {
      name: 'First Workspace',
    });
    const second = await onboarding.createOrganization(user.id, {
      name: 'Second Workspace',
    });

    await request(httpServer)
      .post(`/organizations/${second.organizationId}/invitations`)
      .set('authorization', `Bearer ${await accessToken(user.id)}`)
      .set('x-organization-id', first.organizationId)
      .send({
        email: 'recipient@example.test',
        expiresAt: '2026-12-01T00:00:00.000Z',
        role: 'MEMBER',
      })
      .expect(403);

    await request(httpServer)
      .post(`/organizations/${first.organizationId}/invitations`)
      .set('authorization', `Bearer ${await accessToken(nonMember.id)}`)
      .set('x-organization-id', first.organizationId)
      .send({
        email: 'non-member-recipient@example.test',
        expiresAt: '2026-12-01T00:00:00.000Z',
        role: 'MEMBER',
      })
      .expect(403);

    await dataSource.getRepository(OrganizationMembershipEntity).save({
      organizationId: first.organizationId,
      userId: inactiveMember.id,
      role: OrganizationRole.MEMBER,
      state: OrganizationMembershipState.SUSPENDED,
      joinedAt: new Date(),
      stateChangedAt: new Date(),
    });
    await request(httpServer)
      .post(`/organizations/${first.organizationId}/invitations`)
      .set('authorization', `Bearer ${await accessToken(inactiveMember.id)}`)
      .set('x-organization-id', first.organizationId)
      .send({
        email: 'inactive-member-recipient@example.test',
        expiresAt: '2026-12-01T00:00:00.000Z',
        role: 'MEMBER',
      })
      .expect(403);

    await expect(
      dataSource.getRepository(OrganizationInvitationEntity).count(),
    ).resolves.toBe(0);
  });

  it('enforces the database same-Organization foreign key for TeamMember', async () => {
    const firstUser = await createUser('first-owner');
    const secondUser = await createUser('second-owner');
    const first = await onboarding.createOrganization(firstUser.id, {
      name: 'First Constraint Workspace',
    });
    const second = await onboarding.createOrganization(secondUser.id, {
      name: 'Second Constraint Workspace',
    });

    await expect(
      dataSource.getRepository(TeamMemberEntity).insert({
        teamId: first.generalTeamId,
        organizationMembershipId: second.membershipId,
        organizationId: first.organizationId,
        joinedAt: new Date(),
        removedAt: null,
      }),
    ).rejects.toThrow();
  });

  it('accepts an invitation idempotently and preserves the recipient membership in another Organization', async () => {
    const owner = await createUser('invitation-owner');
    const recipient = await createUser('invitation-recipient');
    const first = await onboarding.createOrganization(owner.id, {
      name: 'Inviter Workspace',
    });
    const existing = await onboarding.createOrganization(recipient.id, {
      name: 'Recipient Workspace',
    });
    const created = await invitations.createInvitation(
      owner.id,
      first.organizationId,
      {
        email: recipient.email,
        expiresAt: new Date('2026-12-01T00:00:00.000Z'),
        role: OrganizationRole.MEMBER,
      },
    );

    const firstAcceptance = await request(httpServer)
      .post('/invitations/accept')
      .set('authorization', `Bearer ${await accessToken(recipient.id)}`)
      .send({ token: created.token })
      .expect(201);
    const retry = await request(httpServer)
      .post('/invitations/accept')
      .set('authorization', `Bearer ${await accessToken(recipient.id)}`)
      .send({ token: created.token })
      .expect(201);

    expect((retry.body as { id: string }).id).toBe(
      (firstAcceptance.body as { id: string }).id,
    );
    await expect(
      dataSource.getRepository(OrganizationMembershipEntity).count({
        where: {
          userId: recipient.id,
          state: OrganizationMembershipState.ACTIVE,
        },
      }),
    ).resolves.toBe(2);
    await expect(
      dataSource.getRepository(OrganizationMembershipEntity).findOneByOrFail({
        userId: recipient.id,
        organizationId: existing.organizationId,
        state: OrganizationMembershipState.ACTIVE,
      }),
    ).resolves.toBeDefined();
    const workspaces = await request(httpServer)
      .get('/workspaces')
      .set('authorization', `Bearer ${await accessToken(recipient.id)}`)
      .expect(200);
    expect(workspaces.body).toHaveLength(2);
  });

  async function createUser(prefix: string): Promise<UserEntity> {
    return dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: 'test-only-password-hash',
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
});
