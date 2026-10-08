import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationPermissionEntity,
  OrganizationRoleDefinitionEntity,
  OrganizationRolePermissionEntity,
} from '../persistence/typeorm/onboarding.entities';

export interface OrganizationCapabilities {
  isOwner: boolean;
  role: {
    id: string;
    name: string;
    systemCode: string | null;
    isDefault: boolean;
    isProtected: boolean;
    archivedAt: Date | null;
    version: number;
    permissionCodes: string[];
    membershipCount: number;
  };
  permissions: string[];
}

/** Resolves permissions from the current database state; it deliberately does not cache. */
export class PostgresOrganizationPermissionService {
  constructor(private readonly manager: EntityManager) {}

  async resolve(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationCapabilities> {
    const membership = await this.manager
      .getRepository(OrganizationMembershipEntity)
      .createQueryBuilder('membership')
      .innerJoin('organizations', 'organization', 'organization.id = membership.organization_id')
      .innerJoin(OrganizationRoleDefinitionEntity, 'role', 'role.id = membership.role_id AND role.organization_id = membership.organization_id')
      .where('membership.user_id = :userId', { userId })
      .andWhere('membership.organization_id = :organizationId', { organizationId })
      .andWhere('membership.state = :state', { state: OrganizationMembershipState.ACTIVE })
      .andWhere('organization.archived_at IS NULL')
      .andWhere('role.archived_at IS NULL')
      .select('membership.id', 'membershipId')
      .addSelect('role.id', 'roleId')
      .addSelect('role.name', 'roleName')
      .addSelect('role.system_code', 'systemCode')
      .addSelect('role.is_default', 'isDefault')
      .addSelect('role.is_protected', 'isProtected')
      .addSelect('role.archived_at', 'archivedAt')
      .addSelect('role.version', 'version')
      .getRawOne<{
        membershipId: string; roleId: string; roleName: string; systemCode: string | null;
        isDefault: boolean; isProtected: boolean; archivedAt: Date | null; version: number;
      }>();
    if (!membership) throw new NotFoundException('Active Organization Membership was not found');

    const isOwner = membership.systemCode === 'OWNER' && membership.isProtected;
    const permissionCodes = isOwner
      ? (await this.manager.getRepository(OrganizationPermissionEntity).find({ order: { code: 'ASC' } })).map((permission) => permission.code)
      : (await this.manager
          .getRepository(OrganizationRolePermissionEntity)
          .createQueryBuilder('grant')
          .innerJoin(OrganizationPermissionEntity, 'permission', 'permission.code = grant.permission_code')
          .where('grant.organization_id = :organizationId', { organizationId })
          .andWhere('grant.role_id = :roleId', { roleId: membership.roleId })
          .select('permission.code', 'code')
          .orderBy('permission.code', 'ASC')
          .getRawMany<{ code: string }>()).map((permission) => permission.code);
    const membershipCount = await this.manager.getRepository(OrganizationMembershipEntity).count({
      where: { organizationId, roleId: membership.roleId },
    });

    return {
      isOwner,
      role: {
        id: membership.roleId,
        name: membership.roleName,
        systemCode: membership.systemCode,
        isDefault: membership.isDefault,
        isProtected: membership.isProtected,
        archivedAt: membership.archivedAt,
        version: membership.version,
        permissionCodes,
        membershipCount,
      },
      permissions: permissionCodes,
    };
  }

  async requirePermission(userId: string, organizationId: string, code: string): Promise<OrganizationCapabilities> {
    const capabilities = await this.resolve(userId, organizationId);
    if (!capabilities.permissions.includes(code)) throw new ForbiddenException(`Missing Organization permission: ${code}`);
    return capabilities;
  }
}
