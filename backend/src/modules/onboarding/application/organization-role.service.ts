import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { IsNull } from 'typeorm';
import { PostgresTransactionRunner } from '../../../database/transaction-runner';
import { writePostgresAudit } from '../../collaboration/application/audit.writer';
import { OrganizationEntity, OrganizationMembershipEntity, OrganizationMembershipState, OrganizationPermissionEntity, OrganizationRoleDefinitionEntity, OrganizationRolePermissionEntity } from '../persistence/typeorm/onboarding.entities';
import { PostgresOrganizationPermissionService } from './organization-permission.service';

export interface RoleInput { name: string; description?: string; permissionCodes: string[] }
export interface RoleUpdateInput { name?: string; description?: string; expectedVersion: number }

export class PostgresOrganizationRoleService {
  constructor(private readonly transactions: PostgresTransactionRunner, private readonly manager: EntityManager) {}

  async listPermissions(userId: string, organizationId: string) {
    await this.requireOwner(this.manager, userId, organizationId);
    return this.manager.getRepository(OrganizationPermissionEntity).find({ order: { resourceGroup: 'ASC', code: 'ASC' } });
  }

  async listRoles(userId: string, organizationId: string) {
    await this.requireOwner(this.manager, userId, organizationId);
    const roles = await this.manager.getRepository(OrganizationRoleDefinitionEntity).find({ where: { organizationId }, order: { isProtected: 'DESC', name: 'ASC' } });
    return Promise.all(roles.map((role) => this.summary(this.manager, role)));
  }

  async listInvitationRoles(userId: string, organizationId: string) {
    await new PostgresOrganizationPermissionService(this.manager).requirePermission(userId, organizationId, 'org.members.invite');
    const roles = await this.manager.getRepository(OrganizationRoleDefinitionEntity).find({ where: { organizationId, archivedAt: IsNull() }, order: { name: 'ASC' } });
    return Promise.all(roles.filter((role) => role.systemCode !== 'OWNER' && !role.isProtected).map((role) => this.summary(this.manager, role)));
  }

  create(userId: string, organizationId: string, input: RoleInput) {
    const name = requiredText(input.name, 80, 'Role name');
    const description = requiredText(input.description ?? '', 500, 'Role description', true);
    return this.transactions.run(async (manager) => {
      const owner = await this.requireOwner(manager, userId, organizationId, true);
      const codes = await this.validatePermissionCodes(manager, input.permissionCodes);
      const repo = manager.getRepository(OrganizationRoleDefinitionEntity);
      const role = await repo.save(repo.create({ organizationId, name, description, systemCode: null, isDefault: false, isProtected: false, archivedAt: null, version: 1 }));
      await this.replacePermissions(manager, organizationId, role.id, codes);
      await writePostgresAudit(manager, { organizationId, actorUserId: userId, actorMembershipId: owner.id, actionCode: 'ORGANIZATION_ROLE_CREATED', targetType: 'ORGANIZATION_ROLE', targetId: role.id, afterData: { name, description, permissionCodes: codes, version: role.version } });
      return this.summary(manager, role);
    }).catch(mapUniqueConflict);
  }

  update(userId: string, organizationId: string, roleId: string, input: RoleUpdateInput) {
    return this.transactions.run(async (manager) => {
      const owner = await this.requireOwner(manager, userId, organizationId, true);
      const role = await this.lockRole(manager, organizationId, roleId);
      if (role.archivedAt) throw new ConflictException('Archived roles cannot be edited');
      if (role.isDefault || role.isProtected || role.systemCode) throw new ConflictException('Default and protected roles cannot be renamed');
      this.assertVersion(role, input.expectedVersion);
      const before = { name: role.name, description: role.description, version: role.version };
      const name = input.name === undefined ? role.name : requiredText(input.name, 80, 'Role name');
      const description = input.description === undefined ? role.description : requiredText(input.description, 500, 'Role description', true);
      if (name === role.name && description === role.description) return this.summary(manager, role);
      role.name = name; role.description = description; role.version += 1;
      const saved = await manager.getRepository(OrganizationRoleDefinitionEntity).save(role);
      await writePostgresAudit(manager, { organizationId, actorUserId: userId, actorMembershipId: owner.id, actionCode: 'ORGANIZATION_ROLE_UPDATED', targetType: 'ORGANIZATION_ROLE', targetId: role.id, beforeData: before, afterData: { name, description, version: saved.version } });
      return this.summary(manager, saved);
    }).catch(mapUniqueConflict);
  }

