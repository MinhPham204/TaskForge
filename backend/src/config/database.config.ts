import { registerAs } from '@nestjs/config';

export interface PostgresConfig {
  url?: string;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
  synchronize: false;
}

type Environment = Record<string, string | undefined>;

function parseOptionalBoolean(
  value: string | undefined,
  variableName: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(`${variableName} must be either true or false.`);
}

function parseOptionalPostgresUrl(
  value: string | undefined,
): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (
      (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
      !url.hostname
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(
      'POSTGRES_URL must be a valid postgres:// or postgresql:// connection URL.',
    );
  }

  return value;
}

export function getPostgresConfig(environment: Environment): PostgresConfig {
  const synchronize = parseOptionalBoolean(
    environment.POSTGRES_SYNCHRONIZE,
    'POSTGRES_SYNCHRONIZE',
    false,
  );

  if (synchronize) {
    throw new Error(
      'POSTGRES_SYNCHRONIZE must be false; schema changes run through versioned migrations.',
    );
  }

  return {
    url: parseOptionalPostgresUrl(environment.POSTGRES_URL),
    ssl: parseOptionalBoolean(environment.POSTGRES_SSL, 'POSTGRES_SSL', false),
    sslRejectUnauthorized: parseOptionalBoolean(
      environment.POSTGRES_SSL_REJECT_UNAUTHORIZED,
      'POSTGRES_SSL_REJECT_UNAUTHORIZED',
      true,
    ),
    synchronize: false,
  };
}

export const postgresConfig = registerAs('postgres', () =>
  getPostgresConfig(process.env),
);
