import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { PostgresOrganizationOnboardingService } from '../../src/modules/onboarding/application/organization-onboarding.service';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipState,
  OrganizationRoleDefinitionEntity,
  OrganizationRolePermissionEntity,
  UserEntity,
} from '../../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresProjectService } from '../../src/modules/projects/application/project.service';
import { PostgresProjectParticipantService } from '../../src/modules/projects/application/project-participant.service';
import { PostgresTeamService } from '../../src/modules/projects/application/team.service';
import { PostgresMilestoneService } from '../../src/modules/projects/application/milestone.service';
import {
  ProjectEntity,
  ProjectRole,
  ProjectState,
  ProjectTaskStatusEntity,
  TaskStatusSemanticCategory,
} from '../../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresTaskService } from '../../src/modules/task/application/task.service';
import { testOrganizationRoleId } from '../../src/testing/organization-role.fixture';
import { requirePostgresTestUrl } from '../../src/testing/database-test.config';

/** Test-only named scenarios. No portfolio seed, SMTP or production composition root. */
export async function createP12WorkflowFixture(app: INestApplication) {
  requirePostgresTestUrl(process.env);
  const db = app.get(DataSource);
  const suffix = randomUUID();
  const onboarding = app.get(PostgresOrganizationOnboardingService);
  const projects = app.get(PostgresProjectService);
  const participants = app.get(PostgresProjectParticipantService);
  const teams = app.get(PostgresTeamService);
  const tasks = app.get(PostgresTaskService);
  const jwt = app.get(JwtService);
  async function user(label: string) {
    return db.getRepository(UserEntity).save({
      email: `p12-${label}-${suffix}@example.test`,
      name: label,
      passwordHash: 'test-only-unused',
      emailVerifiedAt: new Date(),
      disabledAt: null,
      refreshTokenHash: null,
      profileImageUrl: null,
    });
  }
  const pmUser = await user('pm');
  const workspace = await onboarding.createOrganization(pmUser.id, {
    name: 'P12 baseline',
  });
  const actor = {
    organizationId: workspace.organizationId,
    membershipId: workspace.membershipId,
  };
  const readerRole = await db
    .getRepository(OrganizationRoleDefinitionEntity)
    .save({
      organizationId: workspace.organizationId,
      name: 'P12 read all only',
      description: '',
      systemCode: null,
      isDefault: false,
      isProtected: false,
      archivedAt: null,
      version: 1,
    });
  await db.getRepository(OrganizationRolePermissionEntity).save({
    organizationId: workspace.organizationId,
    roleId: readerRole.id,
    permissionCode: 'org.projects.read_all',
  });
  async function member(label: string, projectMember = true) {
    const identity = await user(label);
    const membership = await db
      .getRepository(OrganizationMembershipEntity)
      .save({
        organizationId: workspace.organizationId,
        userId: identity.id,
        roleId: projectMember
          ? await testOrganizationRoleId(db, workspace.organizationId, 'MEMBER')
          : readerRole.id,
        state: OrganizationMembershipState.ACTIVE,
        joinedAt: new Date(),
        stateChangedAt: new Date(),
      });
    if (projectMember)
      await teams.addMember(actor, workspace.generalTeamId, membership.id);
    return { user: identity, membership, projectMembershipId: '' };
  }
  const actors = {
    pm: {
      user: pmUser,
      membership: { id: workspace.membershipId },
      projectMembershipId: '',
    },
    creator: await member('creator'),
    assignee: await member('assignee'),
    contributor: await member('contributor'),
    readAll: await member('reader', false),
  };
  const scenarios: Record<
    string,
    {
      project: ProjectEntity;
      statuses: ProjectTaskStatusEntity[];
      manual: { id: string };
      checklist: { id: string };
      approval: { id: string };
      completed: { id: string };
      milestoneId: string;
    }
  > = {};
  for (const state of Object.values(ProjectState)) {
    const project = await projects.create(actor, { name: `P12 ${state}` });
    const statuses = await db
      .getRepository(ProjectTaskStatusEntity)
      .findBy({ projectId: project.id });
    for (const [label, participant] of Object.entries(actors)) {
      if (label === 'pm' || label === 'readAll') continue;
      const membership = await participants.addMember(
        actor,
        project.id,
        participant.membership.id,
        ProjectRole.CONTRIBUTOR,
      );
      if (state === ProjectState.DRAFT)
        participant.projectMembershipId = membership.id;
    }
    const milestone = await app
      .get(PostgresMilestoneService)
      .create(actor, project.id, {
        name: 'P12 preserved milestone',
        dueDate: '2026-12-01',
      });
    const status = (semantic: TaskStatusSemanticCategory) =>
      statuses.find((s) => s.semanticCategory === semantic)!.id;
    const creator = { ...actor, membershipId: actors.creator.membership.id };
    const input = {
      owningTeamId: workspace.generalTeamId,
      statusId: status(TaskStatusSemanticCategory.IN_PROGRESS),
      title: 'P12 manual',
      priorityCode: 'MEDIUM',
      milestoneId: milestone.id,
      dueAt: '2026-12-01T09:30:00.000Z',
      description: 'Keep me',
    };
    const manual = await tasks.create(creator, project.id, input);
    await tasks.setManualProgress(creator, project.id, manual.id, 45);
    const assignee = await db.query(
      'SELECT id FROM project_memberships WHERE project_id = $1 AND organization_membership_id = $2',
      [project.id, actors.assignee.membership.id],
    );
    await tasks.assign(actor, project.id, manual.id, assignee[0].id);
    const checklist = await tasks.create(creator, project.id, {
      ...input,
      title: 'P12 checklist',
    });
    for (let i = 0; i < 3; i++) {
      const item = await tasks.addChecklistItem(
        creator,
        project.id,
        checklist.id,
        { text: `Item ${i + 1}` },
      );
      if (i === 0)
        await tasks.setChecklistItemCompletion(
          creator,
          project.id,
          checklist.id,
          item.id,
          true,
        );
    }
    const approval = await tasks.create(creator, project.id, {
      ...input,
      title: 'P12 approval',
    });
    const approver = await db.query(
      'SELECT id FROM project_memberships WHERE project_id = $1 AND organization_membership_id = $2',
      [project.id, actors.contributor.membership.id],
    );
    await tasks.configureApproval(actor, project.id, approval.id, {
      approverProjectMembershipId: approver[0].id,
    });
    const completed = await tasks.create(creator, project.id, {
      ...input,
      title: 'P12 completed',
    });
    await tasks.transitionStatus(
      creator,
      project.id,
      completed.id,
      status(TaskStatusSemanticCategory.COMPLETED),
    );
    // Arrange terminal project states directly; lifecycle commands are covered in their own suites.
    await db.getRepository(ProjectEntity).update(project.id, {
      state,
      completedAt: ['COMPLETED', 'ARCHIVED'].includes(state)
        ? new Date()
        : null,
      archivedAt: state === ProjectState.ARCHIVED ? new Date() : null,
    });
    scenarios[state] = {
      project,
      statuses,
      manual,
      checklist,
      approval,
      completed,
      milestoneId: milestone.id,
    };
  }
  const otherUser = await user('other-tenant');
  const otherWorkspace = await onboarding.createOrganization(otherUser.id, {
    name: 'P12 other tenant',
  });
  async function headers(label: keyof typeof actors) {
    return {
      Authorization: `Bearer ${await jwt.signAsync({ sub: actors[label].user.id, email: actors[label].user.email }, { secret: process.env.JWT_ACCESS_SECRET })}`,
      'x-organization-id': workspace.organizationId,
    };
  }
  const otherHeaders = {
    Authorization: `Bearer ${await jwt.signAsync({ sub: otherUser.id, email: otherUser.email }, { secret: process.env.JWT_ACCESS_SECRET })}`,
    'x-organization-id': otherWorkspace.organizationId,
  };
  return { db, workspace, actors, scenarios, headers, otherHeaders };
}
