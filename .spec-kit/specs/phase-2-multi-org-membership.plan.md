# Plan: Phase 2 - Chuyển sang kiến trúc 1 User – N Organization (Membership)

## 1. Architectural Alignment
- Verification against `constitution.md`:
  - Nguyên tắc 1 (Multi-Tenancy Isolation): Đây là thay đổi lõi của chính nguyên tắc này — nguồn xác định `organizationId` không còn là field cố định trên `User` mà chuyển sang lấy từ header `X-Organization-Id`, được validate qua collection `Membership` trước khi set vào ALS context (`tenant-storage.service.ts`). Bước validate Membership tại `TenantInterceptor` là điểm bảo mật quan trọng nhất toàn Phase — bắt buộc throw `ForbiddenException` nếu user không có Membership hợp lệ với org trong header, tránh giả mạo header để truy cập org bất kỳ.
  - Nguyên tắc 3 (RBAC): Role không còn là field toàn cục trên `User` mà trở thành thuộc tính theo từng `Membership` (org-scoped). `RolesGuard`/`OrgAdminGuard` phải đọc `req.activeMembership.role` thay vì `user.role`.
  - Nguyên tắc 4 (No Direct State Manipulation): Khi switch workspace ở FE, bắt buộc `dispatch(apiSlice.util.resetApiState())` để xóa cache RTK Query cũ — đúng tinh thần "không hardcode optimistic bypass", tránh lẫn data giữa 2 org do cache không invalidate.
- Technical approach & Edge cases to handle:
  - Đây là thay đổi kiến trúc rủi ro cao nhất toàn plan — triển khai theo 2 bước tách biệt: (1) tạo `Membership` + migration song song mà KHÔNG xóa field cũ, review trước; (2) chỉ sau khi xác nhận migration đúng mới xóa `User.organization`/`User.team` và chuyển `TenantInterceptor` sang logic mới.
  - Chọn cơ chế header-based switching (Cách B, không nhúng orgId vào JWT) — không cần re-issue token khi switch, hỗ trợ nhiều tab với nhiều org khác nhau cùng lúc, tận dụng lại cấu trúc `TenantInterceptor` hiện có.
  - Edge case bắt buộc kiểm tra: thiếu header → 400; header trỏ org không có Membership → 403; Membership `isActive: false` → không truy cập được dù JWT còn hạn; switch qua lại nhiều lần không lẫn cache.
  - Grep toàn bộ codebase các chỗ còn đọc `user.organization`/`user.role` theo nghĩa role toàn cục, liệt kê để review thủ công trước khi sửa — không tự ý sửa hàng loạt nếu không chắc ý nghĩa từng chỗ.
  - `Team.members` giữ nguyên, không đổi — quan hệ Team vẫn nằm trong phạm vi 1 organization.

## 2. Affected Files
- `backend/src/modules/membership/schemas/membership.schema.ts`: Schema mới (user, organization, role, isActive, joinedAt) kèm compound unique index `(user, organization)`.
- `backend/src/modules/membership/membership.module.ts`, `membership.service.ts`: Module + service CRUD cơ bản, hàm `findByUserAndOrg`.
- `backend/scripts/migrate-to-membership.ts`: Script migration tạo Membership từ `User.organization` hiện có, không xóa field cũ ở bước đầu.
- `backend/src/modules/user/schemas/user.schema.ts`: Xóa field `organization` và `team` (chỉ sau khi migration được xác nhận đúng).
- `backend/src/common/interceptors/tenant.interceptor.ts`: Đổi logic lấy header `X-Organization-Id`, validate Membership, set ALS context gồm `organizationId` + `membershipRole`, gắn `req.activeMembership`.
- `backend/src/common/als/tenant-storage.ts`: Thêm field `membershipRole` vào `TenantStore` interface.
- `backend/src/common/guards/roles.guard.ts`, `org-admin.guard.ts`: Đổi từ đọc `user.role` sang `req.activeMembership.role`.
- `backend/src/common/guards/team-lead.guard.ts`: Rà soát lại, double-check không còn phụ thuộc ngầm vào `user.organization` cũ.
- `backend/src/modules/auth/auth.controller.ts`/`auth.service.ts`: Thêm endpoint `GET /auth/my-organizations`.
- `backend/src/modules/organization/organization.service.ts`: Sửa `acceptInvitation` — xóa check "STRICT B2B", thay bằng tạo Membership record mới.
- `frontend/src/components/.../WorkspaceSwitcher`: Component mới, dropdown chọn workspace.
- `frontend/src/store/workspaceSlice.js` (hoặc tương đương Redux slice): State `activeOrgId` + danh sách organizations.
- `frontend/src/services/apiSlice.js` (hoặc `axiosInstance.js`): `prepareHeaders` gắn `X-Organization-Id` vào mọi request; gọi `resetApiState()` khi switch.

