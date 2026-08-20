# Plan: Phase 1 - Vá lỗ hổng nghiệp vụ Backend

## 1. Architectural Alignment
- Verification against `constitution.md`:
  - Nguyên tắc 2 (Atomic Mutations): `approveTask`/`rejectTask` hiện dùng pattern `findById → mutate → save`, vi phạm yêu cầu atomic cho state transition. Chuyển sang `findOneAndUpdate` với filter kèm trạng thái hiện tại là đúng chuẩn.
  - Nguyên tắc 3 (RBAC): **Không** bổ sung self-approval check ở phiên bản này — quyết định có chủ đích: Team Lead được phép approve/reject task ngay cả khi họ là `createdBy` hoặc `assignedTo` của chính task đó. Lý do: team quy mô nhỏ (agency/SME) thường chỉ có 1 Team Lead; áp segregation-of-duties sẽ khiến task bị kẹt vĩnh viễn ở `PENDING_APPROVAL` khi không còn ai khác đủ điều kiện duyệt, trừ khi xây thêm cơ chế escalation lên Org Admin/Owner — không cần thiết ở quy mô hiện tại.
  - **Ràng buộc quan trọng của phiên bản này:** KHÔNG động vào `User.organization` hoặc `User.team` ở Phase này — 2 field đó sẽ được xử lý triệt để ở Phase 2 khi chuyển sang mô hình `Membership` (1 user - n org). Sửa sớm ở đây sẽ phải làm lại 2 lần.
- Technical approach & Edge cases to handle:
  - Chặn bypass approval flow tại `updateStatus` dựa trên cờ `requireApproval` cấp Team; các Team cũ chưa có field này mặc định `true`.
  - Race condition: atomic update với filter trạng thái `PENDING_APPROVAL`, throw `ConflictException` rõ ràng khi thao tác thứ hai thất bại.
  - Validate `assignedTo` thuộc `team.members` chỉ cần dựa vào cấu trúc Team hiện có, không được đụng tới field `organization` trên User.

## 2. Affected Files
- `backend/src/modules/task/task.service.ts`: Sửa `updateStatus` chặn bypass; chuyển `approveTask`/`rejectTask` sang atomic `findOneAndUpdate`; validate `assignedTo` thuộc `team.members` trong hàm `create`.
- `backend/src/modules/team/schemas/team.schema.ts`: Thêm field `requireApproval: { type: Boolean, default: true }`.

## 3. Step-by-Step Task Checklist
- [x] TASK-1: Thêm field `requireApproval` vào `Team` schema với default `true`.
- [x] TASK-2: Sửa `updateStatus` trong `task.service.ts`: chặn set `COMPLETED` trực tiếp khi team có `requireApproval = true`, bắt buộc đi qua `submitForApproval → approveTask`.
- [x] TASK-3: Chuyển `approveTask`/`rejectTask` sang atomic `findOneAndUpdate` với filter `{ _id: taskId, status: PENDING_APPROVAL }`; throw `ConflictException` nếu kết quả null. Thêm comment rõ trong code giải thích lý do không chặn self-approval (đã nêu ở mục 1) để tránh bị hiểu nhầm là thiếu sót khi review sau này.
- [x] TASK-4: Thêm validate trong hàm `create`: `assignedTo` phải nằm trong `team.members` của team chứa task.
- [x] TASK-5: Xác nhận KHÔNG có thay đổi nào chạm tới `User.organization`/`User.team` trong Phase này; tổng hợp diff summary.