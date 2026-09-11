# TaskForge PostgreSQL Portfolio Delivery Roadmap v0.3

> **Status:** Revised execution baseline — 2026-08-31.
> **User direction:** Giữ PostgreSQL làm database của dự án; ưu tiên website hoàn chỉnh backend + frontend + deploy cho portfolio Fresher Backend/Fullstack.
> **Business baseline:** [`TASKFORGE_BUSINESS_SCOPE_v0.3.md`](../docs/TASKFORGE_BUSINESS_SCOPE_v0.3.md).
> **Canonical plans:** [`.spec-kit/specs/README.md`](./specs/README.md).

## 1. Delivery decision

TaskForge vẫn hướng tới:

```text
NestJS 11 modular monolith
+ PostgreSQL/TypeORM migrations
+ explicit multi-tenant Membership boundary
+ React/Vite frontend
+ Redis/BullMQ có chọn lọc
+ Docker/CI/deployment
```

Roadmap cũ xây target PostgreSQL ở chế độ shadow qua nhiều phase, dồn frontend/cutover về cuối và biến operational hardening thành dependency của feature delivery. Cách đó bảo thủ cho production migration nhưng không phù hợp mục tiêu portfolio hoàn chỉnh nhanh.

Roadmap mới dùng ba nguyên tắc:

1. **Vertical slice end-to-end:** migration + backend + API + frontend + focused tests + deploy smoke trong cùng capability phase.
2. **Early PostgreSQL cutover:** sau foundation và tenant/onboarding, served runtime chuyển sang PostgreSQL-only; không long-lived Mongo/PostgreSQL coexistence.
3. **Breadth before advanced depth:** hoàn tất Business Scope usable trước, defer infrastructure chỉ cần cho tải/độ tin cậy production chưa tồn tại.

## 2. Không thay đổi

- Business hierarchy và invariants trong Business Scope v0.3.
- Organization là tenant; User là global identity; active Membership là Organization role Source of Truth.
- Team không role; Project role độc lập Organization role.
- Project có Participating Teams và Project Members riêng.
- Task thuộc Project và một owning Team; assignee phải thuộc Project và owning Team.
- Project-configured Task Status; Approval độc lập Task Status.
- PostgreSQL là persistence duy nhất của target runtime, UUID opaque IDs và TypeORM migrations với production `synchronize: false`.
- Không OpenFGA/RLS/full Outbox/microservice như correctness dependency của portfolio v1.

## 3. Thay đổi so với roadmap cũ

| Cũ | Mới |
|---|---|
| 13 plan `00–12`, khoảng 131 checklist task | 8 plan `00–07`, mỗi plan tạo demo outcome |
| Phase 1–9 target không phục vụ production | Phase 2 cutover PostgreSQL-only; phase sau mở rộng runtime thật |
| Frontend target dồn Phase 10 | Frontend đi cùng Phase 2–6 |
| CI/deploy chính ở Phase 12 | CI/deploy skeleton ở Phase 1, smoke mỗi phase, release gate Phase 7 |
| Full schema/constraint harness upfront | Migration/schema theo capability; chỉ invariant trọng yếu dùng DB constraint/transaction |
| Read model/API contract là phase riêng | Query/API/DTO thuộc owning feature, core read models nằm cùng Task phase |
| Activity/Audit/Notification/Async và Files có production-grade gates | Implement usable baseline; advanced reliability/security operations deferred |
| Mongo security follow-up là blocker dài | Giữ completed compatibility work; freeze Mongo và cutover sớm |

## 4. Phase graph

```text
Phase 0  Delivery reset + data/deploy decisions
   ↓
Phase 1  PostgreSQL foundation + minimal CI/deploy
   ↓
Phase 2  Auth/Tenant/Onboarding + PostgreSQL-only cutover
   ↓
Phase 3  Team + Project + Participants + Status/Modules
   ↓
Phase 4  Task + Approval + Board/List/Dashboard
   ↓
Phase 5  Activity/Audit/Notification + Files
   ↓
Phase 6  Milestones + Documents + Risks
   ↓
Phase 7  Product completion + production release
```

## 5. Phase outcomes

| Phase | Outcome có thể demo | Primary technical work |
|---:|---|---|
| 0 | Delivery strategy và data/deploy target rõ ràng | Freeze legacy, inventory, baseline verification |
| 1 | Clean checkout có PostgreSQL migration, CI/build và portable portfolio deploy skeleton | DataSource, Compose, migration CLI, health/image |
| 2 | Signup/create/join/switch workspace trên website | Auth, Organization, Membership, Invitation, early cutover |
| 3 | Tạo Team/Project, chọn Participants, role/status/module settings | Relational Project model + frontend screens |
| 4 | Core work-management demo hoàn chỉnh | Task/Checklist/Comment/Approval/read models/Board/List |
| 5 | Collaboration, notification và file flow | Activity/Audit/BullMQ baseline/object storage |
| 6 | Đủ bốn optional modules v1 | Milestone/Document/Risk + module gates/UI |
| 7 | Public portfolio release | CI gates, production deploy, seed, docs, critical E2E |

