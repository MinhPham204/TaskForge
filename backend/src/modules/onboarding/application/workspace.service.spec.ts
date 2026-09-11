import type { EntityManager } from 'typeorm';
import {
  OrganizationEntity,
  OrganizationMembershipEntity,
} from '../persistence/typeorm/onboarding.entities';
import type { OrganizationRole } from '../persistence/typeorm/onboarding.entities';
import { PostgresWorkspaceService } from './workspace.service';

describe('PostgresWorkspaceService', () => {
  const organization = {
    id: 'organization-id',
    name: 'Workspace',
    logoUrl: null,
    archivedAt: null,
  } as OrganizationEntity;
  const currentOwner = {
    id: 'owner-membership-id',
    organizationId: organization.id,
    userId: 'owner-user-id',
    role: 'OWNER' as OrganizationRole,
    state: 'ACTIVE',
  } as OrganizationMembershipEntity;
  const targetMember = {
    id: 'target-membership-id',
    organizationId: organization.id,
    userId: 'target-user-id',
    role: 'MEMBER' as OrganizationRole,
    state: 'ACTIVE',
  } as OrganizationMembershipEntity;
  const organizationQueryBuilder = makeQueryBuilder();
  const ownerQueryBuilder = makeQueryBuilder();
  const targetQueryBuilder = makeQueryBuilder();
  const organizationRepository = {
    createQueryBuilder: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
  };
  const membershipRepository = {
    createQueryBuilder: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === OrganizationEntity) return organizationRepository;
      if (entity === OrganizationMembershipEntity) return membershipRepository;
      throw new Error('Unexpected entity');
    }),
  } as unknown as EntityManager;
  const run = jest.fn();

  beforeEach(() => {
    organization.archivedAt = null;
    currentOwner.role = 'OWNER' as OrganizationRole;
    targetMember.role = 'MEMBER' as OrganizationRole;
    organizationRepository.createQueryBuilder.mockReset();
    organizationRepository.findOneBy.mockReset();
    organizationRepository.save.mockReset();
    membershipRepository.createQueryBuilder.mockReset();
    membershipRepository.findOneBy.mockReset();
    membershipRepository.save.mockReset();
    run.mockReset();

    organizationQueryBuilder.getOne.mockResolvedValue(organization);
    ownerQueryBuilder.getOne.mockResolvedValue(currentOwner);
    targetQueryBuilder.getOne.mockResolvedValue(targetMember);
    organizationRepository.createQueryBuilder.mockReturnValue(
      organizationQueryBuilder,
    );
    membershipRepository.createQueryBuilder
      .mockReturnValueOnce(ownerQueryBuilder)
      .mockReturnValueOnce(targetQueryBuilder);
    membershipRepository.save.mockImplementation((membership) =>
      Promise.resolve(membership),
    );
    run.mockImplementation((work) => work(manager));
  });

  it('locks Organization and both active Memberships then preserves exactly one active Owner', async () => {
    const service = new PostgresWorkspaceService(manager, { run } as never);

    await expect(
      service.transferOwner('owner-user-id', organization.id, {
        targetUserId: 'target-user-id',
        previousOwnerRole: 'ADMIN',
      }),
    ).resolves.toBeUndefined();

    expect(run).toHaveBeenCalledTimes(1);
    expect(organizationQueryBuilder.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
    );
    expect(ownerQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(targetQueryBuilder.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
    );
    expect(currentOwner.role).toBe('ADMIN');
    expect(targetMember.role).toBe('OWNER');
    expect(membershipRepository.save).toHaveBeenNthCalledWith(1, currentOwner);
    expect(membershipRepository.save).toHaveBeenNthCalledWith(2, targetMember);
  });

  it('does not start a transaction for an invalid former-owner role', async () => {
    const service = new PostgresWorkspaceService(manager, { run } as never);

    expect(() =>
      service.transferOwner('owner-user-id', organization.id, {
        targetUserId: 'target-user-id',
        previousOwnerRole: 'OWNER',
      } as never),
    ).toThrow('Previous owner role must be ADMIN or MEMBER');

    expect(run).not.toHaveBeenCalled();
  });
});

function makeQueryBuilder() {
  const queryBuilder = {
    setLock: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    getOne: jest.fn(),
  };
  queryBuilder.setLock.mockReturnValue(queryBuilder);
  queryBuilder.where.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);
  return queryBuilder;
}
