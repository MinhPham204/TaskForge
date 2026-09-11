# TaskForge Canonical Delivery Plans

> **Revision:** PostgreSQL-first portfolio delivery — 2026-09-04.
> **Product goal:** Hoàn thiện website end-to-end theo Business Scope v0.3, deploy được và thể hiện tốt năng lực Fresher Backend/Fullstack.
> **Technical goal:** PostgreSQL/TypeORM là target runtime duy nhất; giữ tenant correctness nhưng không để production hardening nâng cao chặn feature completeness.

## Delivery principles

1. Mỗi capability phase đi xuyên backend migration/repository/service/API, frontend consumer, focused tests và deploy smoke.
2. Frontend không bị dồn về cuối roadmap; UI được hoàn thiện cùng owning business slice.
3. PostgreSQL schema phát triển bằng migration theo capability, không dựng toàn bộ schema rồi chờ nhiều phase mới có sản phẩm.
4. Không dual-write hoặc duy trì Mongo/PostgreSQL lâu dài. Phase 2 là cutover sớm sang PostgreSQL-only sau decision gate.
5. Test theo rủi ro ngay trong task sở hữu capability: migration/constraint/repository/transaction phải được kiểm chứng trên PostgreSQL test thật; tenant isolation, authorization và state transition trọng yếu bắt buộc. Task cuối phase chỉ tổng hợp regression/E2E, không phải lần đầu capability chạm database.
6. CI/deploy bắt đầu ở Phase 1 và được mở rộng dần; Phase 7 là release gate, không phải lần đầu dự án được deploy.
7. OpenFGA, RLS, full Outbox, advanced DLQ/alerting, zero-downtime ETL, malware pipeline, backup rehearsal và performance tuning không chặn portfolio v1.

## Canonical order

| Order | Plan | Demo outcome | Depends on |
|---:|---|---|---|
| 0 | [`00-delivery-reset.plan.md`](./00-delivery-reset.plan.md) | Delivery/data/deploy decisions rõ ràng | Current worktree + accepted baselines |
| 1 | [`01-postgresql-foundation.plan.md`](./01-postgresql-foundation.plan.md) | PostgreSQL/CI/deploy skeleton chạy được | Phase 0 |
| 2 | [`02-tenant-onboarding-cutover.plan.md`](./02-tenant-onboarding-cutover.plan.md) | Signup, workspace, invitation và switch chạy PostgreSQL end-to-end | Phase 1 |
| 3 | [`03-team-project.plan.md`](./03-team-project.plan.md) | Team/Project/Participants/status/modules dùng được trên website | Phase 2 |
| 4 | [`04-task-workflow.plan.md`](./04-task-workflow.plan.md) | Core portfolio demo: Board/List/Task/Checklist/Comment/Approval/Dashboard | Phase 3 |
| 5 | [`05-collaboration-files.plan.md`](./05-collaboration-files.plan.md) | Activity/Audit/Notification/Attachment/Files | Phase 4 |
| 6 | [`06-optional-modules.plan.md`](./06-optional-modules.plan.md) | Milestones/Documents/Risks hoàn thiện breadth v1 | Phase 5 |
| 7 | [`07-product-release.plan.md`](./07-product-release.plan.md) | Website production-ready cho portfolio, demo URL và docs | Phase 6 |

## Definition of feature-complete portfolio v1

- Auth và global User identity.
- Multi-Organization Membership, invitation, create/switch workspace và Organization roles.
- Team/TeamMember không Team role.
- Project lifecycle, Participating Teams, Project Members và Project roles.
- Project-configured statuses/module settings và Overview.
- Task Board/List, assignment, checklist, progress, comment, attachment và optional one-approver flow.
- My Tasks, approval queue, search/filter, dashboard/report cơ bản.
- Activity, critical Audit Log, in-app/email Notification.
- Milestones, Documents, Project Files và Risks ở mức usable CRUD/lifecycle đã chốt.
- PostgreSQL migrations, focused tenant/security tests, CI, Docker/deploy, demo seed và README.

## Execution rules

- Chỉ đánh dấu task complete khi source/test/UI hoặc deployment evidence tương ứng tồn tại.
- Không chạy reset/seed/migration stateful trước khi exact database target được xác nhận disposable hoặc approved.
- Từ `P2-09`, local PostgreSQL test runtime là checkpoint mặc định. Nó dùng database riêng có guard rõ ràng, apply migration từ empty và không phụ thuộc `AppModule` production trong thời gian cutover.
- Từ Phase 3, mỗi backend capability task phải gồm DTO/controller wiring cần thiết để capability mới chạy được trên served PostgreSQL runtime và có thể smoke qua local API/Swagger; không dồn runtime wiring về task cuối phase.
- Task thêm migration/entity/index/FK phải có migration-from-empty hoặc constraint integration test; task thêm repository/query/transaction phải có PostgreSQL integration test gồm failure/tenant-negative case phù hợp.
- Task thêm controller/guard phải có validation/HTTP contract test. Task thêm frontend consumer phải verify đúng API shape; nếu capability đã runnable thì smoke qua local API/Swagger trước khi complete.
- Test fixture nhỏ và deterministic thuộc capability test. Portfolio demo seed là artifact riêng của Phase 7 và không được dùng làm prerequisite cho integration test.
- Khi một phase đổi shared API contract, backend và frontend consumer phải được verify trong cùng phase.
- Không tạo plan/report mới trùng vai trò bộ file này; current execution state nằm trong `.ai/` context và Git.
- Nếu requirement mới không giúp trực tiếp một portfolio acceptance flow, ghi vào post-portfolio backlog thay vì chen vào phase hiện tại.

## Per-task verification contract

| Thay đổi | Evidence tối thiểu trước khi complete |
|---|---|
| Migration/entity/index/FK | Apply migration từ database trống và kiểm tra constraint trên PostgreSQL test |
| Repository/query hoặc backend capability | Integration test với dữ liệu thật, explicit tenant scope và negative case trọng yếu; DTO/controller được wire nếu capability có HTTP contract |
| Transaction/service | Success path và rollback/failure path trên PostgreSQL test |
| Guard/policy/controller | Unit test cộng HTTP integration/validation contract |
| Frontend consumer | Contract/component test với response shape thật; critical flow dùng local API khi capability runnable |
| Task cuối phase | Cross-capability regression, critical E2E và deploy smoke; không thay thế test của task trước |

`P2-09` sở hữu việc hiện thực hóa command/lifecycle cross-platform cho test runtime, dự kiến gồm DB up, migration, integration/E2E và teardown. Tên script cuối cùng phải khớp manifest thật; plan không coi command dự kiến là đã tồn tại trước khi task đó hoàn thành.

## Current status

- Phase 0: **Complete**; delivery/data/demo/deployment constraints đã chốt và safe baseline verification pass ngày 2026-09-01.
- Phase 1: **Complete**; `P1-00` through `P1-09` complete.
- Phase 2: **In progress**; `P2-01` through `P2-08` complete, next `P2-09` local PostgreSQL verification checkpoint.
- Phase 3–7: **Not started / dependency-gated**.
- Work `G0-01`–`G0-03` cũ được giữ làm evidence/reference; các Mongo-only follow-up cũ không còn canonical blockers.
