# ADR-002: PostgreSQL Target & Persistence Boundary

Status: Accepted
Date: 2026-08-23

## Context

Runtime legacy đang dùng MongoDB/Mongoose, trong khi domain v0.3 có nhiều quan hệ N:N, same-tenant reference, unique/composite constraint và multi-row invariant. Xây target domain mới trên MongoDB trước sẽ tạo thêm một lần rewrite và tiếp tục để application gánh các constraint quan hệ.

Target cần một persistence direction duy nhất trước khi thiết kế physical schema.

## Decision

**PostgreSQL là primary và duy nhất persistence của target runtime.** MongoDB chỉ là legacy implementation/reference trong quá trình refactor, không phải thành phần của target architecture.

Không xây target Mongo adapter, permanent Mongo/PostgreSQL coexistence, cross-database domain architecture hoặc dual-write mặc định. Có thể cutover theo capability; capability chưa refactor có thể còn dùng legacy code tạm thời, nhưng capability đã cutover dùng PostgreSQL làm source of truth và legacy path tương ứng không còn thuộc target.

Nếu MongoDB chỉ chứa development/demo data, không cần production-grade ETL; dữ liệu có thể được tạo lại bằng PostgreSQL seed. Nhu cầu giữ production data, nếu xuất hiện, là migration concern riêng và không thay đổi target persistence decision này.

ORM là infrastructure detail. Controller không thao tác ORM trực tiếp; business rule không phụ thuộc Prisma/Mongoose-specific behavior; ORM record/type không được expose thành API contract. Repository/data-access boundary chỉ cần đủ để tách business logic khỏi persistence, không bắt buộc interface cho mọi entity.

PostgreSQL được chọn vì foreign key, unique/composite constraint, ACID transaction, concurrency control và relational query/filter/report phù hợp domain v0.3.

## Alternatives Considered

- Refactor target domain trên MongoDB rồi migrate sau: giảm thay đổi ban đầu nhưng tạo double rewrite và constraint yếu hơn.
- Permanent MongoDB/PostgreSQL adapters hoặc dual-write: tăng khả năng coexistence nhưng tạo hai nguồn sự thật và failure modes không cần thiết.
- Thay toàn bộ persistence trong một big-bang: chỉ có một target sớm hơn nhưng blast radius và rollback risk lớn.

## Consequences

### Positive

- Một persistence source of truth rõ ràng cho target runtime.
- Relational integrity và transaction hỗ trợ trực tiếp các invariant quan trọng.
- Không phải duy trì target domain model hoặc compatibility abstraction cho MongoDB.
- API và business layer được tách khỏi ORM-specific representation.

### Negative / Trade-offs

- Legacy Mongoose coupling phải được loại bỏ khi từng capability cutover.
- Schema/cutover cần test kỹ vì current safety net còn hạn chế.
- Nếu sau này xác nhận có production data phải giữ, cần migration strategy riêng.

## Scope / Notes

ADR này không định nghĩa PostgreSQL tables, Prisma schema, migration SQL, cutover order hoặc rollback procedure. Các nội dung đó thuộc PostgreSQL Target Data Model / Schema Design và Migration Strategy.
