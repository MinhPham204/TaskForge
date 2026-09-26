import { getPostgresConfig } from './database.config';
import { getMinioConfig } from './minio.config';

export function validateEnvironment(
  environment: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const postgres = getPostgresConfig(environment);
  getMinioConfig(environment);
  if (!postgres.url) {
    throw new Error('DATABASE_URL is required for the PostgreSQL runtime.');
  }
  return environment;
}
