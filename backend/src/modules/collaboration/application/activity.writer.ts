import type { EntityManager } from 'typeorm';
import { PostgresActivityEntryRepository } from '../persistence/typeorm/collaboration.repositories';

export interface PostgresActivityInput {
  organizationId: string;
  projectId?: string | null;
  actorMembershipId?: string | null;
  actionCode: string;
  subjectType: string;
  subjectId?: string | null;
  safeMetadata?: Record<string, unknown>;
}

/** Writes a timeline projection through the caller's existing business transaction. */
export async function writePostgresActivity(
  manager: EntityManager,
  input: PostgresActivityInput,
): Promise<void> {
  const activities = new PostgresActivityEntryRepository(manager);
  await activities.save(
    activities.create({
      ...input,
      projectId: input.projectId ?? null,
      actorMembershipId: input.actorMembershipId ?? null,
      subjectId: input.subjectId ?? null,
      safeMetadata: input.safeMetadata ?? {},
      sourceEventId: null,
      occurredAt: new Date(),
    }),
  );
}
