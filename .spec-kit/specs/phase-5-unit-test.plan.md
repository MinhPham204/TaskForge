# Plan: Phase 5 - Unit Test cho phần nhạy cảm (bao gồm Membership & switch-org security)

## 1. Architectural Alignment
- Verification against `constitution.md`:
  - Nguyên tắc 3 (RBAC): Test `ensureTaskMutationAccess` phải dùng role lấy từ Membership của org active, không còn `user.role` cũ; xác nhận Org Admin/Owner không bypass quyền sửa/duyệt task theo đúng thiết kế cố ý.
  - Nguyên tắc 2 (Atomic Mutations): Test approve/reject xác nhận thao tác thứ hai fail với `ConflictException`.
  - Nguyên tắc 1 (Multi-Tenancy Isolation): Đây là nhóm test quan trọng nhất của Phase — xác nhận `TenantMembershipGuard` chặn đúng trước RBAC/interceptor khi header trỏ tới org mà user không có Membership hợp lệ, và role không bị lẫn giữa 2 org của cùng 1 user.
- Technical approach & Edge cases to handle:
  - Không cần coverage 100% toàn repo, tập trung 4 nhóm rủi ro cao: authorization theo Membership, multi-tenant isolation mở rộng, approval state machine, role theo Membership.
  - Test bảo mật quan trọng nhất: request với header org mà user KHÔNG có Membership hợp lệ phải bị chặn ngay tại `TenantMembershipGuard` (403), trước RBAC guard, interceptor và Service layer.
  - Test Membership `isActive: false` — không truy cập được org đó dù record Membership tồn tại.
  - Test cùng 1 user có role khác nhau ở 2 org (vd Admin ở A, Member ở B) — xác nhận quyền hành động tương ứng đúng theo từng org, không lẫn.

## 2. Affected Files
- `backend/src/modules/task/task.service.spec.ts`: Test `ensureTaskMutationAccess` theo role từ Membership, self-approval, approve/reject atomic.
- `backend/src/common/guards/tenant-membership.guard.spec.ts`: Test validate header/Membership trước RBAC, bao gồm header thiếu/sai định dạng và Membership không hợp lệ.
- `backend/src/common/interceptors/tenant.interceptor.spec.ts`: Test interceptor mở ALS từ Membership đã được guard xác thực và fail-closed khi wiring thiếu tenant guard.
- `backend/src/common/guards/roles.guard.spec.ts`: Test RBAC dùng Membership role và bỏ qua global role legacy trên User.
- `backend/src/modules/task/task-state-machine.spec.ts`: Test transition trạng thái hợp lệ/không hợp lệ (giữ nguyên yêu cầu cũ).
- `backend/src/modules/membership/membership.spec.ts`: Test mới xác nhận role không lẫn giữa 2 org của cùng 1 user.
- `backend/jest.config.js`, `backend/package.json`: Cập nhật cấu hình/dependencies test nếu còn thiếu (`@nestjs/testing`, `mongodb-memory-server`).

## 3. Step-by-Step Task Checklist
- [ ] TASK-1: Kiểm tra và thiết lập Jest + `mongodb-memory-server` nếu chưa đủ.
- [ ] TASK-2: Viết test `ensureTaskMutationAccess` dùng role lấy từ Membership; test self-approval bị chặn; test approve/reject atomic (lần gọi thứ hai throw `ConflictException`).
- [ ] TASK-3: Viết test `tenant.interceptor.spec.ts`: user có Membership hợp lệ ở 2 org, header đúng org A chỉ thấy data org A, header đúng org B chỉ thấy data org B.
- [x] TASK-4: Viết unit test bảo mật lifecycle: header trỏ org mà user KHÔNG có active Membership → `ForbiddenException` tại `TenantMembershipGuard`, trước interceptor/Service; đồng thời test header thiếu/sai định dạng và interceptor fail-closed nếu tenant guard bị wiring thiếu.
- [ ] TASK-5: Viết test Membership `isActive: false` → bị chặn dù record Membership tồn tại.
- [ ] TASK-6: Viết test approval state machine (`PENDING → approve` trực tiếp fail, `COMPLETED → reject` fail).
- [ ] TASK-7: Viết `membership.spec.ts`: cùng 1 user có role khác nhau ở 2 org, xác nhận quyền hành động đúng theo org đang active trong từng test case.
- [ ] TASK-8: Chạy `npm run test`, báo cáo coverage đặc biệt cho `tenant.interceptor.ts` và module `membership`.

### Trạng thái test sớm từ Phase 2B — 2026-08-10

- [x] Build backend thành công.
- [x] Unit test hiện tại pass 11/11 (`npm run test -- --runInBand`).
- [ ] Chưa chạy coverage và chưa có repository/E2E test với database thật, nên TASK-8 chưa hoàn thành.
