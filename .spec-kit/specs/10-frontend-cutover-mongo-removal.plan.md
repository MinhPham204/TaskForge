# Plan 10 — Frontend Alignment, PostgreSQL Cutover & Mongo Removal

> **Execution status:** Not started; depends on Phase 1–9 và data disposition gate.  
> **Roadmap:** [Phase 10](../REFACTOR_ROADMAP_v0.3.md#phase-10--frontend-contract-alignment-postgresql-cutover--mongo-removal)  
> **Destructive boundary:** Data reset/migration và Mongo removal chỉ được chạy trên exact target đã xác nhận và có rollback/checkpoint.

## 1. Outcome và invariants

Chuyển runtime một chiều sang PostgreSQL + OpenFGA, align frontend với target contract và loại Mongo/Mongoose/ObjectId/legacy domain authority. Không giữ dual-write hoặc permanent compatibility architecture.

## 2. Mandatory pre-cutover gates

- Phase 1–9 exit criteria và full target composition tests xanh.
- Quyết định Mongo data là disposable hay production cần giữ đã được ký nhận.
- Nếu cần giữ data: Data Migration Strategy riêng đã Accepted, dry-run/validation/rollback window đã rehearsal.
- Backup/checkpoint, rollback trigger, owner và maintenance communication đã rõ.

## 3. Task checklist

- [ ] `P10-01` — Audit target-vs-current backend/frontend contract; chỉ giữ compatibility shape có semantic map một-một.
- [ ] `P10-02` — Implement frontend active workspace selection, `X-Organization-Id` và tenant-bound cache reset khi switch.
- [ ] `P10-03` — Align frontend UUID opaque IDs, Project navigation/participants, configured Board status, Approval và role contexts.
- [ ] `P10-04` — Assemble target AppModule/composition root và production-like full test stack mà chưa switch served runtime.
- [ ] `P10-05` — Thực hiện seed/reset cho disposable data hoặc execute riêng Accepted Data Migration Strategy; không tự chạy stateful command trên unknown target.
- [ ] `P10-06` — Rebuild/reconcile OpenFGA tuples từ PostgreSQL authoritative relationships và pin authorization model ID.
- [ ] `P10-07` — Chạy pre-cutover critical E2E/security/data validation; xác nhận rollback decision point.
- [ ] `P10-08` — Switch config/composition/containers sang PostgreSQL-only runtime và OpenFGA authorization.
- [ ] `P10-09` — Xóa Mongoose/Mongo dependencies, schemas/plugins/services/container/env, ObjectId validators, Mongo migrations/seeder và legacy routes/fields.
- [ ] `P10-10` — Xóa frontend global role/organization, Team Lead, fixed-status và legacy cache assumptions.
- [ ] `P10-11` — Update docs/env/seed/operations theo source thực tế và chạy no-Mongo/no-ObjectId source scan.
- [ ] `P10-12` — Chạy post-cutover smoke/security/reconciliation; rollback nếu trigger đã định nghĩa xảy ra.

## 4. Verification

- [ ] Full E2E: onboarding, multi-org switch, Team, Project, participants/status/modules, Task/Checklist, Approval, files và async.
- [ ] Tenant negatives xanh cho detail/list/search/report/file/worker.
- [ ] Không còn import/config/runtime reference `mongoose`, `@nestjs/mongoose`, ObjectId, `MONGO_URI` hoặc Mongo service/container.
- [ ] Frontend không derive quyền từ global User role/organization, Team Lead hoặc fixed approval status.
- [ ] PostgreSQL validation không orphan/violate FK; migration/reset report được lưu.
- [ ] OpenFGA outage fail closed; tuple reconciliation không còn drift tại cutover gate.

## 5. Exit và rollback

Phase pass khi PostgreSQL là business persistence duy nhất và Mongo path đã bị xóa. Mọi destructive action phải báo exact target, backup/rollback state và kết quả; không giữ Mongo fallback sau accepted cutover.
