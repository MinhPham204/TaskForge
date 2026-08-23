# ADR-001: Domain-oriented Modular Monolith & Internal Layering

Status: Accepted
Date: 2026-08-23

## Context

TaskForge có nhiều business capability liên quan chặt qua tenant, authorization và transaction như Organization, Project và Task. Quy mô v1 khoảng 5–100 active members mỗi Organization chưa tạo nhu cầu deploy hoặc scale độc lập từng domain.

Kiến trúc cần ưu tiên business ownership trước technical layer. Tổ chức toàn source theo các root folder `controllers/`, `services/`, `repositories/` làm mờ domain boundary; ngược lại, áp dụng full DDD/Clean Architecture ceremony cho mọi CRUD tạo chi phí không cần thiết.

## Decision

TaskForge sử dụng **Modular Monolith**, tổ chức **Package by Domain / Feature** ở top-level và **Layered Architecture thực dụng bên trong mỗi domain**:

```text
Domain boundary first
→ technical layer second
```

Conceptual source organization:

```text
src/
├── modules/
│   ├── identity/
│   ├── organization/
│   ├── team/
│   ├── project/
│   ├── task/
│   ├── notification/
│   ├── activity/
│   ├── audit/
│   └── ...
├── shared/
│   ├── pagination/
│   ├── errors/
│   ├── types/
│   └── technical cross-domain primitives
└── infrastructure/
    └── truly application-wide infrastructure khi cần
```

Đây là conceptual convention, không khóa exact tree. Không tạo folder nếu module chưa có nhu cầu thực tế.

### Internal layer responsibilities

Dependency cơ bản bên trong domain:

```text
Controller
→ Service / Use Case
→ Repository / Data Access
→ ORM
→ PostgreSQL
```

- **Controller:** HTTP routing, request/response DTO, transport validation và gọi Service/Use Case. Không chứa business logic, raw query hoặc Router layer riêng ngoài NestJS `@Controller()`.
- **Service:** business operation, orchestration, authorization/policy invocation và transaction boundary khi phù hợp. CRUD/rule đơn giản nằm trực tiếp ở domain service; không bắt buộc mỗi action có Use Case riêng.
- **Use Case / Policy:** chỉ tạo cho invariant/business rule đủ phức tạp hoặc khi giúp service không phình, ví dụ last Owner/Project Manager, participant eligibility, Task assignment/completion, Approval actions và Project completion.
- **Repository / Data Access:** ORM/database access, persistence query, database-error mapping khi cần và explicit tenant scoping. Service/business rule không query Prisma trực tiếp.

Không bắt buộc `IRepository`, `RepositoryPort` hoặc `RepositoryAdapter` cho mọi entity khi target chỉ có một PostgreSQL implementation.

Một domain có thể dùng structure thực dụng như:

```text
task/
├── controllers/
├── services/
├── repositories/
├── models/
├── dto/
├── policies/
├── use-cases/
├── enums/
├── constants/
├── errors/
├── types/
└── task.module.ts
```

Không folder nào trong ví dụ là bắt buộc nếu chưa có code tương ứng.

### Domain ownership

Một database entity không tự động trở thành top-level module. Grouping dựa trên business ownership:

- Organization sở hữu Organization, OrganizationMembership và Invitation.
- Team sở hữu Team và TeamMember.
- Project sở hữu Project, ProjectTeam, ProjectMembership, ProjectTaskStatus và ProjectModuleSetting.
- Task sở hữu Task, TaskAssignee, Checklist, Comment và Approval-related logical concepts.

Approval v1 là Task-related capability. Approval state/request/history vẫn độc lập Task Status về semantic và invariant, nhưng không cần generic top-level Approval module. Chỉ tách thành top-level domain nếu future requirement chứng minh Approval được dùng độc lập cho nhiều resource.

DTO, model/entity, enum, constant, error và type có business meaning nằm trong domain sở hữu. Không tạo global root `models/`, `entities/`, `dto/` hoặc dùng `shared/` làm nơi gom domain code.

Ví dụ ownership:

