import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PostgresFileRelationService } from '../src/modules/collaboration/application/file-relation.service';
import { StoredFileEntity } from '../src/modules/collaboration/persistence/typeorm/collaboration.entities';
import { PostgresTransactionRunner } from '../src/database/transaction-runner';
import { PostgresOrganizationOnboardingService } from '../src/modules/onboarding/application/organization-onboarding.service';
import { UserEntity } from '../src/modules/onboarding/persistence/typeorm/onboarding.entities';
import { PostgresProjectModuleService } from '../src/modules/projects/application/project-module.service';
import { PostgresProjectService } from '../src/modules/projects/application/project.service';
import { ProjectModuleCode, ProjectTaskStatusEntity, TaskStatusSemanticCategory } from '../src/modules/projects/persistence/typeorm/project.entities';
import { PostgresTaskService } from '../src/modules/task/application/task.service';
import { PostgresOnboardingTestModule } from '../src/testing/onboarding-test.module';

describe('PostgreSQL file relation integration', () => {
  let dataSource: DataSource;
  let onboarding: PostgresOrganizationOnboardingService;
  let projects: PostgresProjectService;
  let modules: PostgresProjectModuleService;
  let tasks: PostgresTaskService;
  let relations: PostgresFileRelationService;
  let sequence = 0;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PostgresOnboardingTestModule] }).compile();
    dataSource = module.get(DataSource); onboarding = module.get(PostgresOrganizationOnboardingService);
    projects = module.get(PostgresProjectService); modules = module.get(PostgresProjectModuleService); tasks = module.get(PostgresTaskService);
    relations = new PostgresFileRelationService(module.get(PostgresTransactionRunner));
  });
  beforeEach(async () => {
    sequence += 1;
    await dataSource.query(`TRUNCATE TABLE notifications, audit_logs, activity_entries, project_files, task_attachments, stored_files, comments, task_approval_requests, task_checklist_items, task_assignees, tasks, project_module_settings, project_task_statuses, project_memberships, project_teams, team_members, organization_invitations, organization_memberships, teams, organizations, users RESTART IDENTITY CASCADE`);
  });
  afterAll(async () => dataSource.destroy());

  it('keeps TaskAttachment available while Files is disabled and gates ProjectFile by the module', async () => {
    const first = await workspace('first');
    const second = await workspace('second');
    const actor = { organizationId: first.organizationId, membershipId: first.membershipId };
    const project = await projects.create(actor, { name: 'Files project' });
    const status = await dataSource.getRepository(ProjectTaskStatusEntity).findOneByOrFail({ projectId: project.id, semanticCategory: TaskStatusSemanticCategory.NOT_STARTED });
    const task = await tasks.create(actor, project.id, { owningTeamId: first.generalTeamId, statusId: status.id, title: 'Attachment task', description: '', priorityCode: 'MEDIUM', dueAt: null });
    const firstFile = await storedFile(first.organizationId, first.membershipId, 'first');
    const secondFile = await storedFile(second.organizationId, second.membershipId, 'second');

    await modules.setEnabled(actor, project.id, ProjectModuleCode.FILES, false);
    const attachment = await relations.attachToTask(actor, project.id, task.id, firstFile.id);
    expect(attachment).toEqual(expect.objectContaining({ storedFileId: firstFile.id }));
    await expect(relations.addToProject(actor, project.id, firstFile.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(relations.attachToTask(actor, project.id, task.id, secondFile.id)).rejects.toBeInstanceOf(NotFoundException);

    await modules.setEnabled(actor, project.id, ProjectModuleCode.FILES, true);
    const projectFile = await relations.addToProject(actor, project.id, firstFile.id, 'Release evidence');
    expect(projectFile).toEqual(expect.objectContaining({ displayName: 'Release evidence', storedFileId: firstFile.id }));
    await expect(relations.addToProject(actor, project.id, secondFile.id)).rejects.toBeInstanceOf(NotFoundException);
    await modules.setEnabled(actor, project.id, ProjectModuleCode.FILES, false);
    await expect(relations.unlinkTask(actor, project.id, task.id, attachment.id)).resolves.toEqual(expect.objectContaining({ removedAt: expect.any(Date) }));
    await expect(relations.unlinkTask(actor, project.id, task.id, attachment.id)).resolves.toEqual(expect.objectContaining({ removedAt: expect.any(Date) }));
    await expect(relations.removeFromProject(actor, project.id, projectFile.id)).resolves.toEqual(expect.objectContaining({ removedAt: expect.any(Date) }));
  });

  async function workspace(prefix: string) {
    const user = await dataSource.getRepository(UserEntity).save({ email: `${prefix}-${sequence}@example.test`, name: prefix, passwordHash: 'hash', profileImageUrl: null, emailVerifiedAt: new Date(), refreshTokenHash: null, disabledAt: null });
    return onboarding.createOrganization(user.id, { name: `${prefix} workspace` });
  }
  function storedFile(organizationId: string, membershipId: string, suffix: string) {
    return dataSource.getRepository(StoredFileEntity).save({ organizationId, storageProviderCode: 'test', objectKey: `${organizationId}-${suffix}`, originalName: `${suffix}.txt`, mediaType: 'text/plain', sizeBytes: '1', checksumSha256: null, uploadedByMembershipId: membershipId, deletedAt: null });
  }
});
