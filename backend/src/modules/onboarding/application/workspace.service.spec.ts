import type { EntityManager } from 'typeorm';
import {
  OrganizationEntity,
  OrganizationMembershipEntity,
  OrganizationRoleDefinitionEntity,
} from '../persistence/typeorm/onboarding.entities';
import { AuditLogEntity } from '../../collaboration/persistence/typeorm/collaboration.entities';
import { PostgresWorkspaceService } from './workspace.service';

describe('PostgresWorkspaceService', () => {
  const organization = {
    id: 'organization-id',
    name: 'Workspace',
    logoUrl: null,
    archivedAt: null,
    ownerMembershipId: 'owner-membership-id',
  } as OrganizationEntity;
  const currentOwner = {
    id: 'owner-membership-id',
    organizationId: organization.id,
    userId: 'owner-user-id',
    roleId: 'owner-role-id',
    state: 'ACTIVE',
  } as OrganizationMembershipEntity;
  const targetMember = {
    id: 'target-membership-id',
    organizationId: organization.id,
    userId: 'target-user-id',
    roleId: 'member-role-id',
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
  const roleRepository = { findOneBy: jest.fn() };
  const auditRepository = {
    create: jest.fn((values) => values),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === OrganizationEntity) return organizationRepository;
      if (entity === OrganizationMembershipEntity) return membershipRepository;
      if (entity === OrganizationRoleDefinitionEntity) return roleRepository;
      if (entity === AuditLogEntity) return auditRepository;
      throw new Error('Unexpected entity');
    }),
  } as unknown as EntityManager;
  const run = jest.fn();

  beforeEach(() => {
    organization.archivedAt = null;
    organization.ownerMembershipId = currentOwner.id;
    currentOwner.roleId = 'owner-role-id';
    targetMember.roleId = 'member-role-id';
    organizationRepository.createQueryBuilder.mockReset();
    organizationRepository.findOneBy.mockReset();
    organizationRepository.save.mockReset();
    membershipRepository.createQueryBuilder.mockReset();
    membershipRepository.findOneBy.mockReset();
    membershipRepository.save.mockReset();
    roleRepository.findOneBy.mockReset().mockImplementation(({ id }) => Promise.resolve(id === 'unknown-role-id' ? null : {
      id,
      organizationId: organization.id,
      systemCode: id === 'owner-role-id' ? 'OWNER' : id === 'member-role-id' ? 'MEMBER' : 'ADMIN',
      isProtected: id === 'owner-role-id',
      archivedAt: null,
    }));
    auditRepository.create.mockClear();
    auditRepository.save.mockReset();
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
    auditRepository.save.mockResolvedValue({});
    run.mockImplementation((work) => work(manager));
  });

  it('locks Organization and both active Memberships then preserves exactly one active Owner', async () => {
    const service = new PostgresWorkspaceService(manager, { run } as never);

    await expect(
      service.transferOwner('owner-user-id', organization.id, {
        targetUserId: 'target-user-id',
        previousOwnerRoleId: 'admin-role-id',
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
    expect(currentOwner.roleId).toBe('admin-role-id');
    expect(targetMember.roleId).toBe('owner-role-id');
    expect(organization.ownerMembershipId).toBe(targetMember.id);
    expect(membershipRepository.save).toHaveBeenNthCalledWith(1, currentOwner);
    expect(membershipRepository.save).toHaveBeenNthCalledWith(2, targetMember);
  });

  it('rejects an invalid former-owner roleId through the transaction', async () => {
    const service = new PostgresWorkspaceService(manager, { run } as never);

    expect(() =>
      service.transferOwner('owner-user-id', organization.id, {
        targetUserId: 'target-user-id',
        previousOwnerRoleId: 'unknown-role-id',
      }),
    ).rejects.toThrow('Previous owner role must be an active non-Owner role in this Organization');

    expect(run).toHaveBeenCalledTimes(1);
  });
});

function makeQueryBuilder() {
  const queryBuilder = {
    setLock: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    innerJoin: jest.fn(),
    getOne: jest.fn(),
  };
  queryBuilder.setLock.mockReturnValue(queryBuilder);
  queryBuilder.where.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);
  queryBuilder.innerJoin.mockReturnValue(queryBuilder);
  return queryBuilder;
}
