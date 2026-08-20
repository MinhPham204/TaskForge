# TaskForge repository guidance

## Mục tiêu và nguồn sự thật

TaskForge là ứng dụng quản lý organization, team và task theo hướng SaaS multi-tenant. Backend là ưu tiên hiện tại. Runtime đang dùng NestJS 11, MongoDB/Mongoose, Redis và BullMQ; PostgreSQL/Prisma mới là kiến trúc mục tiêu, chưa phải trạng thái đã triển khai.

Khi thông tin không đồng nhất, dùng thứ tự sau:

1. Yêu cầu hiện tại của user và source/config/test trong worktree.
2. `AGENTS.md` gần phạm vi đang sửa.
3. `.spec-kit/` cho requirement, phase và quyết định mục tiêu còn phù hợp với source.
4. README và các tài liệu review có ngày tháng chỉ để tham khảo.

Không tự sửa source hoặc specification chỉ để làm chúng khớp nhau. Ghi nhận khác biệt trong báo cáo và đánh dấu `TBD` nếu source chưa đủ để kết luận.

## Bản đồ đọc theo loại task

Luôn chạy `git status --short` trước khi sửa và bảo toàn mọi thay đổi đang có. Với backend task, đọc [`backend/AGENTS.md`](backend/AGENTS.md) trước khi chỉnh file dưới `backend/`.

| Task | Đọc trước |
|---|---|
| Phạm vi nghiệp vụ, business rule hoặc thiết kế feature mới | `docs/BUSINESS_SCOPE.md`, rồi specification và source của domain liên quan |
| Tenant, RBAC, Membership, workspace | `.spec-kit/constitution.md`, `.spec-kit/specs/phase-2-multi-org-membership.plan.md`, rồi các file được chỉ trong `backend/AGENTS.md` |
| PostgreSQL/Prisma/Docker migration | `.spec-kit/specs/phase-2c-postgresql-database-dockerization.plan.md`, `POSTGRESQL_MIGRATION_ASSESSMENT.md`, rồi source persistence hiện tại |
| Task approval/state transition | `.spec-kit/specs/phase-1-va-loi-backend.plan.md`, `backend/src/modules/task/task.service.ts`, `backend/src/modules/task/schemas/task.schema.ts`, `backend/src/modules/team/schemas/team.schema.ts` |
| Audit API hoặc thay đổi contract FE/BE | `.spec-kit/specs/phase-3-audit-sync-route.plan.md`, backend controllers, `frontend/src/utils/apiPaths.js`, `frontend/src/utils/axiosInstance.js`, `frontend/src/services/` |
| Backend tests | `.spec-kit/specs/phase-5-unit-test.plan.md`, test gần code và cấu hình Jest trong `backend/package.json`/`backend/test/jest-e2e.json` |
| Background jobs | `backend/src/modules/automation/`, producer gọi queue và service/email liên quan |
| Frontend | `.spec-kit/specs/phase-3-audit-sync-route.plan.md` và `.spec-kit/specs/phase-4-hoan-thien-frontend.plan.md`; chưa có guidance frontend chuyên biệt |
| CI/deploy | `.spec-kit/specs/phase-7-ci-docs.plan.md` hoặc `.spec-kit/specs/phase-8-deploy.plan.md`, sau đó kiểm tra manifests/Docker/env example thật |

`docs/BUSINESS_SCOPE.md` mô tả phạm vi và hành vi sản phẩm mục tiêu; source mô tả phần đang chạy, còn `.spec-kit/` quản lý roadmap/phase triển khai. `TASKFORGE_UPGRADE_PLAN.md` là roadmap cũ; `TASKFORGE_UPGRADE_PLAN (1).md` cũng đã được phân rã và cập nhật chọn lọc vào `.spec-kit/`. Không dùng hai file này để ghi đè trạng thái/checklist trong `.spec-kit/`. `DATABASE_SCHEMA.md` mô tả thiết kế PostgreSQL one-user-one-org cũ; với migration mới, phase 2C là tài liệu định hướng gần hơn nhưng vẫn phải được kiểm chứng bằng source.

## Trạng thái refactor cần hiểu đúng

Snapshot được kiểm chứng từ worktree ngày 2026-08-15:

- Phase 1 đã hiện diện trong source: `requireApproval`, chặn bypass completion, assignee check khi create và approve/reject atomic.
- Phase 2 mới hoàn thành một phần: Membership schema/service/migration và tenant guard/interceptor/RBAC theo active Membership đã có; registration, organization lifecycle, notification, directory/assignee paths và frontend workspace flow vẫn còn legacy.
- Phase 2C PostgreSQL chưa triển khai: chưa có Prisma dependency/schema/migration, PostgreSQL service hay repository adapter.
- Bước đang làm hợp lý là hoàn tất Membership cutover + security gate trước khi bắt đầu PostgreSQL hoặc Phase 3/4.

Không mô tả feature là hoàn tất chỉ dựa trên checkbox hoặc tài liệu; phải có source/test chứng minh.

## Quy tắc làm việc toàn repository

- Giữ scope theo yêu cầu. Không tự mở rộng thành rewrite, đổi cây thư mục toàn repo, thêm feature hay dependency.
- Không chạy seed, migration ghi dữ liệu, benchmark cleanup, replica-set init hoặc command database stateful nếu user chưa yêu cầu rõ và chưa xác nhận target an toàn.
- Không đọc, in hoặc ghi lại nội dung `.env`; chỉ dùng tên biến trong `.env.example`.
- Không commit/push nếu user không yêu cầu.
- Không dùng `npm run lint`, `npm run format` hoặc tool có `--fix` trên dirty worktree chỉ để kiểm tra; xem hướng dẫn backend cho lệnh check không ghi file.
- Khi thay đổi contract dùng chung, kiểm tra cả consumer frontend tối thiểu cần thiết, nhưng không refactor frontend ngoài scope.
- Không tạo roadmap/current-status mới trùng vai trò `.spec-kit/`; cập nhật guidance chỉ khi source hoặc phase thực tế thay đổi.
