# TaskForge Project Constitution

## Core Architecture Principles

1. **Domain-oriented Modular Monolith**: Package top-level code by Domain/Feature. Controller không chứa business logic hoặc raw ORM query; module giao tiếp qua public service/query contract hẹp.
2. **Explicit Multi-Tenancy Isolation**: Mọi tenant-scoped query/mutation nhận và filter `organizationId` tường minh sau khi xác minh active `OrganizationMembership`. Client header và AsyncLocalStorage không tự tạo authority; thiếu verified tenant context phải fail closed.
3. **Authorization Boundary**: PostgreSQL `OrganizationMembership`/`ProjectMembership` và resource relationships là business Source of Truth. Centralized Authorization/Query Policy của backend xử lý access/manage sau verified tenant-scoped lookup; không thay tenant scoping, relational integrity hoặc Domain Policy.
4. **Business Invariants Stay in Domain Policy**: Task transition/completion, checklist, Approval state và invariant đa entity phải được kiểm tra trong Service/Domain Policy với transaction/conditional update phù hợp; không trộn các rule này vào relationship access policy.
5. **Relational Integrity**: Target persistence dùng PostgreSQL với foreign key, composite constraint, partial index, CHECK và transaction khi phù hợp. RLS là later defense-in-depth, không phải v1 correctness dependency.
6. **Controlled Schema Evolution**: TypeORM migrations là executable schema history; custom PostgreSQL SQL được phép trong migration. Production bắt buộc `synchronize: false` và API replica không tự chạy concurrent migration.
7. **No Direct Frontend State Bypass**: Frontend dùng active workspace context, không derive authorization từ global User role và phải clear/invalidate tenant-bound cache khi switch Organization.

## Tech Stack Standards

- Current runtime: NestJS 11, MongoDB/Mongoose, Redis và BullMQ cho tới capability cutover được kiểm chứng.
- Target runtime v0.3: NestJS 11, PostgreSQL 18, TypeORM + `pg`, centralized Authorization/Query Policy trong backend và Redis/BullMQ có chọn lọc. OpenFGA là deferred post-v0.3 option, không phải dependency của target runtime này.
- Frontend: React/Vite và Redux Toolkit theo source/lockfile hiện hành; frontend major upgrade không thuộc backend refactor baseline.

Accepted Business Scope, Target Technical Architecture, PostgreSQL Target Data Model, ADR-001..004, ADR-005 ở trạng thái deferred và Target Tech Stack Review v0.3 có priority cao hơn legacy phase assumptions khi xung đột.
