import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { PostgresAuthService } from '../src/modules/onboarding/application/auth.service';
import { PostgresInvitationMembershipService } from '../src/modules/onboarding/application/invitation-membership.service';
import { PostgresOrganizationRoleService } from '../src/modules/onboarding/application/organization-role.service';
import { PostgresWorkspaceService } from '../src/modules/onboarding/application/workspace.service';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationEntity,
  OrganizationInvitationEntity,
  OrganizationRoleDefinitionEntity,
  TeamEntity,
  TeamMemberEntity,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { AuditLogEntity } from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';
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
    await expect(dataSource.getRepository(OrganizationRoleDefinitionEntity).findOneByOrFail({ id: membership.roleId, organizationId }))
      .resolves.toMatchObject({ systemCode: 'OWNER', isProtected: true });
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

  it('keeps custom Membership and invitation roles on roleId through acceptance and ownership transfer', async () => {
    const owner = await createUser('role-cutover-owner');
    const member = await createUser('role-cutover-member');
    const invitee = await createUser('role-cutover-invitee');
    const workspace = await onboarding.createOrganization(owner.id, { name: 'RoleId Cutover Workspace' });
    const memberRoleId = await defaultRoleId(workspace.organizationId, 'MEMBER');
    await dataSource.getRepository(OrganizationMembershipEntity).save({
      organizationId: workspace.organizationId,
      userId: member.id,
      roleId: memberRoleId,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date(),
      stateChangedAt: new Date(),
    });

    const roles = app.get(PostgresOrganizationRoleService);
    const hr = await roles.create(owner.id, workspace.organizationId, {
      name: 'HR',
      permissionCodes: ['org.members.read'],
    });
    await roles.assignMembershipRole(owner.id, workspace.organizationId, member.id, hr.id);
    const memberToken = await accessToken(member.id);
    await request(httpServer)
      .get(`/organizations/${workspace.organizationId}/permissions/me`)
      .set('authorization', `Bearer ${memberToken}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ isOwner: false, role: { id: hr.id, name: 'HR', systemCode: null }, permissions: ['org.members.read'] });
      });
    await request(httpServer)
      .get(`/organizations/${workspace.organizationId}`)
      .set('authorization', `Bearer ${memberToken}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ roleId: hr.id, roleName: 'HR', systemCode: null, isOwner: false });
      });
    await request(httpServer)
      .get('/workspaces')
      .set('authorization', `Bearer ${memberToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(expect.arrayContaining([expect.objectContaining({ organizationId: workspace.organizationId, roleId: hr.id, roleName: 'HR', systemCode: null, isOwner: false })]));
      });
    await request(httpServer)
      .patch(`/organizations/${workspace.organizationId}`)
      .set('authorization', `Bearer ${memberToken}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ name: 'HR cannot edit profile' })
      .expect(403);
    const invited = await invitations.createInvitation(owner.id, workspace.organizationId, {
      email: invitee.email,
      expiresAt: new Date(Date.now() + 60_000),
      roleId: hr.id,
    });
    const accepted = await invitations.acceptInvitation(invitee.id, invited.token);
    expect(accepted.roleId).toBe(hr.id);

    const adminRoleId = await defaultRoleId(workspace.organizationId, 'ADMIN');
    await app.get(PostgresWorkspaceService).transferOwner(owner.id, workspace.organizationId, {
      targetUserId: member.id,
      previousOwnerRoleId: adminRoleId,
    });
    const ownerPointer = await dataSource.getRepository(OrganizationEntity).findOneByOrFail({ id: workspace.organizationId });
    const targetMembership = await dataSource.getRepository(OrganizationMembershipEntity).findOneByOrFail({ organizationId: workspace.organizationId, userId: member.id });
    const formerOwnerMembership = await dataSource.getRepository(OrganizationMembershipEntity).findOneByOrFail({ organizationId: workspace.organizationId, userId: owner.id });
    expect(ownerPointer.ownerMembershipId).toBe(targetMembership.id);
    expect(targetMembership.roleId).toBe(await defaultRoleId(workspace.organizationId, 'OWNER'));
    expect(formerOwnerMembership.roleId).toBe(adminRoleId);
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
        roleId: await defaultRoleId(second.organizationId, 'MEMBER'),
      })
      .expect(403);

    await request(httpServer)
      .post(`/organizations/${first.organizationId}/invitations`)
      .set('authorization', `Bearer ${await accessToken(nonMember.id)}`)
      .set('x-organization-id', first.organizationId)
      .send({
        email: 'non-member-recipient@example.test',
        expiresAt: '2026-12-01T00:00:00.000Z',
        roleId: await defaultRoleId(first.organizationId, 'MEMBER'),
      })
      .expect(403);

    await dataSource.getRepository(OrganizationMembershipEntity).save({
      organizationId: first.organizationId,
      userId: inactiveMember.id,
      roleId: await defaultRoleId(first.organizationId, 'MEMBER'),
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
        roleId: await defaultRoleId(first.organizationId, 'MEMBER'),
      })
      .expect(403);

    await expect(
      dataSource.getRepository(OrganizationInvitationEntity).count(),
    ).resolves.toBe(0);
  });

  it('serves workspace settings with member read access and Owner/Admin governance boundaries', async () => {
    const owner = await createUser('settings-owner');
    const admin = await createUser('settings-admin');
    const member = await createUser('settings-member');
    const workspace = await onboarding.createOrganization(owner.id, {
      name: 'Governed Workspace',
    });
    await dataSource.getRepository(OrganizationMembershipEntity).save([
      {
        organizationId: workspace.organizationId,
        userId: admin.id,
        roleId: await defaultRoleId(workspace.organizationId, 'ADMIN'),
        state: OrganizationMembershipState.ACTIVE,
        joinedAt: new Date(),
        stateChangedAt: new Date(),
      },
      {
        organizationId: workspace.organizationId,
        userId: member.id,
        roleId: await defaultRoleId(workspace.organizationId, 'MEMBER'),
        state: OrganizationMembershipState.ACTIVE,
        joinedAt: new Date(),
        stateChangedAt: new Date(),
      },
    ]);
    const memberToken = await accessToken(member.id);
    const adminToken = await accessToken(admin.id);
    const ownerToken = await accessToken(owner.id);

    await request(httpServer)
      .get(`/organizations/${workspace.organizationId}`)
      .set('authorization', `Bearer ${memberToken}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: workspace.organizationId,
          name: 'Governed Workspace',
          role: 'Member',
          roleName: 'Member',
          roleId: expect.any(String),
          systemCode: 'MEMBER',
          isOwner: false,
        });
      });

    await request(httpServer)
      .get(`/organizations/${workspace.organizationId}/members`)
      .set('authorization', `Bearer ${memberToken}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(403);

    await request(httpServer)
      .patch(`/organizations/${workspace.organizationId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', workspace.organizationId)
      .send({ name: 'Admin Updated Workspace' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ name: 'Admin Updated Workspace' });
      });

    await request(httpServer)
      .get(`/organizations/${workspace.organizationId}/members`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ userId: owner.id, roleName: 'Owner', roleId: expect.any(String), isOwner: true }),
            expect.objectContaining({ userId: member.id, roleName: 'Member', roleId: expect.any(String), isOwner: false }),
          ]),
        );
      });

    await request(httpServer)
      .delete(`/organizations/${workspace.organizationId}/members/${owner.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(409);

    await request(httpServer)
      .delete(`/organizations/${workspace.organizationId}/members/${member.id}`)
      .set('authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', workspace.organizationId)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          userId: member.id,
          state: OrganizationMembershipState.REVOKED,
        });
      });

    await expect(
      dataSource.getRepository(AuditLogEntity).findOneByOrFail({
        actionCode: 'ORGANIZATION_PROFILE_UPDATED',
        organizationId: workspace.organizationId,
      }),
    ).resolves.toMatchObject({ actorUserId: admin.id });
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
        roleId: await defaultRoleId(first.organizationId, 'MEMBER'),
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

  it('serializes concurrent invitation acceptance with one membership and audit record', async () => {
    const owner = await createUser('concurrent-invitation-owner');
    const recipient = await createUser('concurrent-invitation-recipient');
    const workspace = await onboarding.createOrganization(owner.id, {
      name: 'Concurrent invitation workspace',
    });
    const created = await invitations.createInvitation(owner.id, workspace.organizationId, {
      email: recipient.email,
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
      roleId: await defaultRoleId(workspace.organizationId, 'MEMBER'),
    });
    const token = await accessToken(recipient.id);

    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(httpServer)
          .post('/invitations/accept')
          .set('authorization', `Bearer ${token}`)
          .send({ token: created.token }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array(12).fill(201),
    );
    expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
    await expect(
      dataSource.getRepository(OrganizationMembershipEntity).count({
        where: { userId: recipient.id, organizationId: workspace.organizationId },
      }),
    ).resolves.toBe(1);
    await expect(
      dataSource.getRepository(OrganizationInvitationEntity).findOneByOrFail({
        id: created.invitation.id,
      }),
    ).resolves.toMatchObject({
      state: 'ACCEPTED',
      acceptedUserId: recipient.id,
    });
    await expect(
      dataSource.getRepository(AuditLogEntity).count({
        where: {
          actionCode: 'ORGANIZATION_INVITATION_ACCEPTED',
        },
      }),
    ).resolves.toBe(1);
    await expect(
      dataSource.getRepository(TeamMemberEntity).count({
        where: { organizationMembershipId: responses[0].body.id },
      }),
    ).resolves.toBe(0);
  });

  it('persists an expired invitation lifecycle before rejecting acceptance', async () => {
    const owner = await createUser('expired-invitation-owner');
    const recipient = await createUser('expired-invitation-recipient');
    const workspace = await onboarding.createOrganization(owner.id, {
      name: 'Expired invitation workspace',
    });
    const created = await invitations.createInvitation(owner.id, workspace.organizationId, {
      email: recipient.email,
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    });
    await dataSource.getRepository(OrganizationInvitationEntity).update(
      created.invitation.id,
      { expiresAt: new Date(Date.now() - 1_000) },
    );

    await request(httpServer)
      .post('/invitations/accept')
      .set('authorization', `Bearer ${await accessToken(recipient.id)}`)
      .send({ token: created.token })
      .expect(409);

    await expect(
      dataSource.getRepository(OrganizationInvitationEntity).findOneByOrFail({
        id: created.invitation.id,
      }),
    ).resolves.toMatchObject({ state: 'EXPIRED' });
    await expect(
      dataSource.getRepository(OrganizationMembershipEntity).count({
        where: { userId: recipient.id, organizationId: workspace.organizationId },
      }),
    ).resolves.toBe(0);
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

  async function defaultRoleId(organizationId: string, systemCode: 'OWNER' | 'ADMIN' | 'MEMBER') {
    const role = await dataSource.getRepository(OrganizationRoleDefinitionEntity).findOneByOrFail({ organizationId, systemCode });
    return role.id;
  }

  function accessToken(userId: string): Promise<string> {
    return jwt.signAsync(
      { sub: userId, email: 'ignored-by-guard@example.test' },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
  }
});
