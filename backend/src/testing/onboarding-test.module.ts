import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createPostgresDataSourceOptions } from '../database/data-source.options';
import { PostgresTransactionRunner } from '../database/transaction-runner';
import { PostgresInvitationMembershipService } from '../modules/onboarding/application/invitation-membership.service';
import { PostgresOrganizationOnboardingService } from '../modules/onboarding/application/organization-onboarding.service';
import { PostgresWorkspaceService } from '../modules/onboarding/application/workspace.service';
import { PostgresTeamService } from '../modules/projects/application/team.service';
import { PostgresProjectService } from '../modules/projects/application/project.service';
import { PostgresProjectParticipantService } from '../modules/projects/application/project-participant.service';
import { PostgresProjectStatusService } from '../modules/projects/application/project-status.service';
import { PostgresProjectModuleService } from '../modules/projects/application/project-module.service';
import { PostgresProjectReadService } from '../modules/projects/application/project-read.service';
import { PostgresMilestoneService } from '../modules/projects/application/milestone.service';
import { PostgresDocumentService } from '../modules/projects/application/document.service';
import { PostgresRiskService } from '../modules/projects/application/risk.service';
import { PostgresTaskService } from '../modules/task/application/task.service';
import { PostgresTaskReadService } from '../modules/task/application/task-read.service';
import { PostgresNotificationService } from '../modules/collaboration/application/notification.service';
import { PostgresJwtAuthGuard } from '../modules/onboarding/tenant/jwt-auth.guard';
import { PostgresTenantAccessService } from '../modules/onboarding/tenant/tenant-access.service';
import { PostgresTenantContextService } from '../modules/onboarding/tenant/tenant-context';
import { PostgresTenantInterceptor } from '../modules/onboarding/tenant/tenant.interceptor';
import { PostgresTenantMembershipGuard } from '../modules/onboarding/tenant/tenant-membership.guard';
import { PostgresOnboardingController } from '../modules/onboarding/transport/onboarding.controller';
import { PostgresTeamController } from '../modules/projects/transport/team.controller';
import { PostgresProjectController } from '../modules/projects/transport/project.controller';
import { PostgresProjectParticipantController } from '../modules/projects/transport/project-participant.controller';
import { PostgresProjectStatusController } from '../modules/projects/transport/project-status.controller';
import { PostgresProjectModuleController } from '../modules/projects/transport/project-module.controller';
import { PostgresMilestoneController } from '../modules/projects/transport/milestone.controller';
import { PostgresDocumentController } from '../modules/projects/transport/document.controller';
import { PostgresRiskController } from '../modules/projects/transport/risk.controller';
import { PostgresNotificationController } from '../modules/collaboration/transport/notification.controller';
import { PostgresProjectActivityController } from '../modules/collaboration/transport/project-activity.controller';
import { PostgresProjectFileController } from '../modules/collaboration/transport/project-file.controller';
import { PostgresTaskAttachmentController } from '../modules/collaboration/transport/task-attachment.controller';
import {
  PostgresTaskController,
  PostgresWorkspaceTaskReadController,
} from '../modules/task/transport/task.controller';
import {
  LocalFileStorageAdapter,
  PostgresFileStorageService,
} from '../modules/collaboration/application/file-storage';
import { PostgresFileRelationService } from '../modules/collaboration/application/file-relation.service';
import { PostgresCollaborationService } from '../modules/collaboration/application/collaboration.service';
import { join } from 'node:path';
import { requirePostgresTestUrl } from './database-test.config';

const testPostgresUrl = requirePostgresTestUrl(process.env);
const testDataSourceOptions = createPostgresDataSourceOptions({
  ...process.env,
  POSTGRES_URL: testPostgresUrl,
  POSTGRES_SSL: 'false',
  POSTGRES_SYNCHRONIZE: 'false',
});

