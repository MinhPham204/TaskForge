# Plan 07 — Core Read Models & API Contract

> **Execution status:** Not started; depends on Phase 4–6.  
> **Roadmap:** [Phase 7](../REFACTOR_ROADMAP_v0.3.md#phase-7--core-read-models-search-reporting--api-contract)

## 1. Outcome và ranh giới

Hoàn thiện query/API surface cho core domain và đóng contract cần cho frontend Phase 10. Ưu tiên PostgreSQL query/index; không thêm CQRS, projection database hoặc Redis cache nếu workload chưa chứng minh cần.

## 2. Implementation slices

- Project Overview, Board và Task List.
- My Tasks, approval queue, workload, dashboard và search/filter.
- Workspace/directory contract và backend–frontend route map.
- Pagination/filter primitives và tenant-negative contract tests.

## 3. Task checklist

- [ ] `P7-01` — Lập inventory target use cases và current frontend consumers; tạo contract map resource/action/route/DTO.
- [ ] `P7-02` — Implement focused query services trong owning modules cho Overview, Board, Task List và Task detail.
- [ ] `P7-03` — Implement My Tasks, approval queue, workload và dashboard bằng explicit Organization/Project filters.
- [ ] `P7-04` — Implement search/filter/sort/pagination với shared pagination primitive; filter semantics thuộc domain.
- [ ] `P7-05` — Hoàn thiện workspace discovery và Organization directory/assignee DTO từ active Membership/Project relations.
- [ ] `P7-06` — Freeze target contract: UUID opaque IDs, tenant header, Project roles, configured statuses và Approval state riêng.
- [ ] `P7-07` — Chỉ thêm projection/cache nếu có query evidence; document invalidation/fallback và giữ transactional tables là SoT.
- [ ] `P7-08` — Định nghĩa semantic-compatible transport deprecation cho Phase 10; không invent Team→Project/fixed-status shim.
- [ ] `P7-09` — Thêm query correctness, contract snapshot và cross-tenant negative tests cho từng surface.

## 4. Verification

- [ ] Board order/name/semantic lấy từ ProjectTaskStatus.
- [ ] My Tasks, approval queue, workload, search và reports không leak tenant/Project khác.
- [ ] `CANCELLED` không tính là completed metric.
- [ ] API không expose TypeORM entity, ObjectId hoặc global User role.
- [ ] Projection/cache failure không thay business state; query values khớp transactional data.
- [ ] Contract map đủ để frontend Phase 10 implement không cần đoán domain semantics.

## 5. Exit và deferred

Phase pass khi contract core được freeze và query safety net xanh. Frontend code/caching thực tế vẫn thuộc Phase 10; benchmark/tuning chỉ làm theo measurement.
