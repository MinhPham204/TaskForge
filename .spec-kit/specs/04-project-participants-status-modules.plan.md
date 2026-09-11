# Plan 04 — Project, Participants, Status & Module Settings

> **Execution status:** Not started; depends on Phase 2–3.  
> **Roadmap:** [Phase 4](../REFACTOR_ROADMAP_v0.3.md#phase-4--project-participants-status-configuration--module-settings)

## 1. Outcome và invariants

Tạo Project aggregate đúng Business Scope: Participating Teams và Project Members tách riêng, Project role độc lập Organization role, status cấu hình theo Project và đúng bốn module settings. OpenFGA evaluate Project relations; PostgreSQL/Domain Policy giữ qualification và last-PM invariants.

## 2. Implementation slices

- Project lifecycle và atomic creation.
- ProjectTeam/ProjectMembership participant commands.
- ProjectTaskStatus configuration và ProjectModuleSetting.
- Project-level OpenFGA model/projection/checks.

## 3. Task checklist

- [ ] `P4-01` — Implement Project repositories và lifecycle `DRAFT`, `ACTIVE`, `COMPLETED`, `ARCHIVED` với explicit Organization scope.
- [ ] `P4-02` — Implement create transaction tạo default Participating Team, creator `PROJECT_MANAGER`, required semantic statuses và bốn module settings.
- [ ] `P4-03` — Implement add/remove Participating Team; add/remove Project Member; assign/change Project role bằng business commands.
- [ ] `P4-04` — Enforce Project Member là active Organization Member và thuộc ít nhất một Participating Team.
- [ ] `P4-05` — Enforce active Project có ít nhất một PM; protect competing remove/demote bằng transaction/race control.
- [ ] `P4-06` — Implement ProjectTaskStatus configure/reorder/archive và required semantic status set; status luôn thuộc cùng Project.
- [ ] `P4-07` — Implement module enable/disable commands; disable giữ data và chỉ chặn normal mutation theo policy.
- [ ] `P4-08` — Tách Organization role và Project role; Owner/Admin không tự thành PM.
- [ ] `P4-09` — Extend versioned OpenFGA model Organization → Project; project committed participant/role changes thành idempotent tuples.
- [ ] `P4-10` — Đặt dependency contracts cho Phase 5 bổ sung owning-Team/assignee checks khi remove participant.
- [ ] `P4-11` — Thêm domain, constraint, transaction/race, authorization và lifecycle E2E tests.

## 4. Verification

- [ ] Add Team không tự tạo Project Member.
- [ ] Invalid/inactive/non-qualifying Member bị reject.
- [ ] Không remove/demote PM cuối của active Project.
- [ ] Participating Team removal không phá participant dependency đã biết.
- [ ] Required statuses được giữ; archived/cross-Project status không dùng cho mutation mới.
- [ ] Module disable không xóa data.
- [ ] Cross-Organization lookup/tuple không bypass tenant boundary; grant/revoke tests pass.

## 5. Exit và deferred

Phase pass khi Project aggregate và contracts đủ ổn định cho Task. Không tạo shim `Project = Team`; Task-based participant dependency chỉ được hoàn thiện ở Phase 5 khi Task target tồn tại.
