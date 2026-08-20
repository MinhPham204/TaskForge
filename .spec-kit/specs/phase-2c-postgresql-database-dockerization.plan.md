# Plan: Phase 2C — Hoàn thiện PostgreSQL Database và Dockerization

> Ngày lập kế hoạch: 2026-08-11  
> Trạng thái: Chưa triển khai  
> Nền thiết kế: [`DATABASE_SCHEMA.md`](../../DATABASE_SCHEMA.md) của FlowPilot  
> Mục tiêu tích hợp: TaskForge NestJS hiện tại

## 1. Mục tiêu

Xây dựng PostgreSQL thành persistence layer chính của TaskForge, dùng thiết kế FlowPilot làm nền nhưng sửa hoàn chỉnh cho mô hình:

```text
Global User Identity
        │
        ├── Membership ── Organization
        │       └── organization-scoped role
        │
        ├── TeamMember ── Team
        └── TaskAssignee ── Task
```

Kết quả cuối phase:

- PostgreSQL thay MongoDB làm primary database.
- `Membership` là nguồn duy nhất xác định user thuộc organization nào và có role gì.
- Prisma là database adapter của NestJS; application layer không phụ thuộc trực tiếp Prisma.
- Database có foreign key, unique/check constraint và composite tenant constraint chống liên kết chéo organization.
- Docker Compose dựng được PostgreSQL, Redis, migration job và API bằng một workflow lặp lại được.
- Prisma migration history là source of truth cho schema; không duy trì một bộ DDL song song dễ lệch.
- Tenant isolation dùng explicit `organizationId` trong repository; PostgreSQL RLS là defense-in-depth.
- Có seed demo multi-org, integration/E2E test, backup/restore smoke test và rollback plan.

## 2. Phạm vi và nguyên tắc kiến trúc

### 2.1. Trong phạm vi

- Thiết kế PostgreSQL schema hoàn chỉnh.
- Thêm Prisma ORM/Prisma Migrate vào NestJS.
- Dockerize PostgreSQL và migration workflow.
- Chuyển User, Organization, Membership, Auth, Team, Task và invitation persistence sang PostgreSQL.
- Chuyển dashboard/aggregation MongoDB sang SQL/Prisma query.
- Chuyển seeder và automation worker sang repository mới.
- Script migration dữ liệu MongoDB → PostgreSQL nếu cần giữ dữ liệu hiện tại.
- Loại bỏ Mongoose/MongoDB sau cutover và rollback window.

### 2.2. Ngoài phạm vi phase này

- Viết lại frontend UI ngoài các thay đổi contract bắt buộc về UUID/workspace.
- Thêm billing, payment hoặc subscription lifecycle mới.
- Event sourcing.
- Microservice hóa backend.
- Zero-downtime dual-write MongoDB/PostgreSQL, trừ khi sau này xác nhận có production traffic bắt buộc.

### 2.3. Quy tắc bắt buộc

1. `User` là global identity; không chứa `organizationId`, organization role hoặc `teamId`.
2. `Membership` là authorization source of truth.
3. Mọi repository tenant-scoped nhận `organizationId` tường minh.
4. ALS chỉ truyền context/correlation và hỗ trợ defense-in-depth; correctness không phụ thuộc duy nhất vào ALS.
5. Mọi quan hệ có thể vượt tenant phải có composite constraint hoặc validation có test.
6. Multi-row write phải chạy trong transaction.
7. Prisma migration SQL được commit; production chỉ dùng `prisma migrate deploy`.
8. Không dùng cả `/docker-entrypoint-initdb.d` và Prisma để tạo cùng một nhóm bảng. Init script chỉ tạo extension/role cần thiết.
9. Không xóa MongoDB hoặc legacy fields trước khi validation/cutover hoàn tất.

## 3. Quyết định data model

### 3.1. Enum

- `OrganizationRole`: `OWNER`, `ADMIN`, `MEMBER`.
- `TeamMemberRole`: `TEAM_LEAD`, `TEAM_MEMBER`.
- `OrganizationPlan`: `FREE`, `PRO`, `ENTERPRISE`.
- `TaskPriority`: `LOW`, `MEDIUM`, `HIGH`.
- `TaskStatus`: `PENDING`, `IN_PROGRESS`, `PENDING_APPROVAL`, `COMPLETED`.

