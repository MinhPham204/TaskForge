import type { EntityManager } from 'typeorm';
import {
  OutboxEventEntity,
  type OutboxEventType,
} from '../persistence/typeorm/collaboration.entities';

export interface PostgresOutboxEventInput {
  organizationId: string;
  eventType: OutboxEventType;
  aggregateId: string;
  payload: Record<string, unknown>;
}

/** Persists a logical event through the caller's existing transaction. */
export async function writePostgresOutbox(
  manager: EntityManager,
  input: PostgresOutboxEventInput,
): Promise<OutboxEventEntity> {
  const events = manager.getRepository(OutboxEventEntity);
  return events.save(
    events.create({
      ...input,
      status: 'PENDING',
      attempts: 0,
      availableAt: new Date(),
      claimedAt: null,
      publishedAt: null,
      processedAt: null,
      lastError: null,
    }),
  );
}
