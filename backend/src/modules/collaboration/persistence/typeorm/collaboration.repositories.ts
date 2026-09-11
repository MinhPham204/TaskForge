import type { DeepPartial, EntityManager } from 'typeorm';
import {
  ActivityEntryEntity,
  AuditLogEntity,
  NotificationEntity,
  ProjectFileEntity,
  StoredFileEntity,
  TaskAttachmentEntity,
} from './collaboration.entities';

/** Manager-scoped repositories; P5 writers will compose these in their business transaction. */
export class PostgresActivityEntryRepository {
  constructor(private readonly manager: EntityManager) {}
  create(values: DeepPartial<ActivityEntryEntity>) { return this.manager.getRepository(ActivityEntryEntity).create(values); }
  save(entry: ActivityEntryEntity) { return this.manager.getRepository(ActivityEntryEntity).save(entry); }
}

export class PostgresAuditLogRepository {
  constructor(private readonly manager: EntityManager) {}
  create(values: DeepPartial<AuditLogEntity>) { return this.manager.getRepository(AuditLogEntity).create(values); }
  save(log: AuditLogEntity) { return this.manager.getRepository(AuditLogEntity).save(log); }
}

export class PostgresNotificationRepository {
  constructor(private readonly manager: EntityManager) {}
  create(values: DeepPartial<NotificationEntity>) { return this.manager.getRepository(NotificationEntity).create(values); }
  save(notification: NotificationEntity) { return this.manager.getRepository(NotificationEntity).save(notification); }
}

export class PostgresStoredFileRepository {
  constructor(private readonly manager: EntityManager) {}
  create(values: DeepPartial<StoredFileEntity>) { return this.manager.getRepository(StoredFileEntity).create(values); }
  save(file: StoredFileEntity) { return this.manager.getRepository(StoredFileEntity).save(file); }
}

export class PostgresTaskAttachmentRepository {
  constructor(private readonly manager: EntityManager) {}
  create(values: DeepPartial<TaskAttachmentEntity>) { return this.manager.getRepository(TaskAttachmentEntity).create(values); }
  save(attachment: TaskAttachmentEntity) { return this.manager.getRepository(TaskAttachmentEntity).save(attachment); }
}

export class PostgresProjectFileRepository {
  constructor(private readonly manager: EntityManager) {}
  create(values: DeepPartial<ProjectFileEntity>) { return this.manager.getRepository(ProjectFileEntity).create(values); }
  save(file: ProjectFileEntity) { return this.manager.getRepository(ProjectFileEntity).save(file); }
}
