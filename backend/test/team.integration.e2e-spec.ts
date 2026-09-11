import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
  TeamEntity,
  TeamMemberEntity,
  UserEntity,
} from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { PostgresTeamService } from '../src/modules/projects/application/team.service';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL Team lifecycle integration', () => {
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let teams: PostgresTeamService;
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PostgresOnboardingTestModule],
    }).compile();
    dataSource = module.get(DataSource);
    onboarding = module.get(PostgresOrganizationOnboardingService);
    teams = module.get(PostgresTeamService);
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

  afterAll(async () => dataSource.destroy());

  it('creates, updates, archives, and preserves Organization-scoped name uniqueness', async () => {
    const workspace = await createWorkspace('lifecycle');
    const actor = {
      organizationId: workspace.organizationId,
      membershipId: workspace.membershipId,
    };

    const created = await teams.create(actor, {
      name: '  Product  ',
      description: 'First delivery team',
    });
    expect(created.name).toBe('Product');

    const updated = await teams.update(actor, created.id, {
      name: 'Product Engineering',
    });
    expect(updated.name).toBe('Product Engineering');

    const archived = await teams.archive(actor, created.id);
    expect(archived.archivedAt).toBeInstanceOf(Date);
    await expect(
      teams.update(actor, created.id, { description: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      teams.create(actor, { name: 'Product Engineering' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('only adds active same-Organization Memberships and soft-removes then restores the relation', async () => {
    const first = await createWorkspace('members-first');
    const second = await createWorkspace('members-second');
    const actor = {
      organizationId: first.organizationId,
      membershipId: first.membershipId,
    };
    const team = await teams.create(actor, { name: 'Delivery' });
    const activeMember = await createMembership(first.organizationId, 'active');
    const inactiveMember = await createMembership(
      first.organizationId,
      'inactive',
    );
    inactiveMember.state = OrganizationMembershipState.SUSPENDED;
    await dataSource
      .getRepository(OrganizationMembershipEntity)
      .save(inactiveMember);

    const added = await teams.addMember(actor, team.id, activeMember.id);
    expect(added.removedAt).toBeNull();
    await expect(
      teams.addMember(actor, team.id, activeMember.id),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      teams.addMember(actor, team.id, inactiveMember.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      teams.addMember(actor, team.id, second.membershipId),
    ).rejects.toBeInstanceOf(NotFoundException);

    const removed = await teams.removeMember(actor, team.id, activeMember.id);
    expect(removed.removedAt).toBeInstanceOf(Date);
    const restored = await teams.addMember(actor, team.id, activeMember.id);
    expect(restored.removedAt).toBeNull();

    const persisted = await dataSource
      .getRepository(TeamMemberEntity)
      .findOneByOrFail({
        teamId: team.id,
        organizationMembershipId: activeMember.id,
      });
    expect(persisted.organizationId).toBe(first.organizationId);
  });

  async function createWorkspace(prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: 'test-only-password-hash',
      profileImageUrl: null,
      emailVerifiedAt: new Date(),
      refreshTokenHash: null,
      disabledAt: null,
    });
    return onboarding.createOrganization(user.id, {
      name: `${prefix} workspace`,
    });
  }

  async function createMembership(organizationId: string, prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({
      email: `${prefix}-${sequence}@example.test`,
      name: prefix,
      passwordHash: 'test-only-password-hash',
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
