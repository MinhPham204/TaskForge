import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports liveness without exposing infrastructure configuration', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });

  it('reports readiness as ok when PostgreSQL and Redis are available', async () => {
    const mockDataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as any;
    const mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    const controller = new HealthController(mockDataSource, mockRedis);
    const result = await controller.ready();

    expect(result).toEqual({
      status: 'ok',
      details: {
        postgres: 'up',
        redis: 'up',
      },
    });
  });

  it('throws ServiceUnavailableException when PostgreSQL is down', async () => {
    const mockDataSource = {
      isInitialized: true,
      query: jest.fn().mockRejectedValue(new Error('Connection lost')),
    } as any;
    const mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    const controller = new HealthController(mockDataSource, mockRedis);
    await expect(controller.ready()).rejects.toThrow();
  });
});
