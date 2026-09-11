import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
  TeamMemberEntity,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresProjectParticipantService } from '../src/modules/projects/application/project-participant.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import { ProjectRole } from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Project HTTP authorization integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let participants: PostgresProjectParticipantService;
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
    onboarding = app.get(PostgresOrganizationOnboardingService);
    projects = app.get(PostgresProjectService);
    participants = app.get(PostgresProjectParticipantService);
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

  it('limits visibility to Project participants while reserving management for active Project Managers', async () => {
    const owner = await createUser('owner');
    const administrator = await createUser('administrator');
    const contributor = await createUser('contributor');
    const nonParticipant = await createUser('non-participant');
    const workspace = await onboarding.createOrganization(owner.id, {
      name: `Authorization Workspace ${sequence}`,
    });
    const actor = {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
    const project = await projects.create(actor, { name: 'Protected Project' });
    const administratorMembership = await addActiveMembership(
      administrator.id,
      workspace.organizationId,
      OrganizationRole.ADMIN,
    );
    const contributorMembership = await addActiveMembership(
      contributor.id,
      workspace.organizationId,
      OrganizationRole.MEMBER,
    );
    await addActiveMembership(
      nonParticipant.id,
      workspace.organizationId,
      OrganizationRole.MEMBER,
    );
    await dataSource.getRepository(TeamMemberEntity).save({
      organizationId: workspace.organizationId,
      teamId: workspace.generalTeamId,
      organizationMembershipId: contributorMembership.id,
      joinedAt: new Date(),
      removedAt: null,
    });
    await participants.addMember(
      actor,
      project.id,
      contributorMembership.id,
      ProjectRole.CONTRIBUTOR,
    );

    await getProject(owner.id, workspace.organizationId, project.id)
      .expect(200)
      .expect(({ body }) => {
        expect(body.viewer).toMatchObject({
          projectRole: ProjectRole.PROJECT_MANAGER,
          organizationRole: OrganizationRole.OWNER,
          canManage: true,
        });
      });
    await patchProject(owner.id, workspace.organizationId, project.id).expect(
      200,
    );

    await getProject(
      administrator.id,
      workspace.organizationId,
      project.id,
    )
      .expect(200)
      .expect(({ body }) => {
        expect(body.viewer).toMatchObject({
          projectRole: null,
          organizationRole: OrganizationRole.ADMIN,
          canManage: false,
        });
      });
    await patchProject(
      administrator.id,
      workspace.organizationId,
      project.id,
    ).expect(403);

    await getProject(
      contributor.id,
      workspace.organizationId,
      project.id,
    ).expect(200);
    await patchProject(
      contributor.id,
      workspace.organizationId,
      project.id,
    ).expect(403);

    await getProject(
      nonParticipant.id,
      workspace.organizationId,
      project.id,
    ).expect(403);
    await patchProject(
      nonParticipant.id,
      workspace.organizationId,
      project.id,
    ).expect(403);
  });

  it('does not reveal or mutate a Project through another active tenant context', async () => {
    const owner = await createUser('cross-tenant-owner');
    const first = await onboarding.createOrganization(owner.id, {
      name: `First Authorization Workspace ${sequence}`,
    });
    const second = await onboarding.createOrganization(owner.id, {
      name: `Second Authorization Workspace ${sequence}`,
    });
    const project = await projects.create(
      {
        organizationId: first.organizationId,
        membershipId: first.membershipId,
      },
      { name: 'First Tenant Project' },
    );

    await getProject(owner.id, second.organizationId, project.id).expect(404);
    await patchProject(owner.id, second.organizationId, project.id).expect(404);
    await get(owner.id, second.organizationId, '/projects').expect(200, []);
    await get(
      owner.id,
      second.organizationId,
      `/projects/${project.id}/statuses`,
    ).expect(404);
  });

  it('serves scoped Team and Project read models without exposing a non-participant', async () => {
    const owner = await createUser('read-owner');
    const contributor = await createUser('read-contributor');
    const nonParticipant = await createUser('read-non-participant');
    const workspace = await onboarding.createOrganization(owner.id, {
      name: `Read Workspace ${sequence}`,
    });
    const actor = {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
    const project = await projects.create(actor, { name: 'Read Project' });
    const contributorMembership = await addActiveMembership(
      contributor.id,
      workspace.organizationId,
      OrganizationRole.MEMBER,
    );
    await addActiveMembership(
      nonParticipant.id,
      workspace.organizationId,
      OrganizationRole.MEMBER,
    );
    await dataSource.getRepository(TeamMemberEntity).save({
      organizationId: workspace.organizationId,
      teamId: workspace.generalTeamId,
      organizationMembershipId: contributorMembership.id,
      joinedAt: new Date(),
      removedAt: null,
    });
    await participants.addMember(
      actor,
      project.id,
      contributorMembership.id,
      ProjectRole.CONTRIBUTOR,
    );

    const team = await get(
      contributor.id,
      workspace.organizationId,
      `/teams/${workspace.generalTeamId}`,
    ).expect(200);
    expect(team.body).toMatchObject({
      id: workspace.generalTeamId,
      members: expect.arrayContaining([
        expect.objectContaining({
          organizationMembershipId: contributorMembership.id,
          user: expect.objectContaining({ id: contributor.id }),
        }),
      ]),
    });

    const visible = await get(
      contributor.id,
      workspace.organizationId,
      '/projects',
    ).expect(200);
    expect(visible.body).toEqual([
      expect.objectContaining({
        id: project.id,
        viewer: expect.objectContaining({
          projectRole: ProjectRole.CONTRIBUTOR,
          organizationRole: OrganizationRole.MEMBER,
          canManage: false,
        }),
      }),
    ]);
    await get(
      contributor.id,
      workspace.organizationId,
      `/projects/${project.id}/teams`,
    )
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([
          expect.objectContaining({ id: workspace.generalTeamId }),
        ]);
      });
    await get(
      contributor.id,
      workspace.organizationId,
      `/projects/${project.id}/members`,
    )
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              projectMembershipId: expect.any(String),
              organizationMembershipId: contributorMembership.id,
              role: ProjectRole.CONTRIBUTOR,
            }),
          ]),
        );
      });
    await get(
      contributor.id,
      workspace.organizationId,
      `/projects/${project.id}/statuses`,
    )
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(4);
        expect(
          body.map((status: { position: number }) => status.position),
        ).toEqual([0, 1, 2, 3]);
      });
    await get(
      contributor.id,
      workspace.organizationId,
      `/projects/${project.id}/modules`,
    )
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(4);
      });

    await get(nonParticipant.id, workspace.organizationId, '/projects').expect(
      200,
      [],
    );
    await get(
      nonParticipant.id,
      workspace.organizationId,
      `/projects/${project.id}/members`,
    ).expect(403);
  });

  function getProject(
    userId: string,
    organizationId: string,
    projectId: string,
  ) {
    return request(httpServer)
      .get(`/projects/${projectId}`)
      .set('authorization', `Bearer ${accessToken(userId)}`)
      .set('x-organization-id', organizationId);
  }

  function patchProject(
    userId: string,
    organizationId: string,
    projectId: string,
  ) {
    return request(httpServer)
      .patch(`/projects/${projectId}`)
      .set('authorization', `Bearer ${accessToken(userId)}`)
      .set('x-organization-id', organizationId)
      .send({ description: 'Attempted managed update' });
  }

  function get(userId: string, organizationId: string, path: string) {
    return request(httpServer)
      .get(path)
      .set('authorization', `Bearer ${accessToken(userId)}`)
      .set('x-organization-id', organizationId);
  }

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

  function addActiveMembership(
    userId: string,
    organizationId: string,
    role: OrganizationRole,
  ): Promise<OrganizationMembershipEntity> {
    return dataSource.getRepository(OrganizationMembershipEntity).save({
      userId,
      organizationId,
      role,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date(),
      stateChangedAt: new Date(),
    });
  }

  function accessToken(userId: string): string {
    return jwt.sign(
      { sub: userId, email: 'ignored-by-guard@example.test' },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
  }
});
