import type { DeepPartial, EntityManager } from 'typeorm';
import {
  DocumentEntity,
  MilestoneEntity,
  RiskEntity,
  RiskTaskLinkEntity,
} from './optional-module.entities';

export class PostgresMilestoneRepository {
  constructor(private readonly manager: EntityManager) {}
  create(values: DeepPartial<MilestoneEntity>) { return this.manager.getRepository(MilestoneEntity).create(values); }
  save(milestone: MilestoneEntity) { return this.manager.getRepository(MilestoneEntity).save(milestone); }
  findByIdForUpdate(organizationId: string, projectId: string, id: string) {
    return this.manager.getRepository(MilestoneEntity).createQueryBuilder('milestone').setLock('pessimistic_write').where('milestone.organization_id = :organizationId', { organizationId }).andWhere('milestone.project_id = :projectId', { projectId }).andWhere('milestone.id = :id', { id }).getOne();
  }
}

export class PostgresDocumentRepository {
  constructor(private readonly manager: EntityManager) {}
  create(values: DeepPartial<DocumentEntity>) { return this.manager.getRepository(DocumentEntity).create(values); }
  save(document: DocumentEntity) { return this.manager.getRepository(DocumentEntity).save(document); }
  findByIdForUpdate(organizationId: string, projectId: string, id: string) {
    return this.manager.getRepository(DocumentEntity).createQueryBuilder('document').setLock('pessimistic_write').where('document.organization_id = :organizationId', { organizationId }).andWhere('document.project_id = :projectId', { projectId }).andWhere('document.id = :id', { id }).getOne();
  }
}

export class PostgresRiskRepository {
  constructor(private readonly manager: EntityManager) {}
  create(values: DeepPartial<RiskEntity>) { return this.manager.getRepository(RiskEntity).create(values); }
  save(risk: RiskEntity) { return this.manager.getRepository(RiskEntity).save(risk); }
  findByIdForUpdate(organizationId: string, projectId: string, id: string) {
    return this.manager.getRepository(RiskEntity).createQueryBuilder('risk').setLock('pessimistic_write').where('risk.organization_id = :organizationId', { organizationId }).andWhere('risk.project_id = :projectId', { projectId }).andWhere('risk.id = :id', { id }).getOne();
  }
}

export class PostgresRiskTaskLinkRepository {
  constructor(private readonly manager: EntityManager) {}
  create(values: DeepPartial<RiskTaskLinkEntity>) { return this.manager.getRepository(RiskTaskLinkEntity).create(values); }
  save(link: RiskTaskLinkEntity) { return this.manager.getRepository(RiskTaskLinkEntity).save(link); }
}
