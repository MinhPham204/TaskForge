# Plan: Phase 6 - Benchmark thật cho Compound Index

## 1. Architectural Alignment
- Verification against `constitution.md`:
  - Nguyên tắc 1 (Multi-Tenancy Isolation): Sau khi đổi sang kiến trúc Membership, collection `Membership` được query ở MỌI request qua `TenantInterceptor` — hiệu năng của nó ảnh hưởng toàn hệ thống, nên cần đánh giá index `(user, organization)` chứ không chỉ index trên `Task`.
  - Không vi phạm nguyên tắc mutation nào vì đây là script đo lường độc lập, chạy trên dữ liệu seed riêng.
- Technical approach & Edge cases to handle:
  - Script độc lập, chạy lại được nhiều lần, seed 100,000 document Task giả lập.
  - Kiểm tra lại các compound index hiện có trên `Task` (theo team/organization/dueDate) còn hợp lý sau khi đổi kiến trúc Membership hay không.
  - Đánh giá thêm index trên `Membership` (`user`, `organization`) để `GET /auth/my-organizations` và validate trong `TenantInterceptor` chạy nhanh — vì đây là bảng được query ở mọi request.
  - Đo bằng `explain('executionStats')`, lặp lại tối thiểu 5 lần lấy trung bình, cleanup data seed sau khi xong.

## 2. Affected Files
- `backend/scripts/benchmark-index.ts`: Script mới seed data, chạy query thực tế trên `Task` và `Membership`, đo executionTimeMillis trước/sau index, in bảng kết quả, cleanup sau khi xong.
- `backend/BENCHMARK_RESULTS.md`: File mới/cập nhật ghi số liệu benchmark thật, bao gồm đánh giá index cho `Membership`.

## 3. Step-by-Step Task Checklist
- [ ] TASK-1: Viết script kết nối MongoDB riêng cho benchmark (không dùng database có data thật).
- [ ] TASK-2: Seed 100,000 document Task giả lập bằng faker, đa dạng organization/team/status/priority/dueDate.
- [ ] TASK-3: Rà soát lại các compound index hiện có trên `Task` sau khi đổi kiến trúc Membership, xác nhận còn hợp lý.
- [ ] TASK-4: Đánh giá và benchmark index `(user, organization)` trên collection `Membership` — đo tốc độ query dùng bởi `GET /auth/my-organizations` và `TenantInterceptor`.
- [ ] TASK-5: Đo `executionTimeMillis` bằng `explain('executionStats')` cho từng query, lặp tối thiểu 5 lần lấy trung bình, cả 2 trạng thái (chưa có/đã có index).
- [ ] TASK-6: Ghi kết quả vào `backend/BENCHMARK_RESULTS.md` kèm ngày chạy, cấu hình môi trường; cleanup toàn bộ data seed sau khi benchmark xong.
