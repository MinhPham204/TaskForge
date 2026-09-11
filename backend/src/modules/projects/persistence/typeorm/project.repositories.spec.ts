import type { EntityManager } from 'typeorm';
import { ProjectEntity } from './project.entities';
import { PostgresProjectRepository } from './project.repositories';

describe('PostgreSQL project repositories', () => {
  it('uses the supplied manager, so P3 commands can share one transaction', () => {
    const create = jest.fn();
    const getRepository = jest.fn(() => ({ create }));
    const repository = new PostgresProjectRepository({
      getRepository,
    } as unknown as EntityManager);
    const values = { organizationId: 'organization-id', name: 'Project' };

    repository.create(values);

    expect(getRepository).toHaveBeenCalledWith(ProjectEntity);
    expect(create).toHaveBeenCalledWith(values);
  });
});
