import { createPostgresDataSourceOptions } from './data-source.options';
import {
  OrganizationEntity,
  OrganizationInvitationEntity,
  OrganizationMembershipEntity,
  TeamEntity,
  TeamMemberEntity,
  UserEntity,
  UserPreferenceEntity,
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
  OutboxEventEntity,
  ProjectFileEntity,
  StoredFileEntity,
  TaskAttachmentEntity,
} from '../modules/collaboration/persistence/typeorm/collaboration.entities';

describe('createPostgresDataSourceOptions', () => {
  it('creates migration-only options without runtime schema synchronization', () => {
    const options = createPostgresDataSourceOptions({
      DATABASE_URL: 'postgresql://user:password@db.example.test:5432/taskforge',
      DATABASE_SSL: 'true',
      DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
      DATABASE_POOL_MAX: '7',
      DATABASE_CONNECTION_TIMEOUT_MS: '2500',
      DATABASE_SYNCHRONIZE: 'false',
    });

    expect(options).toMatchObject({
      type: 'postgres',
      url: 'postgresql://user:password@db.example.test:5432/taskforge',
      ssl: { rejectUnauthorized: false },
      synchronize: false,
      migrationsRun: false,
      migrationsTableName: 'typeorm_migrations',
      extra: { max: 7, connectionTimeoutMillis: 2500 },
    });
    expect(options.entities).toEqual([
      UserEntity,
      UserPreferenceEntity,
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
      OutboxEventEntity,
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
      'DATABASE_URL is required',
    );
  });

  it('uses the optional migration URL only for migration commands', () => {
    const environment = {
      DATABASE_URL:
        'postgresql://user:password@runtime.example.test:5432/taskforge',
      MIGRATION_DATABASE_URL:
        'postgresql://user:password@migration.example.test:5432/taskforge',
    };

    expect(createPostgresDataSourceOptions(environment).url).toContain(
      'migration.example.test',
    );
    expect(
      createPostgresDataSourceOptions(environment, 'runtime').url,
    ).toContain('runtime.example.test');
  });

  it('passes an optional trusted CA to pg without disabling verification', () => {
    const certificate =
      '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----';
    const options = createPostgresDataSourceOptions({
      DATABASE_URL: 'postgresql://user:password@db.example.test:5432/taskforge',
      DATABASE_SSL: 'true',
      DATABASE_SSL_CA_BASE64: Buffer.from(certificate).toString('base64'),
    });

    expect(options.ssl).toEqual({ rejectUnauthorized: true, ca: certificate });
  });
});
