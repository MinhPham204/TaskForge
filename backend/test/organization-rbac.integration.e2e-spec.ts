import { ValidationPipe, ConflictException, ForbiddenException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';
import { testOrganizationRoleId } from '../src/testing/organization-role.fixture';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { PostgresOrganizationRoleService } from '../src/modules/onboarding/application/organization-role.service';
import { PostgresInvitationMembershipService } from '../src/modules/onboarding/application/invitation-membership.service';
import { PostgresWorkspaceService } from '../src/modules/onboarding/application/workspace.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import { OrganizationEntity, OrganizationMembershipEntity, OrganizationMembershipState, OrganizationRoleDefinitionEntity, UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { AuditLogEntity } from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';

describe('P11 PostgreSQL Organization RBAC acceptance', () => {
  let app: INestApplication, db: DataSource, roles: PostgresOrganizationRoleService, invitations: PostgresInvitationMembershipService;
  let onboarding: PostgresOrganizationOnboardingService, owner: UserEntity, member: UserEntity;
  let organizationId: string, memberRoleId: string, sequence = 0;
  let headers: Record<string, string>, memberHeaders: Record<string, string>;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PostgresOnboardingTestModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); db = app.get(DataSource); roles = app.get(PostgresOrganizationRoleService);
    invitations = app.get(PostgresInvitationMembershipService); onboarding = app.get(PostgresOrganizationOnboardingService);
  });
  beforeEach(async () => {
    await db.query('TRUNCATE organizations, users RESTART IDENTITY CASCADE');
    sequence++; owner = await user('owner'); member = await user('member');
    organizationId = (await onboarding.createOrganization(owner.id, { name: 'RBAC acceptance' })).organizationId;
    memberRoleId = await testOrganizationRoleId(db, organizationId, 'MEMBER');
    await db.getRepository(OrganizationMembershipEntity).save({ organizationId, userId: member.id, roleId: memberRoleId, state: OrganizationMembershipState.ACTIVE, joinedAt: new Date(), stateChangedAt: new Date() });
    headers = auth(owner.id); memberHeaders = auth(member.id);
  });
  afterAll(async () => { if (app) await app.close(); });
  function auth(userId: string, tenant = organizationId) { return { authorization: `Bearer ${app.get(JwtService).sign({ sub: userId }, { secret: process.env.JWT_ACCESS_SECRET })}`, 'x-organization-id': tenant }; }
  function http(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, actor = headers) { return request(app.getHttpServer())[method](`/organizations/${organizationId}/${path}`).set(actor); }
  function user(name: string) { return db.getRepository(UserEntity).save({ name, email: `${name}-${sequence}@example.test`, passwordHash: 'test-only', emailVerifiedAt: new Date(), disabledAt: null }); }
  const roleInput = { name: 'HR', description: 'Recruiting', permissionCodes: ['org.members.read', 'org.members.invite'] };
  async function hr() { return roles.create(owner.id, organizationId, roleInput); }
  async function auditCount(code: string) { return db.getRepository(AuditLogEntity).countBy({ organizationId, actionCode: code }); }
  async function assertOwnerInvariant() {
    const rows = await db.query(`SELECT o.owner_membership_id, m.id FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id JOIN organization_roles r ON r.id=m.role_id WHERE o.id=$1 AND r.system_code='OWNER' AND m.state='ACTIVE'`, [organizationId]);
    expect(rows).toHaveLength(1); expect(rows[0].owner_membership_id).toBe(rows[0].id);
  }

  it('creates/assigns HR over HTTP and changes live permissions with the same JWT', async () => {
    const created = await http('post', 'roles').send(roleInput).expect(201);
    expect(created.body).toMatchObject({ description: 'Recruiting', version: 1 });
    const id = created.body.id as string;
    await http('patch', `members/${member.id}/role`).send({ roleId: id }).expect(200);
    await http('get', 'members', memberHeaders).expect(200);
    await http('get', 'roles', memberHeaders).expect(403);
    await http('patch', `members/${owner.id}/role`, memberHeaders).send({ roleId: memberRoleId }).expect(403);
    await http('post', `members/${owner.id}/suspend`, memberHeaders).expect(403);
    await http('delete', `members/${owner.id}`, memberHeaders).expect(403);
    await http('post', 'invitations', memberHeaders).send({ email: 'allowed@example.test', roleId: memberRoleId, expiresAt: new Date(Date.now() + 60_000).toISOString() }).expect(201);
    await http('put', `roles/${id}/permissions`).send({ expectedVersion: 1, permissionCodes: [] }).expect(200);
    await http('get', 'members', memberHeaders).expect(403);
    await http('get', 'permissions/me', memberHeaders).expect(200).expect(({ body }) => expect(body.permissions).toEqual([]));
    await http('get', '', memberHeaders).expect(200);
    await http('put', `roles/${id}/permissions`).send({ expectedVersion: 2, permissionCodes: ['org.members.read'] }).expect(200);
    await http('get', 'members', memberHeaders).expect(200);
  });

  it('rejects tenant/input/protected/inactive violations and scopes default grant edits', async () => {
    const second = await onboarding.createOrganization(owner.id, { name: 'Other workspace' });
    const foreignRole = await testOrganizationRoleId(db, second.organizationId, 'MEMBER');
    await http('get', 'roles', auth(owner.id, second.organizationId)).expect(403);
    await http('get', 'roles', { authorization: headers.authorization }).expect(400);
    await http('get', 'roles', { 'x-organization-id': organizationId }).expect(401);
    await http('post', 'roles').send({ ...roleInput, permissionCodes: ['unknown.permission'] }).expect(400);
    await http('post', 'roles').send({ ...roleInput, permissionCodes: ['org.roles.manage'] }).expect(400);
    await http('post', 'roles').send({ ...roleInput, permissionCodes: ['org.members.read', 'org.members.read'] }).expect(400);
    await http('post', 'roles').send({ ...roleInput, name: '   ' }).expect(400);
    await http('patch', `members/${member.id}/role`).send({ roleId: 'bad-id' }).expect(400);
    await http('patch', `members/${member.id}/role`).send({ roleId: foreignRole }).expect(404);
    const ownerRoleId = await testOrganizationRoleId(db, organizationId, 'OWNER');
    await http('put', `roles/${ownerRoleId}/permissions`).send({ expectedVersion: 1, permissionCodes: [] }).expect(409);
    await http('patch', `members/${member.id}/role`).send({ roleId: ownerRoleId }).expect(409);
    await http('patch', `members/${owner.id}/role`).send({ roleId: memberRoleId }).expect(409);
    const adminRoleId = await testOrganizationRoleId(db, organizationId, 'ADMIN');
    await http('patch', `roles/${adminRoleId}`).send({ expectedVersion: 1, name: 'Changed' }).expect(409);
    await http('post', `roles/${adminRoleId}/archive`).send({ expectedVersion: 1 }).expect(409);
    await roles.assignMembershipRole(owner.id, organizationId, member.id, adminRoleId);
    await http('get', 'members', memberHeaders).expect(200);
    await http('put', `roles/${adminRoleId}/permissions`).send({ expectedVersion: 1, permissionCodes: [] }).expect(200);
    await http('get', 'members', memberHeaders).expect(403);
    const otherAdmin = (await roles.listRoles(owner.id, second.organizationId)).find((role) => role.systemCode === 'ADMIN');
    expect(otherAdmin?.permissionCodes).toHaveLength(13);
    await db.getRepository(OrganizationMembershipEntity).update({ organizationId, userId: member.id }, { state: OrganizationMembershipState.SUSPENDED });
    await http('patch', `members/${member.id}/role`).send({ roleId: memberRoleId }).expect(409);
    await http('get', 'permissions/me', memberHeaders).expect(403);
    await assertOwnerInvariant();
  });

  it('enforces invitation delegation, current grants on accept and inactive-role rechecks', async () => {
    const role = await hr(); await roles.assignMembershipRole(owner.id, organizationId, member.id, role.id);
    const adminRoleId = await testOrganizationRoleId(db, organizationId, 'ADMIN');
    const payload = { email: 'delegation@example.test', expiresAt: new Date(Date.now() + 60_000).toISOString() };
    await http('post', 'invitations', memberHeaders).send({ ...payload, roleId: adminRoleId }).expect(403);
    await http('get', 'invitation-roles', memberHeaders).expect(200);
    const recipient = await user('recipient');
    const created = await invitations.createInvitation(member.id, organizationId, { email: recipient.email, roleId: role.id, expiresAt: new Date(Date.now() + 60_000) });
    await roles.replaceRolePermissions(owner.id, organizationId, role.id, { expectedVersion: 1, permissionCodes: ['org.members.read'] });
    const accepted = await invitations.acceptInvitation(recipient.id, created.token); expect(accepted.roleId).toBe(role.id);
    await http('get', 'permissions/me', auth(recipient.id)).expect(200).expect(({ body }) => expect(body.permissions).toEqual(['org.members.read']));
    const empty = await roles.create(owner.id, organizationId, { name: 'Empty', permissionCodes: [] });
    const invalidRecipient = await user('invalid-recipient');
    const pending = await invitations.createInvitation(owner.id, organizationId, { email: invalidRecipient.email, roleId: empty.id, expiresAt: new Date(Date.now() + 60_000) });
    await expect(roles.archive(owner.id, organizationId, empty.id, 1)).rejects.toBeInstanceOf(ConflictException);
    // Simulate external corruption to prove acceptance rechecks before provisioning.
    await db.getRepository(OrganizationRoleDefinitionEntity).update(empty.id, { archivedAt: new Date() });
    await expect(invitations.acceptInvitation(invalidRecipient.id, pending.token)).rejects.toBeInstanceOf(ConflictException);
    expect(await db.getRepository(OrganizationMembershipEntity).countBy({ organizationId, userId: invalidRecipient.id })).toBe(0);
  });

  it('protects in-use roles including inactive memberships and suppresses no-op audits', async () => {
    const role = await hr(); await roles.assignMembershipRole(owner.id, organizationId, member.id, role.id);
    const count = await auditCount('ORGANIZATION_MEMBER_ROLE_CHANGED');
    await roles.assignMembershipRole(owner.id, organizationId, member.id, role.id);
    expect(await auditCount('ORGANIZATION_MEMBER_ROLE_CHANGED')).toBe(count);
    await roles.update(owner.id, organizationId, role.id, { name: role.name, description: role.description, expectedVersion: 1 });
    await roles.replaceRolePermissions(owner.id, organizationId, role.id, { expectedVersion: 1, permissionCodes: role.permissionCodes });
    expect(await auditCount('ORGANIZATION_ROLE_UPDATED')).toBe(0);
    expect(await auditCount('ORGANIZATION_ROLE_PERMISSIONS_CHANGED')).toBe(0);
    await db.getRepository(OrganizationMembershipEntity).update({ organizationId, userId: member.id }, { state: OrganizationMembershipState.REVOKED });
    await expect(roles.archive(owner.id, organizationId, role.id, 1)).rejects.toBeInstanceOf(ConflictException);
    await expect(roles.create(owner.id, organizationId, { ...roleInput, name: ' hr ' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rolls back role creation, grant replacement and assignment when audit writing fails', async () => {
    const role = await hr();
    await db.query(`CREATE FUNCTION p11_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action_code LIKE 'ORGANIZATION_ROLE_%' OR NEW.action_code = 'ORGANIZATION_MEMBER_ROLE_CHANGED' THEN RAISE EXCEPTION 'P11 audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER p11_reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION p11_reject_audit()`);
    try {
      await expect(roles.create(owner.id, organizationId, { name: 'Rollback', permissionCodes: [] })).rejects.toThrow('P11 audit failure');
      await expect(roles.replaceRolePermissions(owner.id, organizationId, role.id, { expectedVersion: 1, permissionCodes: [] })).rejects.toThrow('P11 audit failure');
      await expect(roles.assignMembershipRole(owner.id, organizationId, member.id, role.id)).rejects.toThrow('P11 audit failure');
      expect(await db.getRepository(OrganizationRoleDefinitionEntity).countBy({ organizationId, name: 'Rollback' })).toBe(0);
      const latest = (await roles.listRoles(owner.id, organizationId)).find((item) => item.id === role.id);
      expect(latest).toMatchObject({ version: 1, permissionCodes: role.permissionCodes });
      expect((await db.getRepository(OrganizationMembershipEntity).findOneByOrFail({ organizationId, userId: member.id })).roleId).toBe(memberRoleId);
    } finally { await db.query('DROP TRIGGER p11_reject_audit ON audit_logs; DROP FUNCTION p11_reject_audit()'); }
  });

  it('serializes concurrent permission edits and records exactly one winning mutation', async () => {
    const role = await hr();
    const results = await Promise.allSettled([
      roles.replaceRolePermissions(owner.id, organizationId, role.id, { expectedVersion: 1, permissionCodes: [] }),
      roles.replaceRolePermissions(owner.id, organizationId, role.id, { expectedVersion: 1, permissionCodes: ['team.create'] }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: expect.any(ConflictException) });
    expect(await auditCount('ORGANIZATION_ROLE_PERMISSIONS_CHANGED')).toBe(1);
  });

  it('keeps archive/assignment and archive/invitation races consistent', async () => {
    for (const operation of ['assign', 'invite'] as const) {
      const role = await roles.create(owner.id, organizationId, { name: `Race-${operation}`, permissionCodes: [] });
      const results = await Promise.allSettled([
        roles.archive(owner.id, organizationId, role.id, 1),
        operation === 'assign' ? roles.assignMembershipRole(owner.id, organizationId, member.id, role.id)
          : invitations.createInvitation(owner.id, organizationId, { email: 'race@example.test', roleId: role.id, expiresAt: new Date(Date.now() + 60_000) }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const latest = (await roles.listRoles(owner.id, organizationId)).find((item) => item.id === role.id)!;
      if (latest.archivedAt) { expect(latest.membershipCount).toBe(0); expect(latest.pendingInvitationCount).toBe(0); }
    }
  });

  it('serializes accept/revoke and accept/archive without deadlocks or archived assignments', async () => {
    const recipient = await user('race-recipient'); const role = await roles.create(owner.id, organizationId, { name: 'Invite race', permissionCodes: [] });
    const created = await invitations.createInvitation(owner.id, organizationId, { email: recipient.email, roleId: role.id, expiresAt: new Date(Date.now() + 60_000) });
    const results = await Promise.allSettled([
      invitations.acceptInvitation(recipient.id, created.token),
      invitations.revokeInvitation(owner.id, organizationId, created.invitation.id),
      roles.archive(owner.id, organizationId, role.id, 1),
    ]);
    for (const result of results) if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(ConflictException);
    const latest = (await roles.listRoles(owner.id, organizationId)).find((item) => item.id === role.id)!;
    if (latest.archivedAt) expect(latest.membershipCount).toBe(0);
    await assertOwnerInvariant();
  });

  it('rechecks former Owner authority after a concurrent transfer and serializes suspend/assignment', async () => {
    const role = await hr();
    const transferResults = await Promise.allSettled([
      app.get(PostgresWorkspaceService).transferOwner(owner.id, organizationId, { targetUserId: member.id, previousOwnerRoleId: memberRoleId }),
      roles.assignMembershipRole(owner.id, organizationId, member.id, role.id),
    ]);
    for (const result of transferResults) if (result.status === 'rejected') expect(result.reason instanceof ConflictException || result.reason instanceof ForbiddenException).toBe(true);
    await assertOwnerInvariant();
    await expect(roles.create(owner.id, organizationId, { name: 'Former owner', permissionCodes: [] })).rejects.toBeInstanceOf(ForbiddenException);
    const target = await user('suspend-target');
    await db.getRepository(OrganizationMembershipEntity).save({ organizationId, userId: target.id, roleId: memberRoleId, state: OrganizationMembershipState.ACTIVE, joinedAt: new Date(), stateChangedAt: new Date() });
    const results = await Promise.allSettled([
      invitations.suspendMembership(member.id, organizationId, target.id), roles.assignMembershipRole(member.id, organizationId, target.id, role.id),
    ]);
    for (const result of results) if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(ConflictException);
    expect((await db.getRepository(OrganizationMembershipEntity).findOneByOrFail({ organizationId, userId: target.id })).state).toBe(OrganizationMembershipState.SUSPENDED);
  });

  it('keeps tenant-wide visibility separate from Project mutation authority', async () => {
    const project = await app.get(PostgresProjectService).create({ organizationId, membershipId: (await db.getRepository(OrganizationEntity).findOneByOrFail({ id: organizationId })).ownerMembershipId }, { name: 'Owner project' });
    const role = await roles.create(owner.id, organizationId, { name: 'Viewer', permissionCodes: ['org.projects.read_all'] });
    await roles.assignMembershipRole(owner.id, organizationId, member.id, role.id);
    await request(app.getHttpServer()).get(`/projects/${project.id}`).set(memberHeaders).expect(200);
    await request(app.getHttpServer()).patch(`/projects/${project.id}`).set(memberHeaders).send({ name: 'Denied' }).expect(403);
    await roles.replaceRolePermissions(owner.id, organizationId, role.id, { expectedVersion: 1, permissionCodes: [] });
    await request(app.getHttpServer()).get(`/projects/${project.id}`).set(memberHeaders).expect(403);
  });

  it('serializes self-service leave against role assignment and Organization archive against role creation', async () => {
    const role = await hr();
    const leaving = await Promise.allSettled([
      invitations.leaveOrganization(member.id, organizationId),
      roles.assignMembershipRole(owner.id, organizationId, member.id, role.id),
    ]);
    for (const result of leaving) if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(ConflictException);
    expect((await db.getRepository(OrganizationMembershipEntity).findOneByOrFail({ organizationId, userId: member.id })).state).toBe(OrganizationMembershipState.LEFT);
    const archiving = await Promise.allSettled([
      app.get(PostgresWorkspaceService).archiveOrganization(owner.id, organizationId),
      roles.create(owner.id, organizationId, { name: 'Archive race', permissionCodes: [] }),
    ]);
    expect(archiving[0].status).toBe('fulfilled');
    await assertOwnerInvariant();
    await http('post', 'roles').send({ name: 'Archived workspace role', permissionCodes: [] }).expect(403);
  });
});
