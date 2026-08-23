# ADR-003: Tenant Isolation v1

Status: Accepted
Date: 2026-08-23

## Context

Organization là tenant; User là global identity; Organization role chỉ đến từ active OrganizationMembership. Legacy implementation còn có global User role, implicit tenant context và query path có thể fail-open, nên tenant isolation không thể chỉ dựa vào client header, ALS hoặc ORM middleware.

Isolation phải nhất quán cho detail, list, search, aggregate, background worker và administrative operation.

## Decision

Correctness boundary v1 là:

```text
Authenticated User
        ↓
ACTIVE OrganizationMembership
        ↓
verified organizationId
        ↓
resource Organization ownership
        ↓
ProjectMembership / ProjectRole
        ↓
resource relationship / business policy
```

Tenant-scoped data access nhận hoặc resolve `organizationId` tường minh và fail-closed khi thiếu verified tenant context. Client-provided Organization ID không được tin trước khi Membership được xác thực. Global User role không cấp Organization hoặc Project permission.

Query, mutation, list, search, report, aggregate và worker dùng cùng isolation principle. Control-plane operation không có active tenant context phải có explicit authorization path riêng, không dùng generic tenant bypass.

PostgreSQL hỗ trợ isolation bằng foreign key, composite same-tenant constraint, unique index và referential integrity khi phù hợp. Application vẫn chịu trách nhiệm cho resource ownership, lifecycle và policy không thể biểu diễn hoàn toàn bằng constraint.

PostgreSQL RLS là later defense-in-depth, không phải v1 correctness dependency. ADR này không thiết kế RLS policy.

## Alternatives Considered

- Chỉ dùng ALS/implicit ORM filter: ít code hơn nhưng dễ fail-open và khó bảo vệ worker/raw query.
- Dùng global User organization/role: không hỗ trợ đúng multi-Organization và trộn authorization scope.
- Bật PostgreSQL RLS ngay làm correctness boundary: defense mạnh hơn nhưng tăng complexity sớm cho ORM, pooling và transaction context.

## Consequences

### Positive

- Tenant boundary explicit, fail-closed và review/test được.
- Role và resource access được đánh giá đúng Organization/Project context.
- Database constraints giảm cross-tenant reference sai.
- Worker và read-heavy endpoint không có isolation model riêng.

### Negative / Trade-offs

- Service/repository signatures và query phải truyền tenant context rõ ràng.
- Cần negative integration/E2E tests cho mọi data-access shape quan trọng.
- Một số control-plane/system operation cần authorization path riêng được đặt tên rõ.

## Scope / Notes

ADR này không định nghĩa endpoint, header contract chi tiết, RLS SQL hoặc permission matrix đầy đủ. Authorization action-level tiếp tục tuân Business Scope v0.3 và Target Technical Architecture v0.3.
