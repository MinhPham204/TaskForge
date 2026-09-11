# Plan 03 — Team Capability

> **Execution status:** Not started; depends on Phase 2.  
> **Roadmap:** [Phase 3](../REFACTOR_ROADMAP_v0.3.md#phase-3--team-capability)

## 1. Outcome và invariants

Xây Team như nhóm Member tái sử dụng trong một Organization. Team không có role, invitation authority hoặc approval policy.

## 2. Implementation slices

- Team/TeamMember persistence và same-tenant integrity.
- Team lifecycle và membership commands.
- Public query/provisioning contract cho Organization/Project/Task.
- API/authorization loại toàn bộ Team Lead semantics.

## 3. Task checklist

- [ ] `P3-01` — Implement Team và TeamMember repositories theo composite tenant constraints; không tạo role column.
- [ ] `P3-02` — Implement create/update/archive Team và add/remove Member bằng explicit commands.
- [ ] `P3-03` — Validate TeamMember là active OrganizationMembership cùng Organization tại transaction time.
- [ ] `P3-04` — Hoàn thiện provisioning contract để Phase 2 tạo `General` Team mà không export ORM repository/entity.
- [ ] `P3-05` — Cung cấp membership/dependency query contract cho Project/Task; không circular import.
- [ ] `P3-06` — Áp Organization-level authorization matrix cho Team management; Team membership không tự cấp role.
- [ ] `P3-07` — Thiết kế archive/remove behavior giữ history và trả dependency conflict rõ ràng.
- [ ] `P3-08` — Thêm API/DTO UUID opaque; không có lead/promote/invite/`requireApproval` endpoints.
- [ ] `P3-09` — Thêm persistence, policy, authorization và cross-tenant integration tests.

## 4. Verification

- [ ] User ngoài Organization hoặc inactive Membership không thể thành TeamMember.
- [ ] Team membership không cấp Organization/Project permission.
- [ ] Không policy/endpoint nào phụ thuộc `TEAM_LEAD`.
- [ ] Cross-tenant Team ID không đọc/mutate được.
- [ ] Archive/remove giữ history và không âm thầm phá dependency.

## 5. Exit và deferred

Phase pass khi Team contract đủ cho Project/Task và không còn target Team role semantics. Physical removal của Team Lead, invitations và Mongo fields chờ Phase 10.
