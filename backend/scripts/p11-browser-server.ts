import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import { requirePostgresTestUrl } from '../src/testing/database-test.config';
import { testOrganizationRoleId } from '../src/testing/organization-role.fixture';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { OrganizationMembershipEntity, OrganizationMembershipState, UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';

// Dedicated local acceptance server. Test composition has no email/outbox worker.
async function main() {
  requirePostgresTestUrl(process.env);
  if (process.env.P11_BROWSER_ACCEPTANCE !== 'true') throw new Error('Set P11_BROWSER_ACCEPTANCE=true for this disposable test fixture.');
  const module = await Test.createTestingModule({ imports: [PostgresOnboardingTestModule] }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api'); app.enableCors({ origin: ['http://127.0.0.1:15173', 'http://localhost:15173'], credentials: true });
  const db = app.get(DataSource), onboarding = app.get(PostgresOrganizationOnboardingService);
  const passwordHash = await bcrypt.hash('Password123!', 10);
  async function createUser(name: string, email: string) {
    return db.getRepository(UserEntity).save({ name, email, passwordHash, emailVerifiedAt: new Date(), disabledAt: null });
  }
  const owner = await createUser('Acceptance Owner', 'p11-browser-owner@example.test');
  const member = await createUser('Acceptance Member', 'p11-browser-member@example.test');
  const suspended = await createUser('Suspended Member', 'p11-browser-suspended@example.test');
  const first = await onboarding.createOrganization(owner.id, { name: 'P11 Browser Workspace' });
  const second = await onboarding.createOrganization(owner.id, { name: 'P11 Other Workspace' });
  for (const workspace of [first, second]) {
    const roleId = await testOrganizationRoleId(db, workspace.organizationId, 'MEMBER');
    await db.getRepository(OrganizationMembershipEntity).save({ organizationId: workspace.organizationId, userId: member.id, roleId, state: OrganizationMembershipState.ACTIVE, joinedAt: new Date(), stateChangedAt: new Date() });
  }
  await db.getRepository(OrganizationMembershipEntity).save({ organizationId: first.organizationId, userId: suspended.id, roleId: await testOrganizationRoleId(db, first.organizationId, 'MEMBER'), state: OrganizationMembershipState.SUSPENDED, joinedAt: new Date(), stateChangedAt: new Date() });
  if (process.argv.includes('--fixture-only')) { await app.close(); return; }
  await app.listen(18001, '127.0.0.1');
  console.log('P11 browser acceptance API: http://127.0.0.1:18001/api (localhost:54330/taskforge_test only, no delivery workers)');
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
}
void main().catch((error: unknown) => { console.error(error); process.exit(1); });
