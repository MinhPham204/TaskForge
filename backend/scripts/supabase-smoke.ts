import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { createPostgresDataSourceOptions } from '../src/database/data-source.options';

async function run(): Promise<void> {
  const dataSource = new DataSource(
    createPostgresDataSourceOptions(process.env, 'migration'),
  );

  try {
    await dataSource.initialize();
    await dataSource.query('SELECT 1');
    const hasPendingMigrations = await dataSource.showMigrations();

    if (hasPendingMigrations) {
      throw new Error(
        'Database connection succeeded, but pending TypeORM migrations were found.',
      );
    }

    console.info('Database smoke passed: connection is healthy and migrations are current.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Database smoke failed without exposing connection details: ${message}`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void run();
