# Plan 12 — CI, Deployment & Operational Hardening

> **Execution status:** Not started; depends on Phase 11.  
> **Roadmap:** [Phase 12](../REFACTOR_ROADMAP_v0.3.md#phase-12--ci-deployment--operational-hardening)

## 1. Outcome và invariants

Đưa PostgreSQL-only target vào trạng thái build/test/deploy lặp lại được và vận hành an toàn. Phase này gate lại safety net đã xây ở từng capability, không phải nơi bù test bị thiếu.

## 2. Implementation slices

- Clean CI cho backend/frontend và migration/security suites.
- Reproducible production images và one-shot migration jobs.
- PostgreSQL/Redis/OpenFGA/API/worker deployment topology.
- Backup/restore, observability, secrets và runbooks.

## 3. Task checklist

- [ ] `P12-01` — Thiết lập CI từ clean checkout với `npm ci`, non-mutating lint/typecheck, unit, PostgreSQL integration, OpenFGA model/integration, critical E2E và build.
- [ ] `P12-02` — Build pinned multi-stage production images; không dùng mutable `latest` cho target services.
- [ ] `P12-03` — Tạo one-shot TypeORM và OpenFGA datastore migration jobs; API replicas không tự chạy concurrent migrations.
- [ ] `P12-04` — Configure PostgreSQL/Redis/OpenFGA private networking, health/readiness và least-exposed ports.
- [ ] `P12-05` — Configure OpenFGA auth/TLS, pinned model ID, timeout/fail-closed, datastore pool, metrics và disable Playground production.
- [ ] `P12-06` — Tách API, worker và scheduler deployment roles; graceful shutdown đóng queue/DB/OpenFGA client đúng.
- [ ] `P12-07` — Enforce bootstrap config validation; secret/connection URI không nằm trong repo hoặc log.
- [ ] `P12-08` — Implement retry/dead-letter/alert baseline và operational visibility cho queue/OpenFGA projection drift.
- [ ] `P12-09` — Rehearse PostgreSQL backup/restore vào database mới và chạy critical smoke.
- [ ] `P12-10` — Update README, environment reference, deployment/migration/rollback/incident runbooks theo source thật.
- [ ] `P12-11` — Chỉ benchmark/tune query/index/pool từ measured production-like workload; ghi before/after evidence.

## 4. Verification

- [ ] CI xanh từ clean environment; không có formatter/lint auto-fix trên dirty worktree trong verification workflow.
- [ ] Fresh migration và tested upgrade path pass; second deploy không drift.
- [ ] Readiness phản ánh PostgreSQL/OpenFGA/migration state; graceful shutdown không mất job đang xử lý.
- [ ] Restore vào database mới thành công và critical smoke xanh.
- [ ] PostgreSQL/Redis/OpenFGA không public; secrets không xuất hiện trong repo/log/artifact.
- [ ] Scale API không duplicate scheduler; outage OpenFGA fail closed cho protected operations.

## 5. Exit criteria

Phase và roadmap chỉ hoàn tất khi toàn bộ Definition of Done trong Roadmap có source/test/operational evidence, không còn Mongo runtime reference và tài liệu phản ánh đúng hệ thống đã deploy.
