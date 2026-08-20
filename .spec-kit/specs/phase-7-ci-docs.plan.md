# Plan: Phase 7 - CI Pipeline + Documentation

## 1. Architectural Alignment
- Verification against `constitution.md`:
  - CI phải chạy lint + test cho backend và build cho frontend, gián tiếp bảo vệ nguyên tắc Atomic Mutations/RBAC đã được test hóa ở Phase 5 — nếu ai đó phá vỡ nguyên tắc, CI phải đỏ.
  - `ARCHITECTURE.md` phải phản ánh đúng và đầy đủ kiến trúc multi-org mới: Membership collection, header-based tenant switching, role theo Membership — đúng thông tin thật từ codebase, không bịa chi tiết.
- Technical approach & Edge cases to handle:
  - CI trigger đúng trên `push`/`pull_request` vào `main`, cache `node_modules`.
  - Mục "Multi-Organization Architecture" là mục quan trọng nhất cần viết kỹ: lý do chuyển từ 1-user-1-org sang 1-user-n-org, so sánh 2 cách tiếp cận đã cân nhắc (nhúng orgId vào JWT vs header-based switching đã chọn), giải thích cơ chế Membership + validate header + lý do đây là điểm bảo mật quan trọng nhất, và cách FE reset RTK Query cache khi switch workspace.
  - Mục Design Trade-offs cần ghi lại quyết định ban đầu (1-user-1-org) và lý do sau đó đổi sang multi-org — làm rõ câu chuyện đánh giá lại kiến trúc.

## 2. Affected Files
- `.github/workflows/ci.yml`: Pipeline mới với job backend (lint + test) và job frontend (build).
- `README.md`: Thêm badge CI status.
- `ARCHITECTURE.md`: Cập nhật/viết mới với mục Multi-Organization Architecture, Multi-tenancy Strategy, Authorization Model, Design Trade-offs, Async Job Processing, Performance Optimization, Future Improvements.

## 3. Step-by-Step Task Checklist
- [ ] TASK-1: Tạo `.github/workflows/ci.yml` với job backend (checkout, Node 20, `npm ci`, `npm run lint`, `npm run test`) và job frontend (checkout, Node 20, `npm ci`, `npm run build`), cache `node_modules`.
- [ ] TASK-2: Thêm badge CI status vào đầu `README.md`.
- [ ] TASK-3: Viết mục "Multi-Organization Architecture" trong `ARCHITECTURE.md`: lý do chuyển sang 1-user-n-org, so sánh JWT-embedded vs header-based (đã chọn), cơ chế Membership + validate header, cách FE reset cache khi switch.
- [ ] TASK-4: Cập nhật mục "Multi-tenancy Strategy": ALS + Mongoose plugin lưu thêm `membershipRole`, giới hạn qua BullMQ worker boundary.
- [ ] TASK-5: Cập nhật mục "Authorization Model": role theo từng Membership (org-scoped), approval state machine.
- [ ] TASK-6: Viết mục "Design Trade-offs": ghi lại quyết định ban đầu 1-user-1-org và lý do đổi sang multi-org.
- [ ] TASK-7: Cập nhật mục Async Job Processing, Performance Optimization (link `BENCHMARK_RESULTS.md`), Future Improvements nếu có thay đổi liên quan Membership.
