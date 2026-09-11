import type { EntityManager } from 'typeorm';
import {
  OrganizationMembershipState,
  UserEntity,
} from './onboarding.entities';
import {
  PostgresOrganizationMembershipRepository,
  PostgresUserRepository,
} from './onboarding.repositories';

describe('onboarding PostgreSQL repositories', () => {
  const findOneBy = jest.fn();
  const create = jest.fn();
  const save = jest.fn();
  const repository = { findOneBy, create, save };
  const getRepository = jest.fn(() => repository);
  const manager = { getRepository } as unknown as EntityManager;

  beforeEach(() => {
    findOneBy.mockReset();
    create.mockReset();
    save.mockReset();
    getRepository.mockClear();
  });

  it('uses the transaction manager for global user persistence', () => {
    const userRepository = new PostgresUserRepository(manager);
    const values = { email: 'user@example.test', name: 'User' };

    userRepository.create(values);

    expect(getRepository).toHaveBeenCalledWith(UserEntity);
    expect(create).toHaveBeenCalledWith(values);
  });

  it('keeps active membership lookup explicitly scoped to user and organization', async () => {
    const membershipRepository = new PostgresOrganizationMembershipRepository(
      manager,
    );
    findOneBy.mockResolvedValue(null);

    await membershipRepository.findActiveByUserAndOrganization(
      'user-id',
      'organization-id',
    );

    expect(findOneBy).toHaveBeenCalledWith({
      userId: 'user-id',
      organizationId: 'organization-id',
      state: OrganizationMembershipState.ACTIVE,
    });
  });
});
