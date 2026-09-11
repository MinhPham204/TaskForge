import { getMinioConfig } from './minio.config';

describe('getMinioConfig', () => {
  const valid = {
    MINIO_ENDPOINT: 'minio',
    MINIO_PORT: '9000',
    MINIO_USE_SSL: 'false',
    MINIO_ACCESS_KEY: 'test-access-key',
    MINIO_SECRET_KEY: 'test-secret-key',
    MINIO_BUCKET: 'taskforge-files',
  };

  it('does not configure MinIO when every MinIO variable is absent', () => {
    expect(getMinioConfig({})).toBeUndefined();
  });

  it('parses a complete private MinIO configuration', () => {
    expect(getMinioConfig(valid)).toEqual({
      endpoint: 'minio',
      port: 9000,
      useSSL: false,
      accessKey: 'test-access-key',
      secretKey: 'test-secret-key',
      bucket: 'taskforge-files',
    });
  });

  it('fails closed for partial or malformed configuration without echoing secrets', () => {
    expect(() => getMinioConfig({ MINIO_ENDPOINT: 'minio' })).toThrow(
      'MINIO_PORT',
    );
    expect(() =>
      getMinioConfig({
        ...valid,
        MINIO_ENDPOINT: 'https://minio.example.test',
      }),
    ).toThrow('MINIO_ENDPOINT');
    expect(() => getMinioConfig({ ...valid, MINIO_PORT: '0' })).toThrow(
      'MINIO_PORT',
    );
    expect(() => getMinioConfig({ ...valid, MINIO_USE_SSL: 'yes' })).toThrow(
      'MINIO_USE_SSL',
    );
    expect(() =>
      getMinioConfig({ ...valid, MINIO_BUCKET: 'Invalid_Bucket' }),
    ).toThrow('MINIO_BUCKET');
  });
});