Quyết định cho rejection workflow:

- Reject chuyển `PENDING_APPROVAL → IN_PROGRESS` và lưu `rejectionReason`.
- Không dùng trạng thái `REJECTED` nếu không có transition/use case riêng.
- Enum database dùng tên ổn định; API mapper có thể tiếp tục trả label hiện tại (`In Progress`, `Pending Approval`, ...).

### 3.2. Các bảng chính

#### `users`

- `id UUID PK`.
- `email CITEXT UNIQUE NOT NULL`.
- `name`, `password_hash`, `profile_image_url`.
- `is_active`, `refresh_token_hash`.
- `created_at`, `updated_at`.
- Không có `role`, `organization_id`, `team_id`.

#### `organizations`

- `id UUID PK`.
- `name`, `slug UNIQUE`, `logo_url`, `plan`, `is_active`.
- `created_at`, `updated_at`.
- Không dùng `owner_id` làm nguồn authorization.
- Owner được biểu diễn bằng active Membership role `OWNER`.

#### `memberships`

- `id UUID PK`.
- `user_id`, `organization_id`.
- `role`, `is_active`, `joined_at`.
- `created_at`, `updated_at`.
- Unique `(user_id, organization_id)`.
- Partial unique index: tối đa một active `OWNER` cho mỗi organization.
- Index `(user_id, is_active)` cho workspace discovery/tenant guard.
- Index `(organization_id, is_active, role)` cho member listing/RBAC/notification.

#### `teams`

- `id`, `organization_id`, `name`, `description`, `logo_url`.
- `require_approval BOOLEAN NOT NULL DEFAULT TRUE`.
- Unique `(organization_id, name)`.
- Unique `(id, organization_id)` để làm đích composite FK.
- `created_at`, `updated_at`.

#### `team_members`

- `organization_id`, `team_id`, `user_id`, `role`, `joined_at`.
- PK `(team_id, user_id)`.
- Composite FK `(team_id, organization_id) → teams(id, organization_id)`.
- Composite FK `(user_id, organization_id) → memberships(user_id, organization_id)`.

#### `organization_invitations`

- `id`, `organization_id`, `email`, `role`.
- `token_hash`, `expires_at`, `status`, `invited_by`.
- `created_at`, `accepted_at`, `revoked_at`.
- Unique pending invitation theo `(organization_id, email)` bằng partial unique index.

#### `team_invitations`

- `id`, `organization_id`, `team_id`, `email`, `role`.
- `token_hash`, `expires_at`, `status`, `invited_by`.
- Composite FK bảo đảm Team thuộc đúng organization.
- Unique pending invitation theo `(team_id, email)`.

#### `tasks`

- `id`, `organization_id`, `team_id`.
- `title`, `description`, `priority`, `status`, `due_date`, `progress`.
- `created_by`, `approved_by`, `rejection_reason`.
- Check `progress BETWEEN 0 AND 100`.
- Composite FK `(team_id, organization_id) → teams(id, organization_id)`.
- Composite FK actor → Membership để creator/approver thuộc organization.
- Index `(organization_id, team_id, created_at DESC)`.
- Index `(organization_id, status, due_date)`.

#### `task_assignees`

- `organization_id`, `task_id`, `user_id`, `assigned_at`.
- PK `(task_id, user_id)`.
- Composite FK tới Task và Membership cùng organization.
- Index `(organization_id, user_id, task_id)`.
- Rule “assignee phải thuộc Team” tiếp tục kiểm tra trong application service và integration test; cân nhắc trigger chỉ khi thật sự cần DB-enforced invariant này.

#### `task_todo_items`

- `id`, `organization_id`, `task_id`, `text`, `completed`, `position`.
- Composite FK tới Task cùng organization.
- Index `(organization_id, task_id, position)`.

#### `task_attachments`

- `id`, `organization_id`, `task_id`, `url`, `uploaded_at`.
- Composite FK tới Task cùng organization.

### 3.3. Bảng vận hành khuyến nghị

#### `outbox_events`