Detailed task/verification nằm trong [canonical plan index](./specs/README.md); roadmap không lặp lại checklist từng file.

## 6. PostgreSQL cutover policy

Phase 0 đã chốt dữ liệu Mongo hiện tại là disposable và không cần ETL. Không tự chạy reset/remove trước khi exact database/environment target của Phase 2 được xác nhận.

```text
Phase 1: PostgreSQL foundation exists, no business dual-write
Phase 2: implement dependency-closed tenant/onboarding target
         -> approved reset/migration action
         -> switch AppModule/runtime to PostgreSQL-only
         -> remove active Mongo/Mongoose runtime paths
Phase 3+: add capabilities directly on PostgreSQL runtime
```

Việc legacy Team/Task UI tạm thiếu sau Phase 2 là trạng thái development có chủ đích; không giữ cross-database business graph chỉ để duy trì demo cũ. Git giữ lịch sử source Mongo.

Không có data-preservation gate cho dữ liệu Mongo hiện tại. Nếu sau này xuất hiện một nguồn dữ liệu khác cần giữ, đó là requirement mới và cần migration plan riêng; không thêm dual-write mặc định.

## 7. Architecture depth appropriate for portfolio v1

### Bắt buộc

- Explicit `organizationId` scope và active Membership verification.
- DTO validation và không expose ORM entity.
- Foreign key/unique/check cho invariant relational rõ ràng.
- Transaction cho Create Organization, last Owner/PM-sensitive command và multi-record Task/Approval operations quan trọng.
- Conditional update hoặc transaction cho competing Approval terminal action.
- Tenant-negative integration/E2E cho detail/list/search/file/worker representative paths.
- Migration-from-empty, production `synchronize: false`, secrets ngoài repo.
- CI/build/deploy và critical user flows.

### Chỉ làm khi có requirement/evidence

- RLS/OpenFGA.
- Generic repository/policy/provider framework.
- CQRS/projection DB/Redis query cache.
- Full Outbox, operations UI cho DLQ hoặc separate scheduler cluster.
- Zero-downtime Mongo ETL/dual-write.
- Malware pipeline, retention engine và exhaustive file orphan reconciliation.
- Backup/restore rehearsal, autoscaling, load test và benchmark/tuning production-like.
- Exhaustive race/parity permutations ngoài critical invariants.

## 8. Verification strategy

Mỗi phase dùng test pyramid nhỏ theo rủi ro:

```text
domain/unit cho business rule khó
        ↓
PostgreSQL integration cho query/constraint/transaction quan trọng
        ↓
tenant/authorization negative tests
        ↓
1–3 critical API/UI E2E của phase
        ↓
deploy smoke
```

Không yêu cầu mỗi CRUD path có đủ unit + repository + policy + race + E2E nếu risk không biện minh. Phase 7 gate lại các flow quan trọng; không bù safety net cốt lõi bị bỏ ở owning phase.

## 9. Frontend alignment

- Phase 2: Auth/onboarding/workspace/invitation.
- Phase 3: Team/Project/Participants/status/module settings/Overview shell.
- Phase 4: Board/List/Task/detail/checklist/comment/approval/dashboard.
- Phase 5: Activity/notifications/files.
- Phase 6: optional modules.
- Phase 7: responsive/empty/error/loading polish và release smoke.

Frontend luôn coi ID là opaque UUID string, lấy current Organization role từ active Membership và purge/namespace tenant-bound state khi workspace thay đổi.

## 10. Portfolio release Definition of Done

- PostgreSQL-only runtime; không active Mongo/Mongoose/ObjectId path.
- Toàn bộ core và bốn optional modules trong Business Scope có API và usable UI.
- Multi-Organization/Project/Task/Approval/file isolation có negative evidence đại diện.
- Critical flows chạy từ deployed frontend tới PostgreSQL-backed API/worker.
- CI, migration job, images, health/readiness và secrets/config baseline hoạt động.
- Demo seed/account, screenshots/demo URL và README giải thích architecture/trade-offs/deferred work.
- Không feature nào được tuyên bố complete chỉ dựa trên plan checkbox.

## 11. Current execution

- Phase 0 complete ngày 2026-09-01; safe backend/frontend baseline pass.
- PostgreSQL-first/vertical-slice/early-deploy direction đã được user chốt.
- Mongo data disposition đã chốt: disposable, không ETL; chưa chạy reset/remove.
- `P0-04` inventory current flows/contracts/bootstrap blockers đã hoàn tất; các contract drift được route sang owning Phase 1–4 thay vì sửa mở rộng Mongo runtime.
- `P0-05` đã chốt sáu portfolio acceptance flows, deterministic two-tenant seed và runtime constraints cho `portfolio-production`; provider/cost được defer tới `P1-08` trước provisioning.
- `P1-01` đã pin `@nestjs/typeorm` 11.0.3, TypeORM 0.3.31 và `pg` 8.23.0; backend build/unit baseline pass.
- Next canonical task: `P1-02` thêm validated PostgreSQL config và production `synchronize: false`.
- Completed legacy work `G0-01`–`G0-03` vẫn là evidence/reference nhưng không tạo Mongo-only blocker mới.
