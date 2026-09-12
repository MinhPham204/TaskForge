import { createPostgresDataSourceOptions } from './data-source.options';
import {
  OrganizationEntity,
  OrganizationInvitationEntity,
  OrganizationMembershipEntity,
  TeamEntity,
  TeamMemberEntity,
  UserEntity,
} from '../modules/onboarding/persistence/typeorm/onboarding.entities';
import {
  ProjectEntity,
  ProjectMembershipEntity,
  ProjectModuleSettingEntity,
  ProjectTaskStatusEntity,
  ProjectTeamEntity,
} from '../modules/projects/persistence/typeorm/project.entities';
import {
  DocumentEntity,
  MilestoneEntity,
  RiskEntity,
  RiskTaskLinkEntity,
} from '../modules/projects/persistence/typeorm/optional-module.entities';
import {
  ApprovalRequestEntity,
  CommentEntity,
  TaskAssigneeEntity,
  TaskChecklistItemEntity,
  TaskEntity,
} from '../modules/task/persistence/typeorm/task.entities';
import {
  ActivityEntryEntity,
  AuditLogEntity,
  NotificationEntity,
  ProjectFileEntity,
  StoredFileEntity,
  TaskAttachmentEntity,
} from '../modules/collaboration/persistence/typeorm/collaboration.entities';

describe('createPostgresDataSourceOptions', () => {
  it('creates migration-only options without runtime schema synchronization', () => {
    const options = createPostgresDataSourceOptions({
      POSTGRES_URL: 'postgresql://user:password@db.example.test:5432/taskforge',
      POSTGRES_SSL: 'true',
      POSTGRES_SSL_REJECT_UNAUTHORIZED: 'false',
      POSTGRES_SYNCHRONIZE: 'false',
    });

    expect(options).toMatchObject({
      type: 'postgres',
      url: 'postgresql://user:password@db.example.test:5432/taskforge',
      ssl: { rejectUnauthorized: false },
      synchronize: false,
      migrationsRun: false,
      migrationsTableName: 'typeorm_migrations',
    });
    expect(options.entities).toEqual([
      UserEntity,
      OrganizationEntity,
      OrganizationMembershipEntity,
      OrganizationInvitationEntity,
      TeamEntity,
      TeamMemberEntity,
      ProjectEntity,
      ProjectTeamEntity,
      ProjectMembershipEntity,
      ProjectTaskStatusEntity,
      ProjectModuleSettingEntity,
      MilestoneEntity,
      DocumentEntity,
      RiskEntity,
      RiskTaskLinkEntity,
      TaskEntity,
      TaskAssigneeEntity,
      TaskChecklistItemEntity,
      ApprovalRequestEntity,
      CommentEntity,
      ActivityEntryEntity,
      AuditLogEntity,
      NotificationEntity,
      StoredFileEntity,
      TaskAttachmentEntity,
      ProjectFileEntity,
    ]);
    expect(options.migrations).toEqual([
      expect.stringMatching(/database[\\/]migrations/),
    ]);
  });

  it('does not permit the CLI to run without a PostgreSQL target', () => {
    expect(() => createPostgresDataSourceOptions({})).toThrow(
      'POSTGRES_URL is required',
    );
  });
});