Dùng cho các mutation cần ghi DB và phát job BullMQ đáng tin cậy, ví dụ submit task for approval:

- `id`, `organization_id`, `aggregate_type`, `aggregate_id`.
- `event_type`, `payload JSONB`.
- `status`, `attempt_count`, `available_at`, `processed_at`.
- `created_at`.

Nếu chưa triển khai outbox ngay, producer phải có idempotency key và retry policy; ghi rõ đây là technical debt.

## 4. Tenant isolation và RLS

### 4.1. Lớp application

Repository contract bắt buộc có tenant:

```ts
taskRepository.findById(organizationId, taskId)
taskRepository.updateStatus(
  organizationId,
  taskId,
  expectedStatus,
  nextStatus,
)
```

- Không tạo repository method tenant-scoped chỉ nhận `id`.
- `TenantMembershipGuard` tiếp tục validate `X-Organization-Id`.
- Guard phụ thuộc `MembershipRepository` port, không phụ thuộc Prisma trực tiếp.
- `CurrentPrincipal` chứa `userId`, `organizationId`, `membershipId`, `membershipRole`.

### 4.2. Lớp PostgreSQL RLS

Áp dụng RLS sau khi explicit repository filters và integration tests đã ổn định:

- Bật `ENABLE ROW LEVEL SECURITY` và `FORCE ROW LEVEL SECURITY` cho bảng tenant-scoped.
- Policy có cả `USING` và `WITH CHECK`.
- Runtime DB role không phải table owner và không có `BYPASSRLS`.
- Mỗi transaction set tenant bằng `set_config('app.current_organization_id', ..., true)`.
- Không set session tenant ngoài transaction khi dùng connection pool.
- `users`, `organizations`, `memberships` là control-plane; không áp dụng policy organization giống Task/Team vì workspace discovery phải query cross-org có kiểm soát.

RLS migration phải viết custom SQL vì Prisma schema không mô tả đầy đủ policy/partial index.

## 5. Prisma integration

### 5.1. Dependency

Thêm và pin phiên bản tương thích với Node/Nest hiện tại:

- `prisma`.
- `@prisma/client`.
- PostgreSQL driver/adapter tương ứng với Prisma version được chọn.
- `pg`, `@types/pg`.
- `tsx` cho seed/migration tooling nếu cần.

Trước khi commit dependency, chạy compatibility spike với NestJS 11, Node image hiện tại và module mode của project.

### 5.2. File structure

```text
backend/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── prisma.config.ts
└── src/
    ├── database/
    │   ├── prisma.module.ts
    │   ├── prisma.service.ts
    │   └── transaction.service.ts
    └── modules/<feature>/
        ├── domain/
        ├── application/
        └── infrastructure/prisma/
```

### 5.3. Migration workflow

- Development: `prisma migrate dev`.
- CI/production: `prisma migrate deploy`.
- Seed chạy tường minh bằng `prisma db seed`.
- Commit toàn bộ `prisma/migrations`.
- Review SQL trước khi apply, đặc biệt enum, partial index, composite FK, RLS và destructive migration.
- Không dùng `prisma db push` làm production migration workflow.

## 6. Dockerization design

### 6.1. Development Compose

Chuyển `backend/docker-compose.yml` thành các service:

```text
postgres   — PostgreSQL được pin major version
redis      — Redis cho OTP/BullMQ
migrate    — one-shot prisma migrate deploy
api        — NestJS development container
```

Quyết định:

- Pin `postgres:17-alpine`, không dùng `latest`.
- Persistent named volume `postgres_data`.
- `healthcheck` dùng `pg_isready`.
- `api` chỉ start sau khi `postgres` healthy và migration hoàn thành.
- Redis cũng có healthcheck.
- PostgreSQL port chỉ expose trong local dev; production không publish DB/Redis ra internet.
- Dùng `DATABASE_URL` cho runtime app role.
- Dùng `MIGRATION_DATABASE_URL` cho migration/owner role.
- Không hardcode password trong Compose; lấy từ `.env`/secret manager.

### 6.2. Init scripts

`docker-entrypoint-initdb.d` chỉ dùng cho:

- `CREATE EXTENSION IF NOT EXISTS citext`.
- Tạo runtime application role không phải owner nếu workflow Docker cần.
- Grant tối thiểu cần thiết.

Không tạo application tables trong init script; Prisma migration chịu trách nhiệm phần đó.

Lưu ý: init scripts chỉ chạy khi data directory còn trống. Mọi schema change về sau phải đi qua migration, không sửa init script rồi kỳ vọng volume cũ tự cập nhật.

### 6.3. Container image backend

- Development image giữ hot reload nhưng sửa port thống nhất với `PORT=8001`.
- Production image multi-stage.
- Generate Prisma Client trong build stage.
- Production startup chạy migration dưới one-shot job, không để mọi API replica tự chạy migration đồng thời.
- Image runtime chỉ chứa production dependencies, generated client, migrations và `dist`.

## 7. Thứ tự triển khai theo PR

### PR 1 — Rebaseline architecture và schema contract

- Cập nhật `.spec-kit/constitution.md` sang PostgreSQL/Prisma-neutral principles.
- Chốt enum, rejection workflow, owner semantics và invitation lifecycle.
- Viết bản `DATABASE_SCHEMA_V2.md`/ERD hoàn chỉnh có Membership.
- Lập bảng mapping Mongo field → PostgreSQL column/table.
- Chưa thay runtime database.

**Definition of Done**

- Không còn quyết định mơ hồ về `owner_id`, `User.role`, `User.organization` hoặc `User.team`.
- Mọi bảng và constraint có owner rõ ràng.
- Review schema được chấp thuận trước khi tạo migration.

### PR 2 — PostgreSQL + Prisma foundation + Docker Compose

- Thêm dependency Prisma/PostgreSQL.
- Tạo `schema.prisma`, `prisma.config.ts`, `PrismaModule`.
- Tạo initial migration, custom SQL cho `citext`, partial index và composite constraints.
- Thêm PostgreSQL, healthcheck và persistent volume vào Compose.
- Thêm `migrate` one-shot service.
- Chuẩn hóa `.env.example` với `DATABASE_URL` và `MIGRATION_DATABASE_URL`.
- MongoDB vẫn còn để đối chiếu/migration.

**Definition of Done**

- `docker compose up postgres redis` healthy.
- Initial migration chạy được trên database trống.
- Chạy migration lần hai là idempotent/no pending migration.
- Prisma Client generate và Nest build thành công.

### PR 3 — User + Organization + Membership vertical slice

- Tạo domain model và repository ports.
- Implement Prisma repositories.
- Registration tạo `User + Organization + OWNER Membership` trong transaction.
- `GET /auth/my-organizations` đọc Membership.
- Chuyển `TenantMembershipGuard` sang `MembershipRepository`.
- Implement invitation accept, role update, revoke/reactivate Membership.
- JWT không còn dùng global organization role để authorize.

**Definition of Done**

- Một user tham gia được hai organization với role khác nhau.
- Registration không thể tạo user/org/membership nửa chừng.
- Admin org A không có quyền admin tại org B.
- Không còn Mongoose read/write trong Auth/Organization/Membership slice.

### PR 4 — Team vertical slice

- Chuyển Team, TeamMember và TeamInvitation sang Prisma.
- Preserve `requireApproval`.
- Bảo đảm TeamMember có active Membership cùng organization.
- Chuyển TeamLead authorization và team member lifecycle.

**Definition of Done**

- Không thể thêm user ngoài organization vào Team.
- Team query luôn có organization scope tường minh.
- Team invitation token/expiry/status hoạt động đúng.

### PR 5 — Task vertical slice

- Chuyển Task, assignee, todo, attachment sang Prisma.
- Chuyển approval state machine sang conditional update/transaction.
- Chuyển dashboard/report Mongo aggregation sang SQL/Prisma.
- Preserve invariant assignee thuộc Team.
- Chuẩn hóa output model để frontend không phụ thuộc Prisma record.

**Definition of Done**

- Approval/reject atomic; request cạnh tranh chỉ một request thành công.
- Không bypass `requireApproval`.
- Không thể đọc/update/delete Task khác organization.
- Dashboard trả kết quả tương đương MongoDB version đã xác nhận.

