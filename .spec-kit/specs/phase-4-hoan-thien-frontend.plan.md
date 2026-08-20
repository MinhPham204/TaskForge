# Plan: Phase 4 - Hoàn thiện Frontend còn thiếu (bao gồm Workspace Switcher UI)

## 1. Architectural Alignment
- Verification against `constitution.md`:
  - Nguyên tắc 4 (No Direct State Manipulation): Mọi UI mới dùng RTK Query mutation/query với `providesTags`/`invalidatesTags` đúng pattern hiện có; switch workspace phải kèm `resetApiState()`, không tự chế cơ chế cache thủ công.
  - Nguyên tắc 1 & 3 (Multi-Tenancy Isolation, RBAC): 3 dashboard riêng biệt và mọi kiểm tra quyền trên UI phải lấy role từ Membership của org đang active, không phải field cố định trên user — kiểm tra kỹ component đang lấy role từ đâu để tránh lẫn quyền giữa 2 org.
- Technical approach & Edge cases to handle:
  - Workspace Switcher đã dựng khung ở Phase 2.8 — Phase này review lại UX (rõ ràng, tránh nhầm lẫn org đang active) và bổ sung màn hình "Chọn Workspace" sau login khi user thuộc nhiều org.
  - Invitation flow bổ sung trường hợp mới: accept invitation vào org thứ 2 trở lên (trước đây bị chặn).
  - Giữ đúng cấu trúc thư mục và design system hiện có, không tự ý đổi phong cách.
  - Test tay bắt buộc theo kịch bản multi-org (9 bước), đặc biệt bước switch không lẫn cache và bước giả mạo header bị chặn (403).

## 2. Affected Files
- `frontend/src/pages/...`: Màn hình "Chọn Workspace" sau login, 3 dashboard riêng biệt theo Membership role.
- `frontend/src/components/.../WorkspaceSwitcher`: Hoàn thiện UX, luôn hiển thị rõ tên org đang active.
- `frontend/src/pages/Admin/...`, `frontend/src/pages/User/...`: Progress tracking UI, todo checklist UI, reject reason display, `requireApproval` toggle, workload report UI.
- `frontend/src/services/*.js`: Mutation/query mới theo pattern `providesTags`/`invalidatesTags` hiện có; invitation flow hỗ trợ accept vào org thứ 2 trở lên.

## 3. Step-by-Step Task Checklist
- [ ] TASK-1: Xây dựng màn hình "Chọn Workspace" sau login (chỉ hiện khi user thuộc >1 organization).
- [ ] TASK-2: Review lại UX `WorkspaceSwitcher` trên header, đảm bảo luôn hiển thị rõ tên org đang active.
- [ ] TASK-3: Xây dựng UI progress tracking (`PATCH /tasks/:id/progress`) và todo checklist con của task.
- [ ] TASK-4: Xây dựng 3 dashboard riêng biệt theo role — xác nhận role lấy từ Membership của org active, không phải field cố định trên user.
- [ ] TASK-5: Xây dựng UI reject reason display và toggle `requireApproval` cho Org Admin theo từng team.
- [ ] TASK-6: Xây dựng UI workload report cho Org Admin; hoàn thiện invitation flow đầy đủ, bao gồm accept invitation vào org thứ 2 trở lên.
- [ ] TASK-7: Thực hiện test tay kịch bản 9 bước multi-org (đăng ký → chọn workspace → mời 1 thành viên vào 2 org khác nhau → switch qua lại xác nhận không lẫn cache → giả mạo header bị 403 → luồng approval không đổi hành vi).