  replaceRolePermissions(userId: string, organizationId: string, roleId: string, input: { permissionCodes: string[]; expectedVersion: number }) {
    return this.transactions.run(async (manager) => {
      const owner = await this.requireOwner(manager, userId, organizationId, true);
      const role = await this.lockRole(manager, organizationId, roleId);
      if (role.archivedAt) throw new ConflictException('Archived roles cannot be edited');
      if (role.isProtected || role.systemCode === 'OWNER') throw new ConflictException('Owner permissions are protected');
      this.assertVersion(role, input.expectedVersion);
      const codes = await this.validatePermissionCodes(manager, input.permissionCodes);
      const before = await this.permissionCodes(manager, organizationId, roleId);
      if (sameCodes(before, codes)) return this.summary(manager, role);
      await manager.getRepository(OrganizationRolePermissionEntity).delete({ organizationId, roleId });
      await this.replacePermissions(manager, organizationId, roleId, codes);
      role.version += 1;
      const saved = await manager.getRepository(OrganizationRoleDefinitionEntity).save(role);
      await writePostgresAudit(manager, { organizationId, actorUserId: userId, actorMembershipId: owner.id, actionCode: 'ORGANIZATION_ROLE_PERMISSIONS_CHANGED', targetType: 'ORGANIZATION_ROLE', targetId: role.id, beforeData: { permissionCodes: before, version: input.expectedVersion }, afterData: { permissionCodes: codes, version: saved.version } });
      return this.summary(manager, saved);
    });
  }

  archive(userId: string, organizationId: string, roleId: string, expectedVersion: number) {
    return this.transactions.run(async (manager) => {
      const owner = await this.requireOwner(manager, userId, organizationId, true);
      const role = await this.lockRole(manager, organizationId, roleId);
      if (role.archivedAt) throw new ConflictException('Role is already archived');
      if (role.isDefault || role.isProtected || role.systemCode) throw new ConflictException('Default and protected roles cannot be archived');
      this.assertVersion(role, expectedVersion);
      const memberships = await manager.getRepository(OrganizationMembershipEntity).count({ where: { organizationId, roleId } });
      const invitations = await manager.query<Array<{ count: string }>>(`SELECT count(*)::text AS count FROM organization_invitations WHERE organization_id = $1 AND role_id = $2 AND state = 'PENDING'`, [organizationId, roleId]);
      if (memberships || Number(invitations[0]?.count ?? 0) > 0) throw new ConflictException('Role is still referenced by a Membership or pending invitation');
      role.archivedAt = new Date(); role.version += 1;
      const saved = await manager.getRepository(OrganizationRoleDefinitionEntity).save(role);
      await writePostgresAudit(manager, { organizationId, actorUserId: userId, actorMembershipId: owner.id, actionCode: 'ORGANIZATION_ROLE_ARCHIVED', targetType: 'ORGANIZATION_ROLE', targetId: role.id, beforeData: { archivedAt: null, version: expectedVersion }, afterData: { archivedAt: saved.archivedAt?.toISOString(), version: saved.version } });
      return this.summary(manager, saved);
    });
  }

  assignMembershipRole(userId: string, organizationId: string, targetUserId: string, roleId: string) {
    return this.transactions.run(async (manager) => {
      const owner = await this.requireOwner(manager, userId, organizationId, true);
      const membership = await manager.getRepository(OrganizationMembershipEntity).createQueryBuilder('membership').setLock('pessimistic_write').where('membership.organization_id = :organizationId', { organizationId }).andWhere('membership.user_id = :targetUserId', { targetUserId }).getOne();
      if (!membership) throw new NotFoundException('Organization Membership not found');
      if (membership.state !== OrganizationMembershipState.ACTIVE) throw new ConflictException('Only active Memberships can be assigned a role');
      const organization = await manager.getRepository(OrganizationEntity).findOneBy({ id: organizationId });
      if (organization?.ownerMembershipId === membership.id) throw new ConflictException('Owner can only be changed through ownership transfer');
      const role = await this.lockRole(manager, organizationId, roleId);
      if (role.isProtected || role.systemCode === 'OWNER') throw new ConflictException('Owner role cannot be assigned through this endpoint');
      if (role.archivedAt) throw new ConflictException('Archived roles cannot be assigned');
      if (membership.roleId === role.id) return this.summary(manager, role);
      const beforeRoleId = membership.roleId;
      membership.roleId = role.id;
      await manager.getRepository(OrganizationMembershipEntity).save(membership);
      await writePostgresAudit(manager, { organizationId, actorUserId: userId, actorMembershipId: owner.id, actionCode: 'ORGANIZATION_MEMBER_ROLE_CHANGED', targetType: 'ORGANIZATION_MEMBERSHIP', targetId: membership.id, beforeData: { roleId: beforeRoleId }, afterData: { roleId: role.id, roleName: role.name } });
      return this.summary(manager, role);
    });
  }

