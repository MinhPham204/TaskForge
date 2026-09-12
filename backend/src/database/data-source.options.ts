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

type Environment = Record<string, string | undefined>;

export function createPostgresDataSourceOptions(
  environment: Environment,
): DataSourceOptions {
  const postgres = getPostgresConfig(environment);

  if (!postgres.url) {
    throw new Error(
      'POSTGRES_URL is required to run the PostgreSQL migration CLI.',
    );
  }

  return {
    type: 'postgres',
    url: postgres.url,
    ssl: postgres.ssl
      ? { rejectUnauthorized: postgres.sslRejectUnauthorized }
      : false,
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: 'typeorm_migrations',
    entities: [
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
    ],
    migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
  };
}
