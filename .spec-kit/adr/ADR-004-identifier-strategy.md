# ADR-004: Identifier Strategy

Status: Accepted
Date: 2026-08-23

## Context

Legacy API và Mongoose schema đang mang assumption MongoDB ObjectId. PostgreSQL target cần identifier nhất quán cho entity và foreign key mà không làm API phụ thuộc database sequence, ORM validator hoặc persistence implementation.

TaskForge không có requirement về distributed ID generation, sortable global ID hoặc encoding business meaning trong ID.

## Decision

Target entity primary IDs và cross-entity foreign keys dùng **RFC 4122 UUID v4** theo một convention thống nhất trong PostgreSQL Target Schema.

Public API biểu diễn ID như opaque string. API/client không expose hoặc phụ thuộc Mongo ObjectId format, database sequence semantics, UUID internals hay ORM-specific ID validator. Frontend không sort, phân loại hoặc derive business meaning từ ID.

Vị trí generation cụ thể bằng ORM/application hoặc PostgreSQL default là physical schema detail; giá trị tạo ra phải tuân UUID v4 convention và không làm thay đổi public API contract.

Nếu legacy Mongo data không cần migrate, không xây ObjectId→UUID compatibility layer. Nếu production data phải giữ, mapping thuộc Migration Strategy riêng.

## Alternatives Considered

- Giữ Mongo ObjectId: duy trì legacy coupling và không phù hợp PostgreSQL-only target.
- Auto-increment integer/bigint: nhỏ và index-friendly nhưng làm lộ sequence assumption, đồng thời khó cấp ID trước insert hơn.
- UUID v7 hoặc ULID: có ordering tốt hơn nhưng thêm convention/tooling chưa cần cho scale hiện tại.
- Custom distributed ID generator: không có requirement biện minh độ phức tạp.

## Consequences

### Positive

- Identifier độc lập ORM và không làm lộ database sequence.
- Convention thống nhất cho entity/FK và phù hợp API opaque ID.
- UUID v4 được PostgreSQL, ORM và ecosystem hỗ trợ rộng rãi.
- Không cần infrastructure phát ID phân tán riêng.

### Negative / Trade-offs

- UUID lớn và index locality kém hơn sequential bigint.
- Log/debug thủ công khó đọc hơn ID ngắn.
- Legacy data cần explicit mapping nếu migration trở thành requirement.

## Scope / Notes

ADR này không liệt kê entity/table, không định nghĩa column DDL và không tạo compatibility layer. Exact database defaults/indexes được quyết định trong PostgreSQL Target Data Model / Schema Design mà không thay đổi UUID v4 và opaque API contract.