### PR 6 — Automation, outbox và seeder

- Worker/producer nhận `organizationId` tường minh.
- Notification recipient query Membership đúng organization.
- Implement outbox hoặc idempotency contract đã chốt.
- Tạo seed demo: hai organization, một user có role khác nhau ở hai org, đủ Team/Task status.

**Definition of Done**

- Không có notification cross-tenant.
- Seed chạy lặp lại được hoặc fail rõ ràng khi data đã tồn tại.
- Worker không phụ thuộc HTTP ALS context.

### PR 7 — Data migration và validation

Nếu cần giữ MongoDB data:

- Viết ETL idempotent MongoDB → PostgreSQL.
- Dùng bảng/file mapping ObjectId → UUID hoặc temporary `legacy_mongo_id` unique column.
- Import theo thứ tự User → Organization → Membership → Team → TeamMember → Invitation → Task → child tables.
- Có `--dry-run`, batch size, checkpoint và error report.
- So sánh count/checksum/aggregate theo organization.

Nếu data chỉ là development/demo:

- Bỏ ETL production-grade.
- Reset bằng seed PostgreSQL mới sau khi xác nhận với chủ dự án.

**Definition of Done**

- Không có orphan FK.
- Membership count và role khớp nguồn.
- Team/Task aggregate theo organization khớp.
- Có báo cáo migration lưu trong repo hoặc artifact CI.

### PR 8 — RLS defense-in-depth

- Tạo runtime DB role không phải owner.
- Thêm RLS migration/policy cho bảng tenant-scoped.
- Thêm transaction wrapper set tenant context.
- Test `USING`, `WITH CHECK`, thiếu tenant context và connection-pool reuse.

**Definition of Done**

- Thiếu tenant context không thấy và không ghi được tenant data.
- Giả mạo organization không có Membership bị chặn ở application guard.
- Nếu repository quên filter, RLS vẫn chặn cross-tenant access.
- Runtime role không có `BYPASSRLS` và không sở hữu table.

### PR 9 — Cutover và MongoDB removal

- Freeze write hoặc dùng maintenance window.
- Chạy final ETL/validation.
- Chuyển runtime sang PostgreSQL.
- Smoke test Auth, workspace switching, Team, Task, approval và worker.
- Giữ MongoDB read-only trong rollback window.
- Sau khi hết rollback window: gỡ `@nestjs/mongoose`, `mongoose`, schema/plugin/module và Mongo service khỏi Compose.
- Cập nhật README/architecture/deployment docs.

**Definition of Done**

- Không còn runtime import Mongoose.
- Không còn `MONGO_URI` trong runtime config.
- Build, lint, unit, integration và E2E đều xanh.
- Backup/restore PostgreSQL đã được smoke test.

## 8. Test strategy

### Unit test

- Domain policy và state machine không cần database.
- Guard test mock repository port, không mock Prisma API trực tiếp.
- Test mapping Prisma record → domain/output model.

### Integration test

- Chạy PostgreSQL container thật.
- Apply migration từ database trống.
- Test unique/check/composite FK.
- Test transaction rollback.
- Test repository tenant scope.
- Test RLS bằng runtime application role.

### E2E test

- User có Membership tại org A và B.
- Header A chỉ thấy data A; header B chỉ thấy data B.
- Header org C không có Membership → 403.
- Membership inactive → 403.
- Admin tại A, Member tại B → quyền khác nhau đúng.
- Team/task ID của tenant khác → 404/403 theo API contract, không rò rỉ metadata.
- Switch workspace không lẫn cache.

### Docker verification

- Khởi tạo từ volume trống.
- Restart giữ nguyên dữ liệu.
- Migration job failure khiến API không start.
- Migration deploy chạy lại không phá data.
- Backup bằng `pg_dump`, restore vào database/container mới và chạy smoke test.

## 9. Checklist thực thi

