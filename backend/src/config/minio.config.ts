export interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

type Environment = Record<string, string | undefined>;

export function getMinioConfig(
  environment: Environment,
): MinioConfig | undefined {
  const values = [
    environment.MINIO_ENDPOINT,
    environment.MINIO_PORT,
    environment.MINIO_USE_SSL,
    environment.MINIO_ACCESS_KEY,
    environment.MINIO_SECRET_KEY,
    environment.MINIO_BUCKET,
  ];
  if (values.every((value) => value === undefined || value.trim() === '')) {
    return undefined;
  }

  const endpoint = required(environment.MINIO_ENDPOINT, 'MINIO_ENDPOINT');
  if (/[:/\\]/.test(endpoint) || /\s/.test(endpoint)) {
    throw new Error(
      'MINIO_ENDPOINT must be a hostname without a protocol or path.',
    );
  }

  const portValue = required(environment.MINIO_PORT, 'MINIO_PORT');
  const port = Number.parseInt(portValue, 10);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    String(port) !== portValue
  ) {
    throw new Error('MINIO_PORT must be an integer between 1 and 65535.');
  }

  const useSSLValue = required(environment.MINIO_USE_SSL, 'MINIO_USE_SSL');
  if (useSSLValue !== 'true' && useSSLValue !== 'false') {
    throw new Error('MINIO_USE_SSL must be either true or false.');
  }

  const bucket = required(environment.MINIO_BUCKET, 'MINIO_BUCKET');
  if (
    !/^[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])$/.test(bucket) ||
    bucket.includes('..')
  ) {
    throw new Error('MINIO_BUCKET must be a valid lowercase S3 bucket name.');
  }

  return {
    endpoint,
    port,
    useSSL: useSSLValue === 'true',
    accessKey: required(environment.MINIO_ACCESS_KEY, 'MINIO_ACCESS_KEY'),
    secretKey: required(environment.MINIO_SECRET_KEY, 'MINIO_SECRET_KEY'),
    bucket,
  };
}

function required(value: string | undefined, variableName: string): string {
  const trimmed = value?.trim();
  if (!trimmed)
    throw new Error(`${variableName} is required when MinIO is configured.`);
  return trimmed;
}
