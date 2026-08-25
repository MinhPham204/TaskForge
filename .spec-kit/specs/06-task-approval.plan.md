# Plan 06 — Task Approval

> **Execution status:** Not started; depends on Phase 5 và affected feature TBD.  
> **Roadmap:** [Phase 6](../REFACTOR_ROADMAP_v0.3.md#phase-6--task-approval)

## 1. Outcome và invariants

Implement Approval như Task-owned capability độc lập Task Status. Mỗi request cycle immutable từ `PENDING` tới đúng một terminal outcome; completion gate nằm trong Domain Policy, không OpenFGA.

## 2. Decisions phải chốt trước affected task

- Self-approval có được phép không và trong điều kiện nào.
- Field/status change nào invalidate approval đã cấp.
- Ai được cancel/reassign request và behavior khi designated approver mất eligibility.

Các quyết định này chỉ khóa operation tương ứng; phải được ghi vào plan/ADR phù hợp trước implementation, không tự suy diễn từ legacy behavior.

## 3. Task checklist

- [ ] `P6-01` — Chốt và ghi feature-policy TBD cho self-approval, invalidation, cancel và reassign.
- [ ] `P6-02` — Implement Task approval configuration (`requiresApproval`, designated approver) với eligibility check tại write time.
- [ ] `P6-03` — Implement immutable request cycle persistence và request/cancel/approve/reject commands.
- [ ] `P6-04` — Dùng conditional update/transaction để chỉ một competing terminal action thành công.
- [ ] `P6-05` — Revalidate approver là active eligible Project Member tại action time.
- [ ] `P6-06` — Tích hợp completion gate; generic Task patch không được disable/bypass pending approval.
- [ ] `P6-07` — Bổ sung pending-approval dependency vào Membership/TeamMember/ProjectMember removal coordinators.
- [ ] `P6-08` — Định nghĩa approval queue read contract cho Phase 7 và audit/activity/notification intents cho Phase 8.
- [ ] `P6-09` — Tạo command/history DTO riêng; không dùng fixed Task status để biểu diễn approval.
- [ ] `P6-10` — Thêm state-machine, race, authorization, dependency và E2E tests.

## 4. Verification

- [ ] `REVIEW` hoạt động như semantic Task Status cho Task không yêu cầu approval.
- [ ] Không có `PENDING_APPROVAL`/`REJECTED` trong ProjectTaskStatus.
- [ ] Competing approve/reject/cancel chỉ có một winner; history cũ không đổi.
- [ ] Pending approval không bypass được qua generic edit/complete.
- [ ] Inactive/cross-Project/ineligible approver bị chặn.
- [ ] OpenFGA permission không thay approval state/completion policy.

## 5. Exit và deferred

Phase pass khi Approval state machine và completion gate có race-safe evidence. Activity/Audit/Notification persistence thuộc Phase 8; legacy Team Lead/`requireApproval` cleanup thuộc Phase 10.
