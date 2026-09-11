# ADR-005: OpenFGA Relationship-Based Authorization

Status: Accepted
Date: 2026-08-25

## Context

TaskForge là SaaS multi-tenant với quan hệ quyền theo Organization, Project và resource ngày càng dày: một User có thể thuộc nhiều Organization, có Project role khác nhau và được phép truy cập hoặc quản lý resource thông qua quan hệ cha-con. Guard/RBAC cục bộ vẫn cần thiết cho authentication và tenant entry gate, nhưng không nên tiếp tục tự triển khai một permission graph phân tán trong controller/service.

Đồng thời, TaskForge có nhiều invariant phụ thuộc business state như Task completion, checklist progress và Approval transition. Các rule này cần đọc state authoritative và thực thi trong PostgreSQL transaction; chúng không phải relationship authorization.

## Decision

TaskForge dùng **OpenFGA** làm authorization engine cho Relationship-Based Access Control (ReBAC), bổ sung cho authentication, explicit tenant isolation và Domain Policy hiện có.

OpenFGA chịu trách nhiệm trả lời các câu hỏi relationship/action-level, ví dụ:

- User có quyền truy cập Organization, Project, Task hoặc resource cụ thể hay không;
- User có quyền quản lý resource đó hay không;
- quan hệ User → Organization → Project → Resource có cho phép action như `can_access`, `can_view` hoặc `can_manage` hay không.

Authorization request path mục tiêu là:

```text
Authenticated User
        ↓
ACTIVE OrganizationMembership từ PostgreSQL
        ↓
explicit organizationId + same-tenant resource lookup
        ↓
OpenFGA relationship check
        ↓
Domain Policy / Service business-state validation
        ↓
PostgreSQL transaction
```

### Source of truth và tenant boundary

- `OrganizationMembership` và `ProjectMembership` trong PostgreSQL là business Source of Truth cho membership lifecycle, role và resource relationship.
- OpenFGA relationship tuples là derived authorization projection; không phải nơi tạo hoặc sửa business Membership trực tiếp.
- OpenFGA không thay PostgreSQL relational model, foreign key, unique/composite constraint hoặc explicit `organizationId` scoping.
- Một OpenFGA result `allowed=true` không cho phép application dùng resource ID thuộc tenant khác hoặc bỏ qua active Membership check.

### Domain Policy boundary

Không đưa business-state invariant vào OpenFGA, bao gồm nhưng không giới hạn:

- Task có được complete hay transition sang status khác không;
- required checklist đã hoàn thành chưa;
- Approval request/action có đúng state, actor và transition hợp lệ không;
- transaction có làm mất Owner/Project Manager cuối cùng hoặc phá assignee eligibility không.

Các rule này tiếp tục thuộc Domain Policy/Service và được bảo vệ bằng PostgreSQL transaction/constraint phù hợp.

### Relationship synchronization boundary

Business transaction commit authoritative state trong PostgreSQL trước. Sau commit, một authorization projection/sync adapter ghi hoặc xóa relationship tuple cần thiết bằng stable opaque UUID và operation idempotent.

Không giả định distributed transaction hoặc atomic dual-write giữa PostgreSQL business database và OpenFGA. Durable handoff, retry, reconciliation, revocation freshness và staleness SLO phải được khóa trước production trong Detailed Authorization Phase Plan; exact Outbox/event schema hoặc transport chưa được quyết định trong ADR này.

Protected authorization check fail closed khi OpenFGA unavailable, timeout hoặc request/model không hợp lệ. Authorization model ID được pin trong check/write request và model rollout phải có allow/deny, inheritance, cross-tenant và grant/revoke tests.

OpenFGA dùng datastore/migration lifecycle và database/schema/role tách khỏi TaskForge business schema, kể cả khi local development chia sẻ cùng PostgreSQL server.

## Alternatives Considered

- Chỉ tiếp tục dùng NestJS guards/RBAC ad hoc: ít infrastructure hơn nhưng permission graph và inheritance sẽ phân tán, khó audit/test khi Project/resource relations tăng.
- Đưa toàn bộ authorization vào PostgreSQL query/Domain Service: giữ một datastore nhưng trộn relationship evaluation với business orchestration và lặp logic giữa detail/list/search/worker.
- Dùng OpenFGA làm Membership Source of Truth: giảm một lần projection nhưng làm mất business transaction/relational integrity và tạo split-brain với PostgreSQL domain model.
- Đưa business-state invariant vào OpenFGA conditions: tập trung policy bề ngoài nhưng không phù hợp transaction/state machine và dễ cho phép bypass invariant.

## Consequences

### Positive

- Relationship authorization theo Organization/Project/resource có một model versioned, review và test được.
- Giảm permission inheritance logic phân tán trong controller/guard/service.
- Giữ ranh giới rõ giữa authorization relationship, tenant integrity và business-state invariant.
- Có thể mở rộng resource type mà không thay business Membership Source of Truth.

### Negative / Trade-offs

- Thêm network dependency, datastore, migration, latency và availability boundary.
- Relationship projection có consistency gap sau business commit và cần retry/reconciliation có kiểm soát.
- Revocation cần freshness/consistency policy nghiêm hơn grant thông thường.
- Model/tuple rollout sai có thể deny hợp lệ hoặc cấp quyền quá rộng, nên model tests và observability là release gate.

## Scope / Notes

ADR này không định nghĩa executable OpenFGA model, tuple naming đầy đủ, SDK wrapper, event/outbox schema, retry schedule, deployment manifest hoặc production source. Không thêm Keycloak hoặc authorization framework khác. Exact implementation phải tuân Target Tech Stack Review v0.3 và Detailed Phase Plan tương ứng.
