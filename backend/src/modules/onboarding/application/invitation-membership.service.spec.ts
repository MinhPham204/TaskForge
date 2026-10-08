import type { EntityManager } from 'typeorm';
import {
  InvitationState,
  OrganizationEntity,
  OrganizationInvitationEntity,
  OrganizationMembershipEntity,
  OrganizationRoleDefinitionEntity,
  OrganizationRolePermissionEntity,
  UserEntity,
} from '../persistence/typeorm/onboarding.entities';
import type {
  OrganizationMembershipState,
} from '../persistence/typeorm/onboarding.entities';
import { PostgresInvitationMembershipService } from './invitation-membership.service';
import { PostgresOrganizationPermissionService } from './organization-permission.service';

describe('PostgresInvitationMembershipService', () => {
  const user = {
    id: 'user-id',
    email: 'invitee@example.test',
    disabledAt: null,
  } as UserEntity;
  const organization = {
    id: 'organization-id',
    archivedAt: null,
    ownerMembershipId: 'owner-membership-id',
  } as OrganizationEntity;
  const invitation = {
    id: 'invitation-id',
    organizationId: organization.id,
    email: user.email,
    roleId: 'member-role-id',
    state: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000),
    respondedAt: null,
    acceptedUserId: null,
  } as OrganizationInvitationEntity;
  const activeOwner = {
    id: 'owner-membership-id',
    organizationId: organization.id,
    userId: 'owner-user-id',
    roleId: 'owner-role-id',
    state: 'ACTIVE' as OrganizationMembershipState,
  } as OrganizationMembershipEntity;
  const membership = {
    id: 'membership-id',
    organizationId: organization.id,
    userId: user.id,
    roleId: 'member-role-id',
    state: 'ACTIVE' as OrganizationMembershipState,
    stateChangedAt: new Date(),
  } as OrganizationMembershipEntity;
  const userQueryBuilder = makeQueryBuilder();
  const invitationQueryBuilder = makeQueryBuilder();
  const organizationQueryBuilder = makeQueryBuilder();
  const actorQueryBuilder = makeQueryBuilder();
  const targetQueryBuilder = makeQueryBuilder();
  const userRepository = {
    createQueryBuilder: jest.fn(),
    findOneBy: jest.fn(),
  };
  const invitationRepository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
  };
  const organizationRepository = {
    createQueryBuilder: jest.fn(),
    findOneBy: jest.fn(),
  };
  const membershipRepository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
  };
  const roleRepository = { findOneBy: jest.fn(), createQueryBuilder: jest.fn() };
  const rolePermissionRepository = { find: jest.fn() };
  const auditRepository = { create: jest.fn((vals) => vals), save: jest.fn().mockResolvedValue({}) };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === UserEntity) return userRepository;
      if (entity === OrganizationEntity) return organizationRepository;
      if (entity === OrganizationInvitationEntity) return invitationRepository;
      if (entity === OrganizationMembershipEntity) return membershipRepository;
      if (entity === OrganizationRoleDefinitionEntity) return roleRepository;
      if (entity === OrganizationRolePermissionEntity) return rolePermissionRepository;
      if (entity?.name === 'AuditLogEntity') return auditRepository;
      throw new Error('Unexpected entity');
    }),
  } as unknown as EntityManager;
  const run = jest.fn();

  beforeEach(() => {
    jest.spyOn(PostgresOrganizationPermissionService.prototype, 'requirePermission').mockResolvedValue({} as never);
    user.email = invitation.email;
    invitation.state = InvitationState.PENDING;
    invitation.acceptedUserId = null;
    invitation.respondedAt = null;
    invitation.expiresAt = new Date(Date.now() + 60_000);
    membership.state = 'ACTIVE' as OrganizationMembershipState;
    membership.roleId = 'member-role-id';
    activeOwner.state = 'ACTIVE' as OrganizationMembershipState;
    activeOwner.roleId = 'owner-role-id';
    organization.ownerMembershipId = activeOwner.id;
    for (const repository of [
      userRepository,
      invitationRepository,
      organizationRepository,
      membershipRepository,
      roleRepository,
      rolePermissionRepository,
    ]) {
      Object.values(repository).forEach((method) => method.mockReset());
    }
    run.mockReset();
    userQueryBuilder.getOne.mockResolvedValue(user);
    invitationQueryBuilder.getOne.mockResolvedValue(invitation);
    invitationRepository.findOneBy.mockResolvedValue(invitation);
    organizationQueryBuilder.getOne.mockResolvedValue(organization);
    actorQueryBuilder.getOne.mockResolvedValue(null);
    targetQueryBuilder.getOne.mockResolvedValue(null);
    roleRepository.findOneBy.mockResolvedValue({ id: 'member-role-id', organizationId: organization.id, name: 'Member', systemCode: 'MEMBER', isProtected: false, archivedAt: null });
    rolePermissionRepository.find.mockResolvedValue([]);
    userRepository.createQueryBuilder.mockReturnValue(userQueryBuilder);
    invitationRepository.createQueryBuilder.mockReturnValue(
      invitationQueryBuilder,
    );
    organizationRepository.createQueryBuilder.mockReturnValue(
      organizationQueryBuilder,
    );
    membershipRepository.createQueryBuilder
      .mockReturnValueOnce(actorQueryBuilder)
      .mockReturnValueOnce(targetQueryBuilder);
    membershipRepository.create.mockImplementation((values) => ({
      id: membership.id,
      ...values,
    }));
    membershipRepository.save.mockImplementation((value) =>
      Promise.resolve(value),
    );
    invitationRepository.save.mockImplementation((value) =>
      Promise.resolve(value),
    );
    run.mockImplementation((work) => work(manager));
  });

  it('accepts an invitation by atomically creating an active Membership', async () => {
    const service = makeService();

    await expect(
      service.acceptInvitation(user.id, 'raw-token'),
    ).resolves.toEqual(
      expect.objectContaining({
        organizationId: organization.id,
        userId: user.id,
        state: 'ACTIVE',
      }),
    );

    expect(run).toHaveBeenCalledTimes(1);
    expect(userQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(invitationQueryBuilder.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
    );
    expect(organizationQueryBuilder.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
    );
    expect(membershipRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        roleId: 'member-role-id',
        state: 'ACTIVE',
      }),
    );
    expect(invitation.state).toBe('ACCEPTED');
    expect(invitation.acceptedUserId).toBe(user.id);
  });

  it('makes repeated acceptance by the same user idempotent without a second Membership', async () => {
    invitation.state = InvitationState.ACCEPTED;
    invitation.acceptedUserId = user.id;
    membershipRepository.findOneBy.mockResolvedValue(membership);
    const service = makeService();

    await expect(service.acceptInvitation(user.id, 'raw-token')).resolves.toBe(
      membership,
    );

    expect(membershipRepository.create).not.toHaveBeenCalled();
    expect(membershipRepository.save).not.toHaveBeenCalled();
  });

  it('prevents an administrator from suspending the active Owner', async () => {
    actorQueryBuilder.getOne.mockResolvedValue({
      ...activeOwner,
      userId: 'admin-user-id',
      roleId: 'admin-role-id',
    });
    targetQueryBuilder.getOne.mockResolvedValue(activeOwner);
    const service = makeService();

    await expect(
      service.suspendMembership(
        'admin-user-id',
        organization.id,
        'owner-user-id',
      ),
    ).rejects.toThrow(
      'Transfer ownership before changing the active owner membership',
    );

    expect(membershipRepository.save).not.toHaveBeenCalled();
  });

  it('rejects acceptance when the authenticated email does not own the invitation', async () => {
    user.email = 'different@example.test';
    const service = makeService();

    await expect(
      service.acceptInvitation(user.id, 'raw-token'),
    ).rejects.toThrow('Invitation belongs to another email address');

    expect(membershipRepository.create).not.toHaveBeenCalled();
    user.email = invitation.email;
  });

  function makeService(): PostgresInvitationMembershipService {
    return new PostgresInvitationMembershipService(manager, { run } as never);
  }
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
