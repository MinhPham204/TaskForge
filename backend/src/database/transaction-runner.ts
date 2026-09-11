import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

export type PostgresTransactionWork<T> = (manager: EntityManager) => Promise<T>;

export type PostgresIsolationLevel =
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

/**
 * Small transaction boundary for application services and cross-module
 * coordinators. It intentionally does not provide generic repository methods.
 */
@Injectable()
export class PostgresTransactionRunner {
  constructor(private readonly dataSource: DataSource) {}

  run<T>(work: PostgresTransactionWork<T>): Promise<T>;
  run<T>(
    work: PostgresTransactionWork<T>,
    isolationLevel: PostgresIsolationLevel,
  ): Promise<T>;
  run<T>(
    work: PostgresTransactionWork<T>,
    isolationLevel?: PostgresIsolationLevel,
  ): Promise<T> {
    if (isolationLevel) {
      return this.dataSource.transaction(isolationLevel, work);
    }

    return this.dataSource.transaction(work);
  }
}
