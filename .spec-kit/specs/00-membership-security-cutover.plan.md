# Plan 00 — Complete Current Membership Security Cutover

> **Execution status:** Pending; current source đã có một phần Membership guard/interceptor nhưng chưa đạt exit gate.  
> **Roadmap:** [Entry Gate 0](../REFACTOR_ROADMAP_v0.3.md#entry-gate-0--complete-current-membership-security-cutover)  
> **Runtime:** MongoDB/Mongoose hiện tại; không triển khai PostgreSQL, TypeORM hoặc OpenFGA.

## 1. Outcome và ranh giới

Đóng toàn bộ authorization gap của Membership runtime hiện tại để Phase 1 có thể bắt đầu an toàn. Active Membership là authority cho Organization access; legacy `User.organization`, `User.role`, `User.team` và `Organization.members[]` có thể còn tồn tại vật lý nhưng không được cấp quyền.

Không làm frontend workspace UI/cache cutover và không xóa field Mongo legacy; cả hai thuộc Phase 10.

## 2. Implementation slices

- Workspace discovery và multi-Organization invitation.
- Cutover authorization consumers còn lại: registration/Auth, Organization lifecycle, directory/assignee và notification.
- Fail-closed tenant boundary cho request và non-request execution.
- Security integration/E2E trên MongoDB/Redis disposable.

## 3. Task checklist

- [ ] `G0-01` — Audit source hiện tại bằng grep và lập danh sách mọi authorization read từ global User fields hoặc `Organization.members[]`; phân loại business read, compatibility read và authorization read.
- [ ] `G0-02` — Hoàn thiện `GET /auth/my-organizations` từ active Membership, trả DTO workspace hẹp và không suy quyền từ User global.
- [ ] `G0-03` — Sửa invitation acceptance để create/activate Membership ở Organization thứ hai một cách idempotent; loại one-user-one-org authorization rule.
- [ ] `G0-04` — Cut over registration/Auth và Organization lifecycle sang Membership authority; mọi control-plane `@SkipTenant()` phải được đặt tên, giới hạn và test.
- [ ] `G0-05` — Cut over directory, assignee lookup và notification recipient khỏi global User role/organization hoặc embedded Organization members.
- [ ] `G0-06` — Rà soát list/search/aggregate và BullMQ worker/scheduler; truyền Organization context tường minh ngoài HTTP ALS và fail closed khi thiếu context.
- [ ] `G0-07` — Giữ schema/field legacy để tương thích tới Phase 10, nhưng thêm regression test chứng minh chúng không cấp quyền.
- [ ] `G0-08` — Bổ sung integration/E2E trên environment disposable; không chạy migration/seed stateful trên target chưa xác nhận.
- [ ] `G0-09` — Chạy build, focused unit/integration/E2E và source scan; ghi evidence trực tiếp vào PR/implementation report rồi review Gate 0.

## 4. Verification matrix

| Case | Expected |
|---|---|
| Missing/malformed `X-Organization-Id` trên tenant route | `400`, không fallback |
| User không có Membership trong Organization | `403` |
| Membership inactive | `403` dù JWT còn hạn |
| Resource thuộc Organization khác | Không đọc/mutate được |
| List/search/aggregate | Không trả row khác tenant |
| Worker không có verified Organization context | Fail closed, không gửi/mutate |
| Global User role cao nhưng Membership không hợp lệ | Không có quyền |
| Accept invitation Organization thứ hai | Membership được create/activate, Membership cũ giữ nguyên |

## 5. Exit criteria

- [ ] Mọi implementation task của Gate 0 có source/test evidence.
- [ ] Không còn authorization consumer đã biết dựa trên global User/embedded Organization authority.
- [ ] Security matrix xanh trên MongoDB/Redis disposable.
- [ ] Frontend và physical legacy cleanup vẫn deferred, không bị kéo vào gate.
- [ ] Roadmap review ghi Gate 0 pass; chỉ sau đó mới mở Phase 1.
