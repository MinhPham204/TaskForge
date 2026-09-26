import { registerAs } from '@nestjs/config';

export interface PostgresConfig {
  url?: string;
  migrationUrl?: string;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
  sslCa?: string;
  poolMax: number;
  connectionTimeoutMs: number;
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
  variableName: string,
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
      `${variableName} must be a valid postgres:// or postgresql:// connection URL.`,
    );
  }

  return value;
}

function parsePositiveInteger(
  value: string | undefined,
  variableName: string,
  defaultValue: number,
): number {
  if (value === undefined || value.trim() === '') return defaultValue;

  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${variableName} must be a positive integer.`);
  }

  return Number(value);
}

function parseOptionalCertificate(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;

  let certificate: string;
  try {
    certificate = Buffer.from(value, 'base64').toString('utf8');
  } catch {
    throw new Error('DATABASE_SSL_CA_BASE64 must be a valid base64 certificate.');
  }

  if (!certificate.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error(
      'DATABASE_SSL_CA_BASE64 must decode to a PEM certificate.',
    );
  }

  return certificate;
}

export function getPostgresConfig(environment: Environment): PostgresConfig {
  const synchronize = parseOptionalBoolean(
    environment.DATABASE_SYNCHRONIZE,
    'DATABASE_SYNCHRONIZE',
    false,
  );

  if (synchronize) {
    throw new Error(
      'DATABASE_SYNCHRONIZE must be false; schema changes run through versioned migrations.',
    );
  }

  const ssl = parseOptionalBoolean(
    environment.DATABASE_SSL,
    'DATABASE_SSL',
    false,
  );
  const sslRejectUnauthorized = parseOptionalBoolean(
    environment.DATABASE_SSL_REJECT_UNAUTHORIZED,
    'DATABASE_SSL_REJECT_UNAUTHORIZED',
    true,
  );

  if (
    environment.NODE_ENV === 'production' &&
    ssl &&
    !sslRejectUnauthorized
  ) {
    throw new Error(
      'Production TLS connections require DATABASE_SSL_REJECT_UNAUTHORIZED=true.',
    );
  }

  return {
    url: parseOptionalPostgresUrl(environment.DATABASE_URL, 'DATABASE_URL'),
    migrationUrl: parseOptionalPostgresUrl(
      environment.MIGRATION_DATABASE_URL,
      'MIGRATION_DATABASE_URL',
    ),
    ssl,
    sslRejectUnauthorized,
    sslCa: parseOptionalCertificate(environment.DATABASE_SSL_CA_BASE64),
    poolMax: parsePositiveInteger(
      environment.DATABASE_POOL_MAX,
      'DATABASE_POOL_MAX',
      5,
    ),
    connectionTimeoutMs: parsePositiveInteger(
      environment.DATABASE_CONNECTION_TIMEOUT_MS,
      'DATABASE_CONNECTION_TIMEOUT_MS',
      5000,
    ),
    synchronize: false,
  };
}

export const postgresConfig = registerAs('postgres', () =>
  getPostgresConfig(process.env),
);
