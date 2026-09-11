import type { DataSource } from 'typeorm';
import {
  PostgresTransactionRunner,
  type PostgresIsolationLevel,
} from './transaction-runner';

describe('PostgresTransactionRunner', () => {
  const transaction = jest.fn();
  const dataSource = { transaction } as unknown as DataSource;
  beforeEach(() => {
    transaction.mockReset();
  });

  it('delegates a unit of work to the TypeORM transaction manager', async () => {
    const runner = new PostgresTransactionRunner(dataSource);
    const work = (): Promise<string> => Promise.resolve('committed');
    transaction.mockResolvedValue('committed');

    await expect(runner.run(work)).resolves.toBe('committed');

    expect(transaction).toHaveBeenCalledWith(work);
  });

  it('passes an explicit isolation level only when the caller requires one', async () => {
    const runner = new PostgresTransactionRunner(dataSource);
    const work = (): Promise<void> => Promise.resolve();
    const isolationLevel: PostgresIsolationLevel = 'SERIALIZABLE';
    transaction.mockResolvedValue(undefined);

    await runner.run(work, isolationLevel);

    expect(transaction).toHaveBeenCalledWith(isolationLevel, work);
  });

  it('propagates a failed unit of work so TypeORM can roll the transaction back', async () => {
    const runner = new PostgresTransactionRunner(dataSource);
    const failure = new Error('team member write failed');
    const work = (): Promise<void> => Promise.reject(failure);
    transaction.mockRejectedValue(failure);

    await expect(runner.run(work)).rejects.toThrow(failure);

    expect(transaction).toHaveBeenCalledWith(work);
  });
});