  private async requireOwner(manager: EntityManager, userId: string, organizationId: string, forUpdate = false) {
    if (forUpdate) {
      // Serialize governance with archive, invitation and ownership commands.
      // Re-resolve Owner authority after acquiring the Organization lock.
      const organization = await manager.getRepository(OrganizationEntity).createQueryBuilder('organization')
        .setLock('pessimistic_write').where('organization.id = :organizationId', { organizationId }).getOne();
      if (!organization || organization.archivedAt) throw new NotFoundException('Organization not found');
    }
    const caps = await new PostgresOrganizationPermissionService(manager).resolve(userId, organizationId);
    if (!caps.isOwner) throw new ForbiddenException('Only the active Organization Owner may manage roles or assignments');
    const owner = await manager.getRepository(OrganizationMembershipEntity).findOneBy({ userId, organizationId, state: OrganizationMembershipState.ACTIVE });
    if (!owner || owner.roleId !== caps.role.id) throw new ForbiddenException('Active Owner Membership is required');
    return owner;
  }

  private async lockRole(manager: EntityManager, organizationId: string, roleId: string) {
    const role = await manager.getRepository(OrganizationRoleDefinitionEntity).createQueryBuilder('role').setLock('pessimistic_write').where('role.organization_id = :organizationId', { organizationId }).andWhere('role.id = :roleId', { roleId }).getOne();
    if (!role) throw new NotFoundException('Organization role not found');
    return role;
  }

  private assertVersion(role: OrganizationRoleDefinitionEntity, expected: number) {
    if (!Number.isInteger(expected) || expected !== role.version) throw new ConflictException('Role has changed; reload before saving');
  }

  private async validatePermissionCodes(manager: EntityManager, input: string[]) {
    if (!Array.isArray(input)) throw new BadRequestException('permissionCodes must be an array');
    const codes = [...new Set(input)];
    if (codes.length !== input.length) throw new BadRequestException('Duplicate permission codes are not allowed');
    if (codes.length > 64) throw new BadRequestException('Too many permissions');
    if (!codes.length) return [];
    const allowed = await manager.getRepository(OrganizationPermissionEntity).findBy(codes.map((code) => ({ code, isAssignable: true })));
    if (allowed.length !== codes.length) throw new BadRequestException('Unknown or non-assignable permission code');
    return codes.sort();
  }

  private async replacePermissions(manager: EntityManager, organizationId: string, roleId: string, codes: string[]) {
    if (!codes.length) return;
    await manager.getRepository(OrganizationRolePermissionEntity).insert(codes.map((permissionCode) => ({ organizationId, roleId, permissionCode })));
  }

  private async permissionCodes(manager: EntityManager, organizationId: string, roleId: string) {
    const role = await manager.getRepository(OrganizationRoleDefinitionEntity).findOneBy({ id: roleId, organizationId });
    if (role?.systemCode === 'OWNER') {
      return (await manager.getRepository(OrganizationPermissionEntity).find({ order: { code: 'ASC' } })).map((permission) => permission.code);
    }
    const grants = await manager.getRepository(OrganizationRolePermissionEntity).find({ where: { organizationId, roleId }, order: { permissionCode: 'ASC' } });
    return grants.map((grant) => grant.permissionCode);
  }

  private async summary(manager: EntityManager, role: OrganizationRoleDefinitionEntity) {
    const [permissionCodes, membershipCount, invitations] = await Promise.all([
      this.permissionCodes(manager, role.organizationId, role.id),
      manager.getRepository(OrganizationMembershipEntity).count({ where: { organizationId: role.organizationId, roleId: role.id } }),
      manager.query<Array<{ count: string }>>(`SELECT count(*)::text AS count FROM organization_invitations WHERE organization_id = $1 AND role_id = $2 AND state = 'PENDING'`, [role.organizationId, role.id]),
    ]);
    return { id: role.id, name: role.name, description: role.description, systemCode: role.systemCode, isDefault: role.isDefault, isProtected: role.isProtected, archivedAt: role.archivedAt, version: role.version, permissionCodes, membershipCount, pendingInvitationCount: Number(invitations[0]?.count ?? 0) };
  }
}

function requiredText(value: string, max: number, label: string, allowEmpty = false) {
  if (typeof value !== 'string') throw new BadRequestException(`${label} must be text`);
  const trimmed = value.trim();
  if ((!allowEmpty && !trimmed) || trimmed.length > max) throw new BadRequestException(`${label} must be ${allowEmpty ? 'at most' : 'between 1 and'} ${max} characters`);
  return trimmed;
}
function sameCodes(a: string[], b: string[]) { return a.length === b.length && a.every((code, index) => code === b[index]); }
function mapUniqueConflict(error: unknown): never { const candidate = error as { code?: string }; if (candidate?.code === '23505') throw new ConflictException('Role name already exists in this Organization'); throw error; }
