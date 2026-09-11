import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { PostgresProjectParticipantService } from '../src/modules/projects/application/project-participant.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import { ProjectRole } from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresTeamService } from '../src/modules/projects/application/team.service';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Project participant qualification integration', () => {
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let participants: PostgresProjectParticipantService;
  let teams: PostgresTeamService;
  let sequence = 0;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    dataSource = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    projects = module.get(PostgresProjectService);
    participants = module.get(PostgresProjectParticipantService);
    teams = module.get(PostgresTeamService);
  });
  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(
      `TRUNCATE TABLE project_module_settings, project_task_statuses, project_memberships, project_teams, team_members, organization_invitations, organization_memberships, teams, organizations, users RESTART IDENTITY CASCADE`,
    );
  });
  afterAll(async () => dataSource.destroy());

  it('requires active Organization membership and a Participating Team, and preserves qualified members and last active PM', async () => {
    const workspace = await createWorkspace();
    const actor = {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };
    const project = await projects.create(actor, { name: 'Qualified project' });
    const member = await createMembership(
      workspace.organizationId,
      'qualified',
    );
    await expect(
      participants.addMember(
        actor,
        project.id,
        member.id,
        ProjectRole.CONTRIBUTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const delivery = await teams.create(actor, { name: 'Delivery' });
    await teams.addMember(actor, delivery.id, member.id);
    await participants.addTeam(actor, project.id, delivery.id);
    await participants.addMember(
      actor,
      project.id,
      member.id,
      ProjectRole.CONTRIBUTOR,
    );
    await expect(
      participants.removeTeam(actor, project.id, delivery.id),
    ).rejects.toBeInstanceOf(ConflictException);
    await projects.transition(actor, project.id, 'activate');
    await expect(
      participants.removeMember(actor, project.id, workspace.membershipId),
    ).rejects.toBeInstanceOf(ConflictException);
    member.state = OrganizationMembershipState.SUSPENDED;
    await dataSource.getRepository(OrganizationMembershipEntity).save(member);
    await expect(
      participants.addMember(
        actor,
        project.id,
        member.id,
        ProjectRole.CONTRIBUTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  async function createWorkspace() {
    const user = await dataSource
      .getRepository(UserEntity)
      .save({
        email: `qual-owner-${sequence}@example.test`,
        name: 'Owner',
        passwordHash: 'hash',
        profileImageUrl: null,
        emailVerifiedAt: new Date(),
        refreshTokenHash: null,
        disabledAt: null,
      });
    return onboarding.createOrganization(user.id, {
      name: `Qualification ${sequence}`,
    });
  }
  async function createMembership(organizationId: string, prefix: string) {
    const user = await dataSource
      .getRepository(UserEntity)
      .save({
        email: `${prefix}-${sequence}@example.test`,
        name: prefix,
        passwordHash: 'hash',
        profileImageUrl: null,
        emailVerifiedAt: new Date(),
        refreshTokenHash: null,
        disabledAt: null,
      });
    return dataSource
      .getRepository(OrganizationMembershipEntity)
      .save({
        organizationId,
        userId: user.id,
        role: OrganizationRole.MEMBER,
        state: OrganizationMembershipState.ACTIVE,
        joinedAt: new Date(),
        stateChangedAt: new Date(),
      });
  }
});
