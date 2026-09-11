import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpRequestLoggingInterceptor } from '../src/common/observability/http-request-logging.interceptor';
import { REDIS_CLIENT } from '../src/providers/redis.provider';

describe('PostgreSQL served runtime smoke', () => {
  it('serves health and PostgreSQL onboarding/auth contracts in Swagger', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ disconnect: jest.fn() })
      .compile();
    const app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(app.get(HttpRequestLoggingInterceptor));
    const swagger = new DocumentBuilder()
      .setTitle('TaskForge runtime smoke')
      .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'accessToken')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));
    await app.init();

    const health = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200, { status: 'ok' });
    expect(health.headers['x-request-id']).toMatch(
      /^[A-Za-z0-9_-]{8,128}$/,
    );
    const document = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(document.body.paths).toEqual(
      expect.objectContaining({
        '/api/auth/login': expect.any(Object),
        '/api/auth/set-password': expect.any(Object),
        '/api/auth/my-organizations': expect.any(Object),
        '/api/organizations': expect.any(Object),
        '/api/invitations/accept': expect.any(Object),
        '/api/projects/{projectId}/tasks': expect.any(Object),
        '/api/projects/{projectId}/tasks/{taskId}': expect.any(Object),
        '/api/tasks/my': expect.any(Object),
        '/api/tasks/approval-queue': expect.any(Object),
        '/api/notifications': expect.any(Object),
        '/api/projects/{projectId}/activities': expect.any(Object),
        '/api/projects/{projectId}/files': expect.any(Object),
        '/api/projects/{projectId}/tasks/{taskId}/attachments': expect.any(Object),
        '/api/projects/{projectId}/milestones': expect.any(Object),
        '/api/projects/{projectId}/documents': expect.any(Object),
        '/api/projects/{projectId}/risks': expect.any(Object),
      }),
    );
    expect(document.body.paths['/api/tasks']).toBeUndefined();

    await app.close();
  });
});
