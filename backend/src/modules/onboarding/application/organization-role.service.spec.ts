import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditLogEntity } from '../../collaboration/persistence/typeorm/collaboration.entities';
import { OrganizationEntity, OrganizationMembershipEntity, OrganizationMembershipState, OrganizationRoleDefinitionEntity, OrganizationRolePermissionEntity } from '../persistence/typeorm/onboarding.entities';
import { PostgresOrganizationPermissionService } from './organization-permission.service';
import { PostgresOrganizationRoleService } from './organization-role.service';

describe('PostgresOrganizationRoleService', () => {
  const role = { id: 'role-id', organizationId: 'org-id', name: 'HR', description: '', systemCode: null, isDefault: false, isProtected: false, archivedAt: null, version: 3 } as OrganizationRoleDefinitionEntity;
  const owner = { id: 'owner-membership', userId: 'owner-user', organizationId: 'org-id', roleId: 'owner-role', state: OrganizationMembershipState.ACTIVE } as OrganizationMembershipEntity;
  const roleRepo = { createQueryBuilder: jest.fn(), save: jest.fn(), find: jest.fn(), findOneBy: jest.fn() };
  const membershipRepo = { findOneBy: jest.fn(), createQueryBuilder: jest.fn(), count: jest.fn() };
  const rolePermissionRepo = { find: jest.fn(), delete: jest.fn(), insert: jest.fn() };
  const auditRepo = { create: jest.fn((value) => value), save: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === OrganizationEntity) return { createQueryBuilder: () => ({ setLock() { return this; }, where() { return this; }, getOne: async () => ({ id: 'org-id', archivedAt: null }) }) };
      if (entity === OrganizationRoleDefinitionEntity) return roleRepo;
      if (entity === OrganizationMembershipEntity) return membershipRepo;
      if (entity === OrganizationRolePermissionEntity) return rolePermissionRepo;
      if (entity === AuditLogEntity) return auditRepo;
      throw new Error(`Unexpected repository: ${entity?.name}`);
    }),
    query: jest.fn().mockResolvedValue([{ count: '0' }]),
  } as unknown as EntityManager;
  const roleQuery = { setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn() };
  const transaction = { run: jest.fn((work) => work(manager)) };
  let service: PostgresOrganizationRoleService;

  beforeEach(() => {
    jest.spyOn(PostgresOrganizationPermissionService.prototype, 'resolve').mockResolvedValue({ isOwner: true, permissions: [], role: { id: owner.roleId } as never });
    roleRepo.createQueryBuilder.mockReturnValue(roleQuery);
    roleRepo.findOneBy.mockResolvedValue(role);
    roleRepo.save.mockReset().mockImplementation(async (value) => value);
    membershipRepo.findOneBy.mockReset().mockResolvedValue(owner);
    membershipRepo.createQueryBuilder.mockReturnValue(roleQuery);
    membershipRepo.count.mockReset().mockResolvedValue(0);
    rolePermissionRepo.find.mockReset().mockResolvedValue([]);
    rolePermissionRepo.delete.mockReset();
    rolePermissionRepo.insert.mockReset();
    auditRepo.save.mockReset().mockResolvedValue({});
    roleQuery.getOne.mockReset().mockResolvedValue(role);
    transaction.run.mockClear();
    service = new PostgresOrganizationRoleService(transaction as never, manager);
  });

  it('rejects stale role edits before writing or auditing', async () => {
    await expect(service.update('owner-user', 'org-id', role.id, { name: 'People', expectedVersion: 2 }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(roleRepo.save).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('returns the persisted role description so editors can preserve metadata', async () => {
    roleRepo.find.mockResolvedValue([{ ...role, description: 'Recruiting and onboarding' }]);
    const result = await service.listRoles('owner-user', 'org-id');
    expect(result[0]).toMatchObject({ id: role.id, description: 'Recruiting and onboarding', version: 3 });
  });

  it('rejects Owner role assignment through the generic membership assignment path', async () => {
    roleQuery.getOne.mockResolvedValue({ ...role, systemCode: 'OWNER', isProtected: true });
    await expect(service.assignMembershipRole('owner-user', 'org-id', 'someone-else', 'owner-role'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(membershipRepo.count).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });
});
