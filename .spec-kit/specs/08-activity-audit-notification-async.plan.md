# Plan 08 — Activity, Audit, Notification & Async

> **Execution status:** Not started; depends on Phase 2–7.  
> **Roadmap:** [Phase 8](../REFACTOR_ROADMAP_v0.3.md#phase-8--activity-audit-notification--async-boundary)

## 1. Outcome và invariants

Thêm supporting records và side effects sau khi business commands đã ổn định. Activity, Audit, Notification, queue và OpenFGA projection đều không thay business Source of Truth.

## 2. Implementation slices

- Domain event/intent contracts.
- Activity/Audit/Notification persistence.
- BullMQ producer/worker/scheduler reliability.
- OpenFGA relationship projection retry/reconciliation/freshness.

## 3. Task checklist

- [ ] `P8-01` — Phân loại core events/intents; payload chỉ chứa stable IDs và minimum context, không ORM entity/secret.
- [ ] `P8-02` — Implement append-oriented AuditLog cho critical commands; không normal update/delete path và redact sensitive data.
- [ ] `P8-03` — Implement Activity timeline projection và Notification lifecycle; transactional domain tables vẫn là SoT.
- [ ] `P8-04` — Chuyển reminder scan/recipient resolution sang PostgreSQL queries với explicit Organization/Project context.
- [ ] `P8-05` — Implement idempotency, dedup, retry và dead-letter behavior theo từng job/side effect.
- [ ] `P8-06` — Tách worker/scheduler bootstrap role hoặc lock strategy để scale API không duplicate cron.
- [ ] `P8-07` — Đánh giá transaction-to-queue gap từng critical flow; chỉ thêm selective Outbox nếu reliability requirement chứng minh.
- [ ] `P8-08` — Implement durable-enough OpenFGA tuple handoff cho security-critical grant/revoke; document freshness SLA/fail-closed behavior.
- [ ] `P8-09` — Implement reconciliation từ authoritative PostgreSQL relationships và observability cho tuple drift/failure.
- [ ] `P8-10` — Thêm failure/retry/idempotency/cross-tenant worker và reconciliation integration tests.

## 4. Verification

- [ ] Inactive/cross-tenant recipient không nhận actionable notification trái quyền.
- [ ] Duplicate/retried job không duplicate business mutation.
- [ ] Worker ngoài HTTP ALS vẫn scope tenant đúng hoặc fail closed.
- [ ] Notification/Activity/OpenFGA failure không rollback hay sửa committed business truth.
- [ ] Audit immutable theo application path và không chứa secret.
- [ ] Reconciliation sửa drift từ PostgreSQL; revocation đạt freshness gate đã chốt.

## 5. Exit và deferred

Phase pass khi async boundary và relationship projection có failure evidence. Không thêm realtime transport hoặc generic Outbox nếu chưa có requirement; production operational tuning thuộc Phase 12.
