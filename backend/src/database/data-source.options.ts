import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { getPostgresConfig } from '../config/database.config';
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

type Environment = Record<string, string | undefined>;
type DataSourcePurpose = 'runtime' | 'migration';

export function createPostgresDataSourceOptions(
  environment: Environment,
  purpose: DataSourcePurpose = 'migration',
): DataSourceOptions {
  const postgres = getPostgresConfig(environment);
  const url =
    purpose === 'migration'
      ? (postgres.migrationUrl ?? postgres.url)
      : postgres.url;

  if (!url) {
    throw new Error(
      'DATABASE_URL is required to run the PostgreSQL migration CLI.',
    );
  }

  return {
    type: 'postgres',
    url,
    ssl: postgres.ssl
      ? {
          rejectUnauthorized: postgres.sslRejectUnauthorized,
          ...(postgres.sslCa ? { ca: postgres.sslCa } : {}),
        }
      : false,
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: 'typeorm_migrations',
    extra: {
      max: postgres.poolMax,
      connectionTimeoutMillis: postgres.connectionTimeoutMs,
    },
    entities: [
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
    ],
    migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
  };
}
