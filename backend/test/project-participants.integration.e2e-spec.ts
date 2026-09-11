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

describe('PostgreSQL Project participant integration', () => {
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

  it('adds/restores relations and rejects duplicates and IDs from another tenant', async () => {
    const first = await workspace('first');
    const second = await workspace('second');
    const actor = {
      organizationId: first.organizationId,
      membershipId: first.membershipId,
    };
    const project = await projects.create(actor, {
      name: 'Participant Project',
    });
    const extraTeam = await teams.create(actor, { name: 'Design' });
    const member = await membership(first.organizationId, 'member');
    await teams.addMember(actor, first.generalTeamId, member.id);
    await participants.addTeam(actor, project.id, extraTeam.id);
    await expect(
      participants.addTeam(actor, project.id, extraTeam.id),
    ).rejects.toBeInstanceOf(ConflictException);
    await participants.addMember(
      actor,
      project.id,
      member.id,
      ProjectRole.CONTRIBUTOR,
    );
    await expect(
      participants.addMember(
        actor,
        project.id,
        member.id,
        ProjectRole.PROJECT_MANAGER,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      participants.addTeam(actor, project.id, second.generalTeamId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      participants.addMember(
        actor,
        project.id,
        second.membershipId,
        ProjectRole.CONTRIBUTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await participants.removeTeam(actor, project.id, extraTeam.id);
    await expect(
      participants.removeTeam(actor, project.id, second.generalTeamId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  async function workspace(prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: 'hash',
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
    return onboarding.createOrganization(user.id, {
      name: `${prefix} workspace`,
    });
  }
  async function membership(organizationId: string, prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: 'hash',
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
    return dataSource.getRepository(OrganizationMembershipEntity).save({
      organizationId,
      userId: user.id,
      role: OrganizationRole.MEMBER,
      state: OrganizationMembershipState.ACTIVE,
      joinedAt: new Date(),
      stateChangedAt: new Date(),
    });
  }
});
