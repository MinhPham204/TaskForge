import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { EmailService } from '../../common/services/email.service';
import { RedisService } from '../../common/services/redis.service';
import { PostgresTransactionRunner } from '../../database/transaction-runner';
import { PostgresAuthService } from './application/auth.service';
import { PostgresInvitationMembershipService } from './application/invitation-membership.service';
import { PostgresOrganizationOnboardingService } from './application/organization-onboarding.service';
import { PostgresWorkspaceService } from './application/workspace.service';
import { PostgresTeamService } from '../projects/application/team.service';
import { PostgresProjectService } from '../projects/application/project.service';
import { PostgresProjectParticipantService } from '../projects/application/project-participant.service';
import { PostgresProjectStatusService } from '../projects/application/project-status.service';
import { PostgresProjectModuleService } from '../projects/application/project-module.service';
import { PostgresProjectReadService } from '../projects/application/project-read.service';
import { PostgresMilestoneService } from '../projects/application/milestone.service';
import { PostgresDocumentService } from '../projects/application/document.service';
import { PostgresRiskService } from '../projects/application/risk.service';
import { PostgresTaskService } from '../task/application/task.service';
import { PostgresTaskReadService } from '../task/application/task-read.service';
import { PostgresJwtAuthGuard } from './tenant/jwt-auth.guard';
import { PostgresTenantAccessService } from './tenant/tenant-access.service';
import { PostgresTenantContextService } from './tenant/tenant-context';
import { PostgresTenantInterceptor } from './tenant/tenant.interceptor';
import { PostgresTenantMembershipGuard } from './tenant/tenant-membership.guard';
import { PostgresAuthController } from './transport/auth.controller';
import { PostgresOnboardingController } from './transport/onboarding.controller';
import { PostgresTeamController } from '../projects/transport/team.controller';
import { PostgresProjectController } from '../projects/transport/project.controller';
import { PostgresProjectParticipantController } from '../projects/transport/project-participant.controller';
import { PostgresProjectStatusController } from '../projects/transport/project-status.controller';
import { PostgresProjectModuleController } from '../projects/transport/project-module.controller';
import { PostgresMilestoneController } from '../projects/transport/milestone.controller';
import { PostgresDocumentController } from '../projects/transport/document.controller';
import { PostgresRiskController } from '../projects/transport/risk.controller';
import {
  PostgresTaskController,
  PostgresWorkspaceTaskReadController,
} from '../task/transport/task.controller';
import { PostgresNotificationController } from '../collaboration/transport/notification.controller';
import { PostgresProjectActivityController } from '../collaboration/transport/project-activity.controller';
import { PostgresProjectFileController } from '../collaboration/transport/project-file.controller';
import { PostgresTaskAttachmentController } from '../collaboration/transport/task-attachment.controller';
import { PostgresNotificationService } from '../collaboration/application/notification.service';
import {
  LocalFileStorageAdapter,
  MinioFileStorageAdapter,
  PostgresFileStorageService,
} from '../collaboration/application/file-storage';
import { PostgresFileRelationService } from '../collaboration/application/file-relation.service';
import { PostgresCollaborationService } from '../collaboration/application/collaboration.service';
import { join } from 'node:path';
import { Client } from 'minio';
import { getMinioConfig } from '../../config/minio.config';

/** The served PostgreSQL-only composition root introduced by P2-10. */
@Module({
  imports: [JwtModule.register({})],
  controllers: [
    PostgresAuthController,
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
      provide: PostgresAuthService,
      useFactory: (
        dataSource: DataSource,
        jwt: JwtService,
        redis: RedisService,
        email: EmailService,
        config: ConfigService,
      ) =>
        new PostgresAuthService(dataSource.manager, jwt, redis, email, config),
      inject: [
        DataSource,
        JwtService,
        RedisService,
        EmailService,
        ConfigService,
      ],
    },
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
        const minio = getMinioConfig(process.env);
        if (minio) {
          const client = new Client({ endPoint: minio.endpoint, port: minio.port, useSSL: minio.useSSL, accessKey: minio.accessKey, secretKey: minio.secretKey });
          return new PostgresFileStorageService(transactions, new MinioFileStorageAdapter(client, minio.bucket));
        }
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
export class PostgresOnboardingRuntimeModule {}