- [ ] TASK-1: Cập nhật constitution và chốt schema decisions.
- [ ] TASK-2: Viết `DATABASE_SCHEMA_V2.md` + ERD + mapping legacy.
- [ ] TASK-3: Thêm Prisma/PostgreSQL dependencies và compatibility spike.
- [ ] TASK-4: Tạo Prisma schema + initial migration SQL.
- [ ] TASK-5: Dockerize PostgreSQL với healthcheck, volume và init extension/roles.
- [ ] TASK-6: Thêm migration service và chuẩn hóa environment variables.
- [ ] TASK-7: Implement User/Organization/Membership repositories và use cases.
- [ ] TASK-8: Chuyển TenantMembershipGuard sang repository port.
- [ ] TASK-9: Implement Team relational slice.
- [ ] TASK-10: Implement Task relational slice và SQL reports.
- [ ] TASK-11: Chuyển worker/seeder; implement outbox hoặc idempotency.
- [ ] TASK-12: Viết integration/E2E tenant security tests.
- [ ] TASK-13: Viết ETL MongoDB → PostgreSQL hoặc xác nhận reset data.
- [ ] TASK-14: Thêm RLS/runtime DB role và RLS tests.
- [ ] TASK-15: Chạy cutover, rollback drill và backup/restore smoke test.
- [ ] TASK-16: Gỡ MongoDB/Mongoose sau rollback window.
- [ ] TASK-17: Cập nhật CI, README, ARCHITECTURE và deploy docs.

## 10. Rủi ro và biện pháp giảm thiểu

| Rủi ro | Biện pháp |
|---|---|
| Port nguyên mô hình one-user-one-org từ FlowPilot | Khóa schema V2 và Membership trước migration đầu tiên |
| Prisma schema không biểu diễn đủ RLS/partial index | Commit custom SQL trong Prisma migration và integration test |
| Task liên kết Team khác tenant | Composite FK `(team_id, organization_id)` |
| User/assignee không thuộc organization | Composite FK tới Membership + service policy |
| ALS hoặc connection pool làm lẫn tenant | Explicit repository filter; RLS dùng transaction-local setting |
| API và migration cùng chạy gây race | One-shot migration job trước API |
| Init script không chạy trên volume cũ | Mọi thay đổi schema qua Prisma migration |
| Mất dữ liệu khi cutover | Dry-run, validation report, backup và Mongo read-only rollback window |
| Viết lại quá nhiều một lần | Chuyển theo vertical slice, giữ API contract ổn định |

## 11. Ước lượng

Với một backend developer:

- Schema V2 + Prisma/Docker foundation: 4–6 ngày.
- User/Organization/Membership: 4–6 ngày.
- Team: 3–4 ngày.
- Task/reporting: 5–8 ngày.
- Worker/seed/test/RLS: 4–7 ngày.
- ETL/cutover/docs: 3–6 ngày tùy yêu cầu giữ dữ liệu.

Tổng dự kiến:

- Không cần giữ data production: khoảng 3–4 tuần.
- Có ETL, RLS, rollback và cutover đầy đủ: khoảng 5–7 tuần.

## 12. Definition of Done toàn phase

- [ ] PostgreSQL schema V2 phản ánh đúng multi-organization.
- [ ] Membership là nguồn duy nhất của org role.
- [ ] User không còn `organization`, `role`, `team` legacy.
- [ ] Team có `requireApproval`.
- [ ] Composite tenant constraints ngăn quan hệ chéo organization.
- [ ] Docker Compose dựng môi trường từ máy sạch bằng quy trình được ghi lại.
- [ ] Prisma migrations chạy được trên database trống và production-style deploy.
- [ ] Tenant security E2E xanh.
- [ ] RLS test xanh bằng runtime non-owner role.
- [ ] Seed demo multi-org hoạt động.
- [ ] Mongo data đã migrate/validate hoặc có quyết định reset được ghi nhận.
- [ ] MongoDB/Mongoose được gỡ sau rollback window.
- [ ] Backup/restore và rollback drill thành công.
- [ ] CI, README và architecture docs phản ánh đúng code thực tế.

## 13. Tài liệu tham khảo chính thức

- [Prisma ORM với NestJS](https://docs.prisma.io/docs/guides/frameworks/nestjs)
- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate/getting-started)
- [Deploy database migrations](https://docs.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)
- [Prisma seeding workflow](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding)
- [Docker Official PostgreSQL Image](https://hub.docker.com/_/postgres)
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
