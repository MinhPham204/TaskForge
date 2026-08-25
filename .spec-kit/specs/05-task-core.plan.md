# Plan 05 — Task Core

> **Execution status:** Not started; depends on Phase 4.  
> **Roadmap:** [Phase 5](../REFACTOR_ROADMAP_v0.3.md#phase-5--task-core-assignment-checklist-comment--transition)

## 1. Outcome và invariants

Xây Task Project-aware với một owning Participating Team, assignee hợp lệ, configurable status, checklist/progress/completion và Comment. Approval chưa được implement trong phase này. OpenFGA không chứa Task state/checklist invariant.

## 2. Implementation slices

- Task aggregate, repository và management/execution policies.
- TaskAssignee, owning-Team change và dependency coordination.
- Checklist/progress/completion và status transition.
- Comment, Task resource ReBAC và attachment seam.

## 3. Task checklist

- [ ] `P5-01` — Implement Task/TaskAssignee/ChecklistItem/Comment persistence với Organization + Project scoped queries và composite integrity.
- [ ] `P5-02` — Tách focused services/policies cho create/update management fields, execution fields, assignment, owning-Team change, transition, complete và archive.
- [ ] `P5-03` — Enforce owning Team là active Participating Team của Project.
- [ ] `P5-04` — Enforce mỗi assignee là active Project Member đồng thời thuộc owning Team; revalidate toàn bộ assignee khi đổi Team.
- [ ] `P5-05` — Implement transition qua active ProjectTaskStatus cùng Project; archived Project/Task chặn normal mutation.
- [ ] `P5-06` — Implement checklist progress SoT và completion rule; required item chưa xong phải chặn complete.
- [ ] `P5-07` — Implement Comment author/visibility/soft-delete theo ProjectMembership.
- [ ] `P5-08` — Extend OpenFGA Project → Task/resource; chỉ model access/manage relation, không status/checklist/Approval condition.
- [ ] `P5-09` — Hoàn thiện dependency coordinators: remove Participating Team/TeamMember/Membership và complete Project phải query Task state nhất quán.
- [ ] `P5-10` — Đặt storage-neutral TaskAttachment contract seam cho Phase 9; không lưu raw URL array.
- [ ] `P5-11` — Tạo explicit command DTO/API và read DTO không expose TypeORM entity.
- [ ] `P5-12` — Thêm domain, transaction, constraint, ReBAC, cross-tenant và critical E2E tests.

## 4. Verification

- [ ] Owning Team/assignee/status sai Project hoặc tenant đều fail.
- [ ] Đổi owning Team không silently drop assignee và rollback nếu bất kỳ assignee không còn hợp lệ.
- [ ] Checklist/manual progress không tạo hai source of truth; completed Task có effective progress 100%.
- [ ] Không remove dependency khi còn owning Task/current assignee; phải dùng explicit remediation command trước.
- [ ] Project không complete khi còn Task non-terminal.
- [ ] OpenFGA `allowed=true` không bypass tenant lookup hoặc transition/completion policy.
- [ ] Detail/list/update/delete cross-tenant fail closed.

## 5. Exit và deferred

Phase pass khi normal Task lifecycle ổn định. `requiresApproval` behavior, request history và completion approval gate thuộc Phase 6; storage provider thuộc Phase 9; Mongo cleanup thuộc Phase 10.
