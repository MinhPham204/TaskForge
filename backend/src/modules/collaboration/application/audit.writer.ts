import type { EntityManager } from 'typeorm';
import { PostgresAuditLogRepository } from '../persistence/typeorm/collaboration.repositories';

export interface PostgresAuditInput {
  organizationId?: string | null;
  projectId?: string | null;
  actorUserId?: string | null;
  actorMembershipId?: string | null;
  actionCode: string;
  targetType: string;
  targetId?: string | null;
  outcomeCode?: string;
  reason?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  correlationId?: string | null;
}

const SENSITIVE_KEY = /(password|token|secret|authorization|credential|otp)/i;

/**
 * Writes one immutable governance record through the caller's transaction.
 * Payloads are defensively redacted here so callers cannot persist credentials
 * accidentally, including in nested metadata.
 */
export async function writePostgresAudit(
  manager: EntityManager,
  input: PostgresAuditInput,
): Promise<void> {
  const auditLogs = new PostgresAuditLogRepository(manager);
  await auditLogs.save(
    auditLogs.create({
      organizationId: input.organizationId ?? null,
      projectId: input.projectId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorMembershipId: input.actorMembershipId ?? null,
      actionCode: input.actionCode,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      outcomeCode: input.outcomeCode ?? 'SUCCESS',
      reason: input.reason ?? null,
      beforeData: redactAuditData(input.beforeData),
      afterData: redactAuditData(input.afterData),
      correlationId: input.correlationId ?? null,
      occurredAt: new Date(),
    }),
  );
}

export function redactAuditData(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  return redactValue(value) as Record<string, unknown>;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactValue(child),
    ]),
  );
}
