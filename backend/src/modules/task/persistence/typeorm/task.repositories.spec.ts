import type { EntityManager } from 'typeorm';
import { TaskEntity } from './task.entities';
import { PostgresTaskRepository } from './task.repositories';

describe('PostgreSQL Task repositories', () => {
  it('uses the supplied manager so Task commands share one transaction', () => {
    const create = jest.fn();
    const getRepository = jest.fn(() => ({ create }));
    const repository = new PostgresTaskRepository({
      getRepository,
    } as unknown as EntityManager);
    const values = { organizationId: 'organization-id', title: 'Task' };

    repository.create(values);

    expect(getRepository).toHaveBeenCalledWith(TaskEntity);
    expect(create).toHaveBeenCalledWith(values);
  });
});
