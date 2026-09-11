# ADR-005: OpenFGA Relationship-Based Authorization — Deferred

Status: Deferred — post-v0.3
Date: 2026-08-25
Updated: 2026-08-29

## Context

TaskForge đã đánh giá OpenFGA cho permission graph Organization → Project → Resource khi một User có thể thuộc nhiều Organization, giữ nhiều Project role và truy cập resource qua quan hệ cha-con. ADR này ban đầu chấp nhận OpenFGA làm ReBAC engine.

Final readiness review cho v0.3 xác định permission model hiện tại vẫn có thể được thực thi rõ ràng bằng authoritative PostgreSQL relationships và một policy boundary tập trung trong modular monolith. Đưa thêm authorization server, tuple projection, consistency/reconciliation và deployment lifecycle vào critical path sẽ tăng rủi ro trước khi những quan hệ v0.3 được triển khai và kiểm chứng.

Business-state invariant như Task completion, checklist progress và Approval transition vẫn phải đọc state authoritative và chạy trong PostgreSQL transaction; chúng không phải relationship authorization.

## Decision

**OpenFGA được giữ như một architecture option nhưng defer khỏi toàn bộ TaskForge v0.3 critical path.** v0.3 không triển khai OpenFGA server, SDK, authorization model, tuple projection/sync, reconciliation, CI/deployment integration hoặc provider abstraction chuẩn bị trước.

Authorization request path v0.3 là:

```text
Authenticated User
        ↓
ACTIVE OrganizationMembership từ PostgreSQL
        ↓
explicit organizationId + same-tenant resource lookup
        ↓
centralized Authorization / Query Policy
        ↓
Domain Policy / Service business-state validation
        ↓
PostgreSQL transaction
```

### Source of truth và tenant boundary

- `OrganizationMembership`, `ProjectMembership` và resource relationships trong PostgreSQL là business Source of Truth.
- Centralized Authorization/Query Policy đánh giá access/manage từ các relationship authoritative; query policy phải áp dụng cùng tenant/visibility rule cho detail, list, search, report và worker.
- Policy không thay PostgreSQL relational model, foreign key, unique/composite constraint hoặc explicit `organizationId` scoping.
- Một kết quả policy `allowed=true` không cho phép application dùng resource ID thuộc tenant khác hoặc bỏ qua active Membership check.

### Domain Policy boundary

Không đưa business-state invariant vào relationship access policy, bao gồm nhưng không giới hạn:

- Task có được complete hay transition sang status khác không;
- required checklist đã hoàn thành chưa;
- Approval request/action có đúng state, actor và transition hợp lệ không;
- transaction có làm mất Owner/Project Manager cuối cùng hoặc phá assignee eligibility không.

Các rule này thuộc Domain Policy/Service và được bảo vệ bằng PostgreSQL transaction/constraint phù hợp.

## Điều kiện xem xét lại sau v0.3

Chỉ mở lại quyết định OpenFGA khi source và evidence cho thấy centralized policy không còn đủ, ví dụ cross-organization sharing, guest/external collaboration, delegated/custom roles, permission inheritance sâu hoặc policy graph lặp lại đáng kể giữa nhiều resource. Review mới phải xác định rõ:

- permission model và measured complexity cần giải quyết;
- authoritative relationship và projection boundary;
- grant/revoke freshness, failure mode và reconciliation requirement;
- latency/availability budget, model rollout tests và operational ownership;
- giá trị đạt được so với tiếp tục dùng centralized application policy.

Không tạo abstraction, event platform hoặc tuple-ready schema chỉ để dự đoán review này.

## Lịch sử quyết định được giữ lại

Lý do ban đầu chọn OpenFGA vẫn có giá trị để đánh giá hậu v0.3: một model versioned có thể giảm inheritance logic phân tán và hỗ trợ graph phức tạp hơn. Nếu được chấp nhận lại, OpenFGA chỉ có thể là derived authorization projection; PostgreSQL vẫn giữ Membership/resource business truth, tenant lookup vẫn explicit và Domain Policy vẫn giữ state invariant. Không được giả định distributed transaction giữa hai datastore.

## Alternatives Considered

- **Centralized Authorization/Query Policy trên PostgreSQL relationships — chọn cho v0.3:** ít operational boundary hơn, giữ authorization có thể review/test trong modular monolith và phù hợp permission model đã Accepted.
- **Triển khai OpenFGA ngay trong v0.3 — deferred:** thêm network/datastore/model/tuple lifecycle và consistency gap trước khi có evidence cần thiết.
- **NestJS guards/RBAC ad hoc — reject:** permission rule vẫn phải được tập trung trong policy/query contracts, không phân tán qua controller và service.
- **OpenFGA làm Membership Source of Truth — reject:** làm mất business transaction/relational integrity và tạo split-brain với PostgreSQL domain model.
- **Đưa business-state invariant vào relationship policy — reject:** không phù hợp transaction/state machine và dễ cho phép bypass invariant.

## Consequences

### Positive

- PostgreSQL migration và domain cutover không phụ thuộc một distributed authorization system mới.
- Một authoritative relationship model phục vụ cả command và query policy, giảm projection drift trong v0.3.
- Boundary giữa tenant integrity, relationship authorization và business-state invariant vẫn rõ ràng.
- Lịch sử OpenFGA và tiêu chí mở lại được giữ mà không tạo speculative implementation.

### Negative / Trade-offs

- Backend phải duy trì centralized policy contracts và ngăn authorization logic phân tán.
- List/search/report cần query policy có cùng semantics với detail/command path.
- Nếu permission graph tăng đáng kể sau v0.3, một lần review và migration authorization riêng vẫn cần thiết.

## Scope / Notes

ADR này không authorize executable OpenFGA model, server, SDK wrapper, tuple/event/outbox schema, retry/reconciliation, deployment manifest hoặc production source trong v0.3. Không thêm Keycloak, một OpenFGA replacement framework hoặc generic authorization-provider layer. Exact v0.3 implementation phải tuân Business Scope, Target Technical Architecture, ADR-003 và canonical phase plan tương ứng.
