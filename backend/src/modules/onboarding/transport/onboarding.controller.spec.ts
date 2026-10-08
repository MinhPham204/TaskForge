import { ForbiddenException } from '@nestjs/common';
import { PostgresOnboardingController } from './onboarding.controller';

describe('PostgresOnboardingController', () => {
  const organizations = { createOrganization: jest.fn() };
  const workspaces = { listWorkspaces: jest.fn() };
  const invitations = {
    acceptInvitation: jest.fn(),
    createInvitation: jest.fn(),
    listMyPendingInvitations: jest.fn(),
    leaveOrganization: jest.fn(),
  };
  const permissions = { resolve: jest.fn() };
  const controller = new PostgresOnboardingController(
    organizations as never,
    workspaces as never,
    invitations as never,
    permissions as never,
    {} as never,
  );

  beforeEach(() => {
    Object.values(organizations).forEach((method) => method.mockReset());
    Object.values(workspaces).forEach((method) => method.mockReset());
    Object.values(invitations).forEach((method) => method.mockReset());
    permissions.resolve.mockReset();
  });

  it('maps the frontend token contract to invitation acceptance for the authenticated subject', async () => {
    invitations.acceptInvitation.mockResolvedValue({ id: 'membership-id' });

    await expect(
      controller.acceptInvitation('user-id', {
        token: 'opaque-invitation-token-value',
      }),
    ).resolves.toEqual({ id: 'membership-id' });

    expect(invitations.acceptInvitation).toHaveBeenCalledWith(
      'user-id',
      'opaque-invitation-token-value',
    );
  });

  it('does not let a valid tenant header authorize an invitation for another Organization', async () => {
    await expect(
      controller.createInvitation(
        'user-id',
        'other-organization-id',
        {
          email: 'member@example.test',
          expiresAt: new Date('2026-10-04T00:00:00.000Z'),
          roleId: 'member-role-id',
        },
        {
          headers: {},
          postgresTenant: {
            id: 'membership-id',
            userId: 'user-id',
            organizationId: 'verified-organization-id',
            roleId: 'admin-role-id',
          },
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitations.createInvitation).not.toHaveBeenCalled();
  });

  it('does not expose the raw invitation credential in an HTTP response', async () => {
    invitations.createInvitation.mockResolvedValue({
      token: 'never-send-this-to-the-client',
      invitation: {
        id: 'invitation-id',
        organizationId: 'organization-id',
        email: 'member@example.test',
        roleId: 'member-role-id',
        state: 'PENDING',
        expiresAt: new Date('2026-10-04T00:00:00.000Z'),
      },
    });

    const response = await controller.createInvitation(
      'user-id',
      'organization-id',
      {
        email: 'member@example.test',
        expiresAt: new Date('2026-10-04T00:00:00.000Z'),
        roleId: 'member-role-id',
      },
      {
        headers: {},
        postgresTenant: {
          id: 'membership-id',
          userId: 'user-id',
          organizationId: 'organization-id',
          roleId: 'admin-role-id',
        },
      },
    );

    expect(response).not.toHaveProperty('token');
  });

  it('leaves the verified Organization for the authenticated subject', async () => {
    invitations.leaveOrganization.mockResolvedValue({
      id: 'membership-id',
      state: 'LEFT',
    });

    const response = await controller.leaveOrganization(
      'user-id',
      'organization-id',
      {
        headers: {},
        postgresTenant: {
          id: 'membership-id',
          userId: 'user-id',
          organizationId: 'organization-id',
          roleId: 'member-role-id',
        },
      },
    );

    expect(response).toEqual({ id: 'membership-id', state: 'LEFT' });
    expect(invitations.leaveOrganization).toHaveBeenCalledWith(
      'user-id',
      'organization-id',
    );
  });

  it('resolves capabilities only after verifying the requested tenant', async () => {
    permissions.resolve.mockResolvedValue({ isOwner: false, role: { id: 'role-id' }, permissions: [] });
    const response = await controller.getMyOrganizationPermissions('user-id', 'organization-id', {
      headers: {},
      postgresTenant: {
        id: 'membership-id', userId: 'user-id', organizationId: 'organization-id', roleId: 'member-role-id',
      },
    });
    expect(response).toEqual({ isOwner: false, role: { id: 'role-id' }, permissions: [] });
    expect(permissions.resolve).toHaveBeenCalledWith('user-id', 'organization-id');
  });

  it('rejects capability lookup when verified tenant does not match route', async () => {
    expect(() => controller.getMyOrganizationPermissions('user-id', 'other-org', {
      headers: {},
      postgresTenant: {
        id: 'membership-id', userId: 'user-id', organizationId: 'organization-id', roleId: 'member-role-id',
      },
    })).toThrow(ForbiddenException);
    expect(permissions.resolve).not.toHaveBeenCalled();
  });
});
