# Plan 02 — Tenant Control Plane

> **Execution status:** Not started; depends on Phase 1.  
> **Roadmap:** [Phase 2](../REFACTOR_ROADMAP_v0.3.md#phase-2--tenant-control-plane-identity-organization--membership)  
> **Capability:** Identity, Authentication, Organization, OrganizationMembership, Invitation và Organization-level ReBAC.

## 1. Outcome và invariants

Xây target control plane với User global, active OrganizationMembership là Organization-role business SoT, onboarding atomic và tenant access fail closed. OpenFGA chỉ evaluate relationship; PostgreSQL giữ lifecycle và tenant integrity.

## 2. Implementation slices

- Identity/Auth PostgreSQL slice và request principal không có global tenant role.
- Organization/Membership/Invitation repositories và lifecycle policies.
- Atomic onboarding + Owner invariants + workspace discovery.
- Organization-level OpenFGA model/projection/check adapter.

## 3. Task checklist

- [ ] `P2-01` — Implement User/Auth persistence với UUID opaque ID và `refresh_token_hash`; loại Organization/global role khỏi target JWT authorization.
- [ ] `P2-02` — Implement Organization, Membership và Invitation repositories với explicit tenant signatures và constraints từ Frozen Data Model.
- [ ] `P2-03` — Implement onboarding coordinator: User + Organization + active OWNER Membership + `General` Team + creator TeamMember trong một transaction.
- [ ] `P2-04` — Implement Organization create/update/archive và Owner transfer/last-owner policy với concurrency control.
- [ ] `P2-05` — Implement invite/accept/reject/revoke/expire và Membership suspend/revoke/leave lifecycle; accept idempotent và hỗ trợ multi-org.
- [ ] `P2-06` — Implement authentication → verified active Membership → explicit tenant context; ALS chỉ truyền context, repository vẫn bắt buộc tenant ID.
- [ ] `P2-07` — Tạo workspace/profile/invitation DTO hẹp; không expose TypeORM entity.
- [ ] `P2-08` — Version Organization-level OpenFGA model cho access/manage; adapter chỉ chạy sau tenant/resource lookup.
- [ ] `P2-09` — Project committed Membership/Organization relationship change thành tuple upsert/delete idempotent; chọn handoff đủ cho grant/revoke correctness, không dựng generic event platform.
- [ ] `P2-10` — Thêm domain, persistence, race, authorization và critical onboarding E2E tests.

## 4. Verification

- [ ] Onboarding rollback toàn bộ nếu thiếu Owner, General Team hoặc creator TeamMember.
- [ ] Exactly one active Owner dưới competing transfer/remove.
- [ ] Admin Organization A không có quyền tại B; inactive/missing Membership fail closed.
- [ ] Invitation accept tạo/activate Membership atomically và không áp one-user-one-org.
- [ ] Global User role/JWT không cấp Organization permission.
- [ ] OpenFGA allow/deny/inheritance, stale/missing tuple, revocation và outage tests pass fail-closed.
- [ ] Auth bootstrap thiếu secret phải fail fast.

## 5. Exit và deferred

Phase pass khi target control plane độc lập được test đầy đủ nhưng chưa phục vụ production route. Chưa xóa Mongo fields/path; Team management hoàn thiện ở Phase 3 và durable projection reliability hoàn thiện ở Phase 8.
