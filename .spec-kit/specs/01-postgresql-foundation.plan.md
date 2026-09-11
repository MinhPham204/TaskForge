# Plan 01 — PostgreSQL Foundation, CI & Early Deploy

> **Execution status:** Complete; `P1-00` through `P1-09` complete. Next canonical work is `P2-01`.
> **Runtime:** MongoDB legacy có thể được gỡ theo quyết định user sau khi PostgreSQL DataSource và schema migration khả dụng; không dual-write.

## 1. Outcome

Tạo PostgreSQL/TypeORM foundation nhỏ, repeatable và deploy được. Phase này không dựng toàn bộ business schema trước; migration của capability thuộc chính phase triển khai capability đó.

## 2. Implementation slices

- Supabase MCP làm kênh hỗ trợ inspect/verify/apply migration có kiểm soát; TypeORM migration trong Git vẫn là source of truth.
- TypeORM DataSource, validated config và migration workflow.
- PostgreSQL/Redis local composition và disposable test database.
- Minimal CI, production image/health endpoint và provider-portable `portfolio-production` deployment skeleton.
- Repository/transaction convention đủ dùng, không generic repository framework.

## 3. Task checklist

- [x] `P1-00` — Kết nối Supabase MCP cho workflow hỗ trợ database migration; capability MCP đã khả dụng. Trước mọi DDL remote vẫn phải xác nhận đúng project/environment target và dùng migration có version thay vì SQL ad hoc.
- [x] `P1-01` — Pin TypeORM, `@nestjs/typeorm` và `pg` tương thích NestJS 11; cập nhật lockfile. (`@nestjs/typeorm` 11.0.3, TypeORM 0.3.31, `pg` 8.23.0)
- [x] `P1-02` — Thêm validated PostgreSQL config và `.env.example` chỉ chứa variable names; `POSTGRES_SYNCHRONIZE=true` bị từ chối, nên production luôn `synchronize: false`.
- [x] `P1-03` — Tạo DataSource/migration CLI tách khỏi API bootstrap; migration chạy one-shot, API không auto-migrate.
- [x] `P1-04` — Tạo initial technical migration tối thiểu và convention để mỗi capability tự thêm schema/index/constraint cần thiết. (`pgcrypto`, `citext`; không có business table.)
- [x] `P1-05` — Thêm PostgreSQL/Redis Compose với pinned image, healthcheck và disposable local/test lifecycle. (`docker-compose.postgres.yml`; Mongo compatibility Compose không thay đổi.)
- [x] `P1-06` — Tạo transaction helper/repository convention thực dụng; controller không dùng raw repository/DataSource. (`PostgresTransactionRunner`; helper chưa được wire vào Mongo runtime.)
- [x] `P1-07` — Thêm CI tối thiểu: install, focused non-mutating lint/typecheck, unit test, migration-from-empty và backend/frontend build. (GitHub Actions PostgreSQL service; migration rerun kiểm tra no-pending/drift.)
- [x] `P1-08` — Chốt Render Starter ($7/tháng) cho API/worker chung process, rồi tạo multi-stage image, `/api/health` và `render.yaml` skeleton tại Singapore. Đây là budget-constrained portfolio demo mode: Supabase/Upstash free-tier không được tuyên bố durable/always-on; không provision external resource ngoài action được duyệt.
- [x] `P1-09` — Cập nhật README/env commands đủ để developer mới chạy app và migration từ clean checkout. (Phân biệt host-run/Docker legacy runtime, PostgreSQL migration workflow, state-changing guard và Render handoff.)

## 4. Verification

- Database trống apply migration thành công; chạy lại không drift.
- Production config không bật synchronize và API start không tự chạy migration.
- Transaction rollback smoke, backend build, frontend build và CI workflow pass.
- Deployment skeleton của provider đã chọn khởi động được trên resource tạm an toàn và healthcheck phản ánh API/PostgreSQL cơ bản.

## 5. Exit và deferred

Phase pass khi foundation đủ cho một vertical slice thật. Full Frozen Data Model migration upfront, RLS, pool tuning, backup rehearsal, multi-replica migration orchestration và performance benchmark được defer.
