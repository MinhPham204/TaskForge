import type { EntityManager } from 'typeorm';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRole,
} from '../../onboarding/persistence/typeorm/onboarding.entities';
import { PostgresGlobalSearchService } from './search.service';

describe('PostgresGlobalSearchService', () => {
  it('uses project membership visibility for a Member and returns only supported quick-create capabilities', async () => {
    const membership = {
      id: 'membership-id',
      organizationId: 'organization-id',
      role: OrganizationRole.MEMBER,
      state: OrganizationMembershipState.ACTIVE,
    } as OrganizationMembershipEntity;
    const query = jest.fn((sql: string) => {
      if (sql.includes("SELECT 'PROJECT'")) {
        return Promise.resolve([
          {
            kind: 'PROJECT',
            id: 'visible-project',
            projectId: 'visible-project',
            title: 'Visible Project',
            description: null,
            updatedAt: new Date(),
          },
        ]);
      }
      if (sql.includes("SELECT 'TASK'")) return Promise.resolve([]);
      if (sql.includes("SELECT 'TEAM'")) return Promise.resolve([]);
      return Promise.resolve([{ projectId: 'manager-project' }]);
    });
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === OrganizationMembershipEntity) {
          return { findOneBy: jest.fn().mockResolvedValue(membership) };
        }
        throw new Error('Unexpected repository');
      }),
      query,
    } as unknown as EntityManager;
    const service = new PostgresGlobalSearchService({
      read: async (work: (readManager: EntityManager) => Promise<unknown>) =>
        work(manager),
    } as never);

    await expect(
      service.search(
        { organizationId: membership.organizationId, membershipId: membership.id },
        { query: 'visible' },
      ),
    ).resolves.toMatchObject({
      query: 'visible',
      results: [expect.objectContaining({ id: 'visible-project' })],
      quickCreate: {
        canCreateProject: false,
        canCreateTeam: false,
        taskProjectIds: ['manager-project'],
      },
    });

    const projectSearch = query.mock.calls.find(([sql]) =>
      (sql as string).includes("SELECT 'PROJECT'"),
    )?.[0] as string;
    expect(projectSearch).toContain('JOIN project_memberships project_membership');
    expect(projectSearch).toContain('organization_membership_id = $2');
  });
});
