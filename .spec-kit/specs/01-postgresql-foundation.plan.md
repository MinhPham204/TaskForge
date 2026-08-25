# Plan 01 — PostgreSQL Foundation & Verification Harness

> **Execution status:** Not started; blocked until Gate 0 pass.  
> **Roadmap:** [Phase 1](../REFACTOR_ROADMAP_v0.3.md#phase-1--postgresql-foundation--verification-harness)  
> **Primary baselines:** [Data Model](../../docs/POSTGRESQL_TARGET_DATA_MODEL_v0.3.md), [Tech Stack](../../docs/TARGET_TECH_STACK_REVIEW_v0.3.md), [ADR-002](../adr/ADR-002-postgresql-persistence.md), [ADR-005](../adr/ADR-005-openfga-rebac.md).

## 1. Outcome và ranh giới

Tạo PostgreSQL/TypeORM/OpenFGA test foundation có thể tái lập mà chưa thay đổi business runtime. MongoDB vẫn là served authority; không target route và không dual-write.

## 2. Implementation slices

- Dependency/configuration và TypeORM DataSource.
- Executable schema v0.3 qua TypeORM migrations và custom PostgreSQL SQL khi cần.
- Disposable PostgreSQL/OpenFGA/Redis lifecycle cho local/test.
- Database constraint/transaction harness và OpenFGA infrastructure smoke.

## 3. Task checklist

- [ ] `P1-01` — Pin compatible tested set: NestJS 11 + TypeORM 1.1.x + `@nestjs/typeorm` 11.x + `pg` 8.x; không thêm Prisma.
- [ ] `P1-02` — Thêm validated database/OpenFGA config bằng variable names trong `.env.example`; không đọc/log secret hoặc connection URI.
- [ ] `P1-03` — Tạo TypeORM DataSource và migration CLI tách bootstrap runtime; production/shared config bắt buộc `synchronize: false`.
- [ ] `P1-04` — Chuyển Frozen Data Model thành migration chain có review SQL cho enum, partial unique index, check và composite same-tenant FK.
- [ ] `P1-05` — Đặt repository/transaction convention tối thiểu; controller không inject DataSource/raw ORM repository.
- [ ] `P1-06` — Thêm PostgreSQL/OpenFGA/Redis local-test composition với image pin, healthcheck và datastore/schema tách biệt.
- [ ] `P1-07` — Thêm one-shot TypeORM migration workflow; API replica không tự migrate khi start.
- [ ] `P1-08` — Thêm OpenFGA datastore migration, client config, pinned model-ID convention và empty-model write/check/restart harness; chưa ghi business tuple production.
- [ ] `P1-09` — Tạo disposable database reset helper và guard chống chạy test stateful trên database không được xác nhận.
- [ ] `P1-10` — Rebaseline env/Compose/technical guidance cần thiết, giữ Mongo runtime đến Phase 10.

## 4. Verification

- [ ] Fresh database apply toàn bộ migration; deploy lần hai không drift/pending migration.
- [ ] Integration tests cover UUID, enum, checks, partial unique, composite FK và rollback.
- [ ] Automated assertion chứng minh production `synchronize: false` và API không auto-migrate.
- [ ] OpenFGA migrate/write/check/restart smoke pass; datastore không dùng TaskForge business schema.
- [ ] Nest build/smoke pass và source scan chứng minh không target route/dual-write.

## 5. Exit và deferred

Phase pass khi foundation tái lập được từ clean environment và toàn bộ verification xanh. Chưa implement domain repository, business tuple, RLS, generic Outbox, production cutover hoặc Mongo cleanup.
