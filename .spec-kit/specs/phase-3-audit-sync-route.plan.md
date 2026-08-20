# Plan: Phase 3 - Audit & Đồng bộ route FE↔BE (có tính đến header activeOrgId)

## 1. Architectural Alignment
- Verification against `constitution.md`:
  - Nguyên tắc 1 (Multi-Tenancy Isolation): Sau Phase 2, mọi route cần tenant context bắt buộc có header `X-Organization-Id`; audit lần này phải bổ sung cột "có cần header không" cho từng endpoint, không chỉ dùng lại kết quả audit trước khi có multi-org.
  - Nguyên tắc 3 (RBAC): `UserController` mới phải tự động scope theo organization đang active dựa vào `TenantInterceptor` đã đổi ở Phase 2, không tự thêm filter organization thủ công nếu Mongoose plugin đã xử lý.
- Technical approach & Edge cases to handle:
  - Audit lại từ đầu toàn bộ route thật (`@Get/@Post/@Patch/@Put/@Delete`) trong `*.controller.ts`, đối chiếu `apiPaths.js`/`services/*.js`, bổ sung cột "cần header X-Organization-Id?".
  - Endpoint không tồn tại ở BE (`upload-image`, `report export`) — loại bỏ khỏi FE, ghi chú README "Future Improvements".
  - `BASE_URL` hardcode chuyển sang biến môi trường Vite.
  - Rà soát `axiosInstance.js`/RTK Query base query xác nhận header `X-Organization-Id` đã gắn đúng theo Phase 2.8 — nếu chưa có, bổ sung.
  - Rà lại mọi chỗ FE từng dùng ngầm `user.organization` cũ (nếu còn), vì giờ phải luôn dựa vào `activeOrgId` phía FE.

## 2. Affected Files
- `backend/src/modules/user/user.controller.ts`: Tạo mới controller `GET /users`, `GET /users/search?q=`, `GET /users/:id`, tự động scope theo org active qua `TenantInterceptor`.
- `backend/src/modules/user/user.module.ts` & `backend/src/app.module.ts`: Đăng ký `UserController`, import `UserModule`.
- `frontend/src/utils/apiPaths.js`: Sửa path dashboard, profile, team member/invitation; xóa path không tồn tại ở BE; đổi `BASE_URL` sang biến môi trường.
- `frontend/src/services/apiSlice.js`/`axiosInstance.js`: Xác nhận/bổ sung `prepareHeaders` gắn `X-Organization-Id`.
- `frontend/src/services/*.js` và component liên quan: Cập nhật lời gọi API theo path đã sửa.

## 3. Step-by-Step Task Checklist
- [ ] TASK-1: Grep toàn bộ route thật trong `backend/src/modules/*/*.controller.ts`, lập bảng đối chiếu với endpoint FE, bổ sung cột "cần header X-Organization-Id?".
- [ ] TASK-2: Viết `UserController` mới (`GET /users`, `GET /users/search?q=`, `GET /users/:id`), kiểm tra cơ chế Mongoose tenant plugin hiện có trước khi tự thêm filter organization thủ công.
- [ ] TASK-3: Sửa `apiPaths.js`: dashboard, profile, team member/invitation dùng `:id` động.
- [ ] TASK-4: Xóa `IMAGE.UPLOAD_IMAGE` và `REPORTS.EXPORT_*` khỏi `apiPaths.js`; ghi chú README "Future Improvements".
- [ ] TASK-5: Đổi `BASE_URL` sang `import.meta.env.VITE_API_URL` kèm fallback local dev.
- [ ] TASK-6: Kiểm tra `axiosInstance.js`/RTK Query base query đã gắn header `X-Organization-Id` vào mọi request cần tenant context chưa; bổ sung nếu thiếu.
- [ ] TASK-7: Grep và cập nhật component còn gọi path cũ hoặc còn dùng ngầm `user.organization` cũ.
- [ ] TASK-8: Test tay: login → chọn workspace → gọi thử vài API cần tenant context, xác nhận không lỗi 400 (thiếu header) hay 403 (sai Membership).