- `OrganizationRole` và Organization-specific error thuộc Organization.
- `ProjectRole` và Project Task Status semantic thuộc Project.
- Task priority, assignment error và Approval state thuộc Task.

### Shared-code rule

`shared/` chỉ chứa primitive/cross-cutting code thật sự cross-domain và không mang business ownership, ví dụ pagination, generic technical/application errors, generic types, decorators, guards, interceptors và stateless utilities.

- Pagination primitive có thể nằm trong `shared/pagination/`; filter như `TaskListQueryDto` vẫn thuộc Task.
- Chỉ error generic như `NotFoundError`, `ConflictError`, `UnauthorizedError` hoặc `ValidationError` mới có thể shared. `LastProjectManagerError`, `InvalidTaskAssigneeError` và `ApprovalRequiredError` thuộc domain tương ứng.
- Không tạo `shared/constants.ts` hoặc `shared/enums/` như kho chứa toàn bộ constant/enum.
- Utility phải stateless, generic và không biết Organization/Project/Task policy. Helper biết business concept phải quay về domain service/policy.

Rule chung:

```text
Business meaning → owning domain
Generic technical primitive → shared, nếu thực sự được reuse
```

### Service decomposition và module communication

Không để layered architecture tạo god service. Khi service chứa nhiều operation độc lập, có thể tách thành focused services như assignment/transition/approval service hoặc selective `use-cases/`. Vertical Slice là kỹ thuật decomposition tùy chọn khi capability lớn lên, không phải top-level architecture rule.

Module giao tiếp qua public service/query contract. Module không tùy ý import raw ORM model, Prisma model/client, repository hoặc internal service của module khác. Ví dụ Task gọi public Project membership/Team membership query service thay vì query internal repository của Project/Team.

Operation cần transaction qua nhiều domain dùng selective coordinator/application service. Không dùng async event để thay thế invariant cần consistency đồng bộ.

### DDD-lite, không full tactical DDD

Domain boundary và business language lấy cảm hứng từ DDD, nhưng không bắt buộc AggregateRoot base class, ValueObject cho mọi primitive, Factory, Specification, Domain Event, Repository interface, Mapper hoặc Presenter. Chỉ sử dụng khi giải quyết complexity thực tế.

## Alternatives Considered

- Package by technical layer ở top-level: quen thuộc nhưng làm business ownership phân tán và tăng cross-domain coupling.
- Monolith không có module boundary: đơn giản ban đầu nhưng dễ tạo raw-model coupling và circular dependency.
- Full Clean/Hexagonal/Tactical DDD cho mọi feature: boundary mạnh hơn nhưng tạo ceremony không cần thiết cho CRUD.
- Vertical Slice cho mọi endpoint: cô lập action tốt nhưng phân mảnh domain model và không cần làm top-level rule hiện tại.
- Microservices: cho phép deploy độc lập nhưng làm transaction, contract và vận hành phức tạp hơn requirement v1.

## Consequences

### Positive

- Transaction và invariant đa domain có thể được bảo toàn trong cùng application/database boundary.
- Domain ownership, supporting-code location và dependency direction dễ dự đoán/review.
- CRUD vẫn ngắn gọn; layer/folder/abstraction chỉ xuất hiện khi có giá trị thực tế.
- Domain-specific DTO/model/enum/error không làm ô nhiễm global shared code.
- Có thể tách API, worker và scheduler thành deployment role mà không tách business service.

### Negative / Trade-offs

- Các module cùng codebase và deployment lifecycle.
- Boundary và ownership rule phải được giữ bằng review/test; NestJS không tự ngăn mọi import sai.
- Một module lớn vẫn cần decomposition nội bộ để tránh god service.
- Public cross-module contract và transaction coordinator cần được giữ hẹp để không trở thành coupling layer mới.

## Scope / Notes

ADR này khóa ba nguyên tắc: top-level theo domain, technical layer nằm trong domain và shared chỉ chứa primitive thật sự cross-domain. Nó không khóa exact folder tree, không yêu cầu folder ceremony và không phải implementation plan. Business modules/invariant vẫn lấy từ Business Scope v0.3 và Target Technical Architecture v0.3.
