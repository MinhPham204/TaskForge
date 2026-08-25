# TaskForge Canonical Phase Plans v0.3

Thư mục này là execution index duy nhất cho [`REFACTOR_ROADMAP_v0.3.md`](../REFACTOR_ROADMAP_v0.3.md). Các plan cũ theo numbering 1–8 đã bị thay thế vì trộn MongoDB legacy, frontend và target PostgreSQL trong cùng phase.

## Thứ tự triển khai

| Order | Plan | Chỉ được bắt đầu khi |
|---:|---|---|
| 0 | [`00-membership-security-cutover.plan.md`](./00-membership-security-cutover.plan.md) | Roadmap Accepted |
| 1 | [`01-postgresql-foundation.plan.md`](./01-postgresql-foundation.plan.md) | Gate 0 pass |
| 2 | [`02-tenant-control-plane.plan.md`](./02-tenant-control-plane.plan.md) | Phase 1 pass |
| 3 | [`03-team-capability.plan.md`](./03-team-capability.plan.md) | Phase 2 pass |
| 4 | [`04-project-participants-status-modules.plan.md`](./04-project-participants-status-modules.plan.md) | Phase 2–3 pass |
| 5 | [`05-task-core.plan.md`](./05-task-core.plan.md) | Phase 4 pass |
| 6 | [`06-task-approval.plan.md`](./06-task-approval.plan.md) | Phase 5 pass và affected TBD đã chốt |
| 7 | [`07-read-models-api-contract.plan.md`](./07-read-models-api-contract.plan.md) | Phase 4–6 pass |
| 8 | [`08-activity-audit-notification-async.plan.md`](./08-activity-audit-notification-async.plan.md) | Phase 2–7 pass |
| 9 | [`09-files-storage.plan.md`](./09-files-storage.plan.md) | Phase 5 và 8 pass |
| 10 | [`10-frontend-cutover-mongo-removal.plan.md`](./10-frontend-cutover-mongo-removal.plan.md) | Phase 1–9 pass và data disposition đã chốt |
| 11 | [`11-optional-modules.plan.md`](./11-optional-modules.plan.md) | Phase 4–5, 8–10 pass |
| 12 | [`12-ci-deployment-operations.plan.md`](./12-ci-deployment-operations.plan.md) | Phase 11 pass |

## Cách dùng

1. Chỉ mở một plan có dependency đã pass; chạy `git status --short` và đọc `AGENTS.md` gần phạm vi source trước khi sửa.
2. Đối chiếu source/test thật trước khi đánh dấu task hoàn tất. Checkbox không phải bằng chứng runtime.
3. Mỗi implementation slice phải kèm test tương ứng; không dồn safety net sang Phase 12.
4. Phase 1–9 không được bật target API production hoặc dual-write MongoDB/PostgreSQL. Cutover một chiều chỉ ở Phase 10.
5. PostgreSQL/TypeORM và OpenFGA là hai boundary khác nhau: PostgreSQL giữ business relationship SoT; OpenFGA chỉ evaluate ReBAC. Business-state invariant luôn ở Domain Policy/Service.
6. Nếu phát hiện blocker làm đổi Business Scope, architecture hoặc Frozen Data Model, dừng phase và cập nhật đúng baseline trước; không tự sửa rule trong plan.

## Trạng thái

- Roadmap: **Accepted**, `Roadmap Blocking Decision = 0`.
- Gate 0: **Pending**.
- Phase 1–12: **Not started / dependency-gated**.
- Lịch sử plan cũ vẫn truy xuất được qua Git; không còn là implementation authority trong worktree.