/**
 * Test-only PostgreSQL composition root used by integration suites to exercise
 * the same database contracts as the application runtime.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    JwtModule.register({}),
    TypeOrmModule.forRoot({ ...testDataSourceOptions, migrations: [] }),
  ],
  controllers: [
    PostgresOnboardingController,
    PostgresTeamController,
    PostgresProjectController,
    PostgresProjectParticipantController,
    PostgresProjectStatusController,
    PostgresProjectModuleController,
    PostgresMilestoneController,
    PostgresDocumentController,
    PostgresRiskController,
    PostgresTaskController,
    PostgresWorkspaceTaskReadController,
    PostgresNotificationController,
    PostgresProjectActivityController,
    PostgresProjectFileController,
    PostgresTaskAttachmentController,
  ],
  providers: [
    PostgresTransactionRunner,
    PostgresTenantContextService,
    PostgresTenantAccessService,
    PostgresJwtAuthGuard,
    PostgresTenantMembershipGuard,
    PostgresTenantInterceptor,
    {
      provide: PostgresOrganizationOnboardingService,
      useFactory: (transactions: PostgresTransactionRunner) =>
        new PostgresOrganizationOnboardingService(transactions),
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresWorkspaceService,
      useFactory: (
        dataSource: DataSource,
        transactions: PostgresTransactionRunner,
      ) => new PostgresWorkspaceService(dataSource.manager, transactions),
      inject: [DataSource, PostgresTransactionRunner],
    },
    {
      provide: PostgresInvitationMembershipService,
      useFactory: (
        dataSource: DataSource,
        transactions: PostgresTransactionRunner,
      ) =>
        new PostgresInvitationMembershipService(
          dataSource.manager,
          transactions,
        ),
      inject: [DataSource, PostgresTransactionRunner],
    },
    {
      provide: PostgresTeamService,
      useFactory: (transactions: PostgresTransactionRunner) =>
        new PostgresTeamService(transactions),
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresProjectService,
      useFactory: (transactions: PostgresTransactionRunner) =>
        new PostgresProjectService(transactions),
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresProjectReadService,
      useFactory: (transactions: PostgresTransactionRunner) =>
        new PostgresProjectReadService(transactions),
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresProjectParticipantService,
      useFactory: (transactions: PostgresTransactionRunner) =>
        new PostgresProjectParticipantService(transactions),
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresProjectStatusService,
      useFactory: (transactions: PostgresTransactionRunner) =>
        new PostgresProjectStatusService(transactions),
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresProjectModuleService,
      useFactory: (transactions: PostgresTransactionRunner) =>
        new PostgresProjectModuleService(transactions),
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresMilestoneService,
      useFactory: (transactions: PostgresTransactionRunner) => new PostgresMilestoneService(transactions),
      inject: [PostgresTransactionRunner],
    },
    { provide: PostgresDocumentService, useFactory: (transactions: PostgresTransactionRunner) => new PostgresDocumentService(transactions), inject: [PostgresTransactionRunner] },
    { provide: PostgresRiskService, useFactory: (transactions: PostgresTransactionRunner, notifications: PostgresNotificationService) => new PostgresRiskService(transactions, notifications), inject: [PostgresTransactionRunner, PostgresNotificationService] },
    {
      provide: PostgresTaskService,
      useFactory: (transactions: PostgresTransactionRunner) =>
        new PostgresTaskService(transactions),
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresTaskReadService,
      useFactory: (transactions: PostgresTransactionRunner) =>
        new PostgresTaskReadService(transactions),
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresNotificationService,
      useFactory: (transactions: PostgresTransactionRunner) =>
        new PostgresNotificationService(transactions),
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresFileStorageService,
      useFactory: (transactions: PostgresTransactionRunner) => {
        const storageRoot =
          process.env.STORAGE_LOCAL_ROOT || join(process.cwd(), 'uploads');
        return new PostgresFileStorageService(
          transactions,
          new LocalFileStorageAdapter(storageRoot),
        );
      },
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresFileRelationService,
      useFactory: (transactions: PostgresTransactionRunner) =>
        new PostgresFileRelationService(transactions),
      inject: [PostgresTransactionRunner],
    },
    {
      provide: PostgresCollaborationService,
      useFactory: (
        transactions: PostgresTransactionRunner,
        storage: PostgresFileStorageService,
        relations: PostgresFileRelationService,
      ) => new PostgresCollaborationService(transactions, storage, relations),
      inject: [
        PostgresTransactionRunner,
        PostgresFileStorageService,
        PostgresFileRelationService,
      ],
    },
  ],
})
export class PostgresOnboardingTestModule {}
