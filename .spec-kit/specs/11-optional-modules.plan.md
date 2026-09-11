# Plan 11 — Optional Modules

> **Execution status:** Not started; depends on Phase 4–5, 8–10.  
> **Roadmap:** [Phase 11](../REFACTOR_ROADMAP_v0.3.md#phase-11--optional-modules-milestones-documents--risks)

## 1. Outcome và invariants

Hoàn thiện Milestones, Documents và Risks trên PostgreSQL-only runtime. Registry v1 chỉ có đúng bốn optional modules: Milestones, Documents, Files và Risks; không có custom entity/dynamic schema builder.

## 2. Decision gate

Trước affected slice phải chốt vocabulary/lifecycle Milestone, Risk probability/impact/state và module default values còn deferred trong Business Scope. Chỉ khóa operation tương ứng, không mở lại Project/Task hierarchy.

## 3. Task checklist

- [ ] `P11-01` — Chốt và ghi feature-level TBD cho Milestone, Risk và module defaults trước implementation tương ứng.
- [ ] `P11-02` — Implement shared module gate đọc ProjectModuleSetting; disabled module chặn normal create/mutation nhưng giữ read/history theo policy.
- [ ] `P11-03` — Implement Milestone metadata/lifecycle/progress và optional same-Project Task relation.
- [ ] `P11-04` — Implement Document content/author/editor/archive với ProjectMembership authorization.
- [ ] `P11-05` — Implement Risk owner/state/mitigation và Risk–Task links cùng Project/tenant.
- [ ] `P11-06` — Đặt repositories/services/API trong owning domain phù hợp; không tạo generic dynamic-module framework.
- [ ] `P11-07` — Emit audit/activity/notification intents qua Phase 8 contracts khi business event cần.
- [ ] `P11-08` — Thêm persistence, same-tenant relation, enabled/disabled authorization và E2E tests cho từng module.

## 4. Verification

- [ ] Disabled module chặn normal create/mutation, giữ data/relation/history.
- [ ] Milestone/Risk/Document/Task relations luôn cùng Project và tenant.
- [ ] Task completion không tự close Milestone; Risk resolution không tự transition Task.
- [ ] Không có module thứ năm, custom entity hoặc dynamic schema path.
- [ ] Files behavior vẫn thuộc Phase 9 và không bị duplicate.

## 5. Exit và deferred

Phase pass khi ba module còn lại đạt contract v1 và module-disable invariants. Future module/plugin builder nằm ngoài v1.