## 3. Step-by-Step Task Checklist
- [x] TASK-1: Tạo `Membership` schema với compound unique index `(user, organization)`; tạo `MembershipModule`/`MembershipService` (CRUD cơ bản + `findByUserAndOrg`).
- [x] TASK-2: Viết migration script tạo Membership record từ `User.organization` hiện có cho mọi user, KHÔNG xóa field cũ ở bước này; chạy thử và review kết quả. (Đã chạy thật trong container `api` qua `docker compose exec api npm run migrate:membership`: tạo mới 1001/1001 Membership, 0 lỗi. Đã verify idempotency bằng `--dry-run` lần 2: "sẽ tạo mới: 0". Field `User.organization`/`User.team` vẫn giữ nguyên.)
- [ ] TASK-3 (chỉ sau khi migration được xác nhận đúng): Xóa field `organization`/`team` khỏi `User` schema.
- [x] TASK-4: Sửa lifecycle tenant theo đúng thứ tự NestJS: `TenantMembershipGuard` chạy sau `JwtAuthGuard` để validate header/Membership và gắn `req.activeMembership` trước RBAC guard; `TenantInterceptor` chỉ mở ALS context `{ organizationId, membershipRole }` từ Membership đã xác thực. Thiếu/sai định dạng header → `BadRequestException`; không có active Membership → `ForbiddenException`. Route discovery/accept invitation dùng `@SkipTenant()` tường minh.
- [x] TASK-5: Cập nhật `TenantStore` interface thêm `membershipRole`. (Làm cùng TASK-4 vì là phụ thuộc cứng — interceptor không compile được nếu thiếu field này.)
- [x] TASK-6: Sửa `roles.guard.ts`, hai `org-admin.guard.ts`, `org-owner.guard.ts` và `team-lead.guard.ts` đọc `req.activeMembership.role` thay vì `user.role`. `TeamLeadGuard` query Team với cả `_id` và `organization` tường minh vì guard chạy trước ALS. Task/Team controller lấy role qua `@CurrentMembership()`.
- [x] TASK-7: Đã grep và review thủ công toàn codebase. Task/Team controller và các guard không còn dùng global `user.role`; các read/write path legacy còn lại nằm ở Auth, OrganizationService, notification worker và frontend, sẽ xử lý trong Membership write/read cutover tiếp theo.
- [ ] TASK-8: Thêm endpoint `GET /auth/my-organizations` trả về danh sách Membership kèm thông tin organization và role.
- [ ] TASK-9: Sửa `acceptInvitation` trong `organization.service.ts`: xóa check STRICT B2B, tạo Membership record mới khi accept (cho phép join org thứ 2 trở lên).
- [ ] TASK-10: Xây dựng `WorkspaceSwitcher` (FE): dropdown hiển thị danh sách org từ `GET /auth/my-organizations`, highlight org active.
- [ ] TASK-11: Thêm Redux slice `workspaceSlice` lưu `activeOrgId`; sau login, nếu >1 org hiển thị màn hình chọn workspace, nếu 1 org tự động chọn.
- [ ] TASK-12: Sửa RTK Query base query: `prepareHeaders` gắn `X-Organization-Id` từ `workspaceSlice.activeOrgId` vào mọi request.
- [ ] TASK-13: Khi switch workspace: dispatch đổi `activeOrgId` đồng thời gọi `apiSlice.util.resetApiState()` để xóa cache cũ.
- [ ] TASK-14: Kiểm tra bảo mật bắt buộc: header trỏ org không phải Membership → 403; thiếu header → 400 (không fallback org mặc định); Membership `isActive: false` → không truy cập được; switch qua lại nhiều lần không lẫn cache.

### Trạng thái triển khai lifecycle — 2026-08-10

- [x] Thêm `TenantMembershipGuard` và wiring `JwtAuthGuard → TenantMembershipGuard → route RBAC guard → TenantInterceptor` cho Task, Team và các route quản trị Organization.
- [x] Bỏ `@SkipTenant()` ở cấp `OrganizationController`; chỉ giữ skip tại các route discovery và accept invitation chưa thể yêu cầu active Membership.
- [x] Interceptor fail-closed nếu authenticated tenant route không đi qua tenant guard.
- [x] Thêm unit test cho header thiếu/sai định dạng, Membership không hợp lệ, attachment của active Membership, ALS context và RBAC dùng Membership role.
- [x] `npm run build` pass; `npm run test -- --runInBand` pass 11/11 test.
- [ ] E2E với MongoDB/Redis thật cho cross-tenant data isolation và Membership inactive vẫn thuộc TASK-14/Phase 5.
