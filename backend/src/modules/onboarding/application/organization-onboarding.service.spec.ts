import type { EntityManager } from 'typeorm';
import {
  OrganizationEntity,
  OrganizationMembershipEntity,
  TeamEntity,
  TeamMemberEntity,
  UserEntity,
} from '../persistence/typeorm/onboarding.entities';
import { PostgresOrganizationOnboardingService } from './organization-onboarding.service';

describe('PostgresOrganizationOnboardingService', () => {
  const user = makeUser();
  const organization = { id: 'organization-id' } as OrganizationEntity;
  const membership = {
    id: 'membership-id',
  } as OrganizationMembershipEntity;
  const generalTeam = { id: 'team-id' } as TeamEntity;
  const userRepository = {
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const organizationRepository = { create: jest.fn(), save: jest.fn() };
  const membershipRepository = { create: jest.fn(), save: jest.fn() };
  const teamRepository = { create: jest.fn(), save: jest.fn() };
  const teamMemberRepository = { create: jest.fn(), save: jest.fn() };
  const auditRepository = { create: jest.fn((vals) => vals), save: jest.fn().mockResolvedValue({}) };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === UserEntity) return userRepository;
      if (entity === OrganizationEntity) return organizationRepository;
      if (entity === OrganizationMembershipEntity) return membershipRepository;
      if (entity === TeamEntity) return teamRepository;
      if (entity === TeamMemberEntity) return teamMemberRepository;
      if (entity?.name === 'AuditLogEntity') return auditRepository;
      throw new Error('Unexpected entity');
    }),
  } as unknown as EntityManager;
  const run = jest.fn();

  beforeEach(() => {
    user.disabledAt = null;
    for (const repository of [
      userRepository,
      organizationRepository,
      membershipRepository,
      teamRepository,
      teamMemberRepository,
    ]) {
      Object.values(repository).forEach((method) => method.mockReset());
    }
    run.mockReset();
    userRepository.findOneBy.mockResolvedValue(user);
    organizationRepository.create.mockImplementation((values) => ({
      id: organization.id,
      ...values,
    }));
    organizationRepository.save.mockResolvedValue(organization);
    membershipRepository.create.mockImplementation((values) => ({
      id: membership.id,
      ...values,
    }));
    membershipRepository.save.mockResolvedValue(membership);
    teamRepository.create.mockImplementation((values) => ({
      id: generalTeam.id,
      ...values,
    }));
    teamRepository.save.mockResolvedValue(generalTeam);
    teamMemberRepository.create.mockImplementation((values) => values);
    teamMemberRepository.save.mockResolvedValue({});
    run.mockImplementation((work) => work(manager));
  });

  it('creates Organization, active OWNER Membership, General Team and TeamMember in one transaction', async () => {
    const service = new PostgresOrganizationOnboardingService({ run } as never);

    await expect(
      service.createOrganization(user.id, { name: '  Workspace  ' }),
    ).resolves.toEqual({
      organizationId: organization.id,
      membershipId: membership.id,
      generalTeamId: generalTeam.id,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(organizationRepository.create).toHaveBeenCalledWith({
      name: 'Workspace',
      logoUrl: null,
    });
    expect(membershipRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: organization.id,
        userId: user.id,
        role: 'OWNER',
        state: 'ACTIVE',
      }),
    );
    expect(teamRepository.create).toHaveBeenCalledWith({
      organizationId: organization.id,
      name: 'General',
      description: '',
      logoUrl: null,
    });
    expect(teamMemberRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: organization.id,
        teamId: generalTeam.id,
        organizationMembershipId: membership.id,
        removedAt: null,
      }),
    );
  });

  it('rejects a disabled global User before any onboarding write', async () => {
    user.disabledAt = new Date();
    const service = new PostgresOrganizationOnboardingService({ run } as never);

    await expect(
      service.createOrganization(user.id, { name: 'Workspace' }),
    ).rejects.toThrow('Disabled users cannot create an organization');

    expect(organizationRepository.create).not.toHaveBeenCalled();
    expect(membershipRepository.create).not.toHaveBeenCalled();
  });
});

function makeUser(): UserEntity {
  return {
    id: 'user-id',
    email: 'user@example.test',
    name: 'User',
    passwordHash: 'hash',
    profileImageUrl: null,
    emailVerifiedAt: new Date(),
    refreshTokenHash: null,
    disabledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
