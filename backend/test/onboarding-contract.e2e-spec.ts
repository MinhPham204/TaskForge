import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PostgresInvitationMembershipService } from '../src/modules/onboarding/application/invitation-membership.service';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { PostgresWorkspaceService } from '../src/modules/onboarding/application/workspace.service';
import { PostgresJwtAuthGuard } from '../src/modules/onboarding/tenant/jwt-auth.guard';
import { PostgresTenantMembershipGuard } from '../src/modules/onboarding/tenant/tenant-membership.guard';
import { PostgresTenantInterceptor } from '../src/modules/onboarding/tenant/tenant.interceptor';
import { PostgresOnboardingController } from '../src/modules/onboarding/transport/onboarding.controller';

describe('PostgreSQL onboarding HTTP contract', () => {
  const organizations = { createOrganization: jest.fn() };
  const workspaces = { listWorkspaces: jest.fn() };
  const invitations = {
    acceptInvitation: jest.fn(),
    createInvitation: jest.fn(),
    listMyPendingInvitations: jest.fn(),
  };

  beforeEach(() => {
    Object.values(organizations).forEach((method) => method.mockReset());
    Object.values(workspaces).forEach((method) => method.mockReset());
    Object.values(invitations).forEach((method) => method.mockReset());
  });

  async function createApp() {
    const module = await Test.createTestingModule({
      controllers: [PostgresOnboardingController],
      providers: [
        {
          provide: PostgresOrganizationOnboardingService,
          useValue: organizations,
        },
        { provide: PostgresWorkspaceService, useValue: workspaces },
        { provide: PostgresInvitationMembershipService, useValue: invitations },
      ],
    })
      .overrideGuard(PostgresJwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().user = { sub: 'user-id' };
          return true;
        },
      })
      .overrideGuard(PostgresTenantMembershipGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().postgresTenant = {
            id: 'membership-id',
            userId: 'user-id',
            organizationId: 'organization-id',
            role: 'ADMIN',
          };
          return true;
        },
      })
      .overrideInterceptor(PostgresTenantInterceptor)
      .useValue({ intercept: (_, next) => next.handle() })
      .compile();
    const app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    return app;
  }

  it('accepts only a validated opaque token at the frontend contract endpoint', async () => {
    invitations.acceptInvitation.mockResolvedValue({ id: 'membership-id' });
    const app = await createApp();

    await request(app.getHttpServer())
      .post('/invitations/accept')
      .send({ token: 'opaque-invitation-token-value' })
      .expect(201)
      .expect({ id: 'membership-id' });

    expect(invitations.acceptInvitation).toHaveBeenCalledWith(
      'user-id',
      'opaque-invitation-token-value',
    );
    await app.close();
  });

  it('rejects a cross-tenant invitation target after tenant verification', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .post('/organizations/other-organization/invitations')
      .set('x-organization-id', 'organization-id')
      .send({
        email: 'member@example.test',
        expiresAt: '2026-10-04T00:00:00.000Z',
        role: 'MEMBER',
      })
      .expect(403);

    expect(invitations.createInvitation).not.toHaveBeenCalled();
    await app.close();
  });
});
