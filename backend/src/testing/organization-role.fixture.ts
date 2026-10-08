import type { DataSource } from 'typeorm';
import { OrganizationRoleDefinitionEntity } from '../modules/onboarding/persistence/typeorm/onboarding.entities';

/** Resolve provisioned default roles for test data, without restoring enum authority. */
export async function testOrganizationRoleId(dataSource: DataSource, organizationId: string, systemCode: 'OWNER' | 'ADMIN' | 'MEMBER'): Promise<string> {
  const role = await dataSource.getRepository(OrganizationRoleDefinitionEntity).findOneByOrFail({ organizationId, systemCode });
  return role.id;
}
