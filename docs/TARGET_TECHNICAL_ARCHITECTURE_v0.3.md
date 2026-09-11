# Target Technical Architecture v0.3

> **Trạng thái:** Accepted — Architecture Simplification Review  
> **Ngày:** 2026-08-23  
> **Business baseline:** [`TASKFORGE_BUSINESS_SCOPE_v0.3.md`](./TASKFORGE_BUSINESS_SCOPE_v0.3.md) — Accepted  
> **Phạm vi:** Kiến trúc kỹ thuật mục tiêu; không phải implementation plan, migration script hoặc TypeORM entity/migration.

> **Technology alignment 2026-08-29:** Target Tech Stack Review v0.3 chọn TypeORM + `pg` và TypeORM migrations. Authorization v0.3 dùng centralized Authorization/Query Policy trên PostgreSQL-authoritative relationships; ADR-005 giữ OpenFGA như deferred post-v0.3 option, không phải implementation dependency.

## 1. Mục đích, nguồn sự thật và giới hạn

Tài liệu này chuyển Business Scope v0.3 đã được chấp nhận thành kiến trúc kỹ thuật mục tiêu đủ rõ để review trước khi lập Migration Strategy, Refactor Roadmap hoặc implementation phase.

Thứ tự nguồn sự thật áp dụng trong tài liệu:

1. [`TASKFORGE_BUSINESS_SCOPE_v0.3.md`](./TASKFORGE_BUSINESS_SCOPE_v0.3.md) là nguồn sự thật cho target business behavior và invariant.
2. Source/config/test hiện tại là nguồn sự thật cho current implementation và technical constraint đang tồn tại.
3. [`BACKEND_ARCHITECTURE_PHASE_REVIEW.md`](../BACKEND_ARCHITECTURE_PHASE_REVIEW.md), [`POSTGRESQL_MIGRATION_ASSESSMENT.md`](../POSTGRESQL_MIGRATION_ASSESSMENT.md) và `.spec-kit/` là tài liệu current-state/roadmap tham khảo; quyết định nào còn mang `TEAM_LEAD`, Team-level approval, fixed Task Status hoặc one-user-one-org là legacy đối với target v0.3.
4. README và các roadmap cũ không được dùng để ghi đè Business Scope v0.3 hoặc source hiện tại.

Tài liệu này không:

- sửa production source;
- tạo TypeORM entity/migration hoặc authorization framework mới;
- quy định thứ tự PR/refactor;
- bổ sung custom module, custom workflow, low-code engine hoặc business capability ngoài v0.3;
- tự khóa các business question được Business Scope đánh dấu còn mở.

Các ký hiệu dùng trong tài liệu:

- **SoT**: source of truth giao dịch.
- **Derived**: giá trị tính từ SoT, không được cập nhật độc lập.
- **Projection**: read model được tạo để phục vụ query/UI.
- **Technical state**: trạng thái vận hành không làm thay đổi business scope.
- **TBD**: cần quyết định business hoặc technical riêng trước implementation tương ứng.

## 2. Kết luận kiến trúc

### 2.1. Lựa chọn mục tiêu

TaskForge v0.3 dùng **Domain-oriented Modular Monolith**: top-level source được package theo Domain/Feature, sau đó mới chia technical layer thực dụng bên trong từng domain. Application structure phải đơn giản theo độ phức tạp thật của use case.

```text
Top-level       = Package by Domain / Feature
Inside module   = Controller -> Service/Use Case -> Repository/Data Access
Shared          = chỉ primitive/cross-cutting code không mang business ownership
```

Kiến trúc logic:

```text
HTTP / Worker / Scheduler / CLI
              │
              v
Controller / Consumer
              │
              v
Module Service
  ├── simple CRUD/business rule -> Repository/Data Access
  └── complex invariant         -> explicit Use Case/Policy/Coordinator
                                      │
                                      v
                         Repository/Data Access
                                      │
                                      v
                         PostgreSQL (only target persistence)
```

Dependency rule:

```text
controller/consumer -> module service hoặc explicit use case
service/use case    -> domain policy + repository/data access
repository          -> PostgreSQL qua ORM
domain rule         -> không phụ thuộc HTTP hoặc ORM-specific behavior
```

Đây là dependency flow **bên trong domain module**, không phải root folder organization theo technical layer. Không bắt buộc mọi request phải có Facade, Command Bus, Domain Service, Repository Port và Adapter. CRUD hoặc rule đơn giản ưu tiên `Controller -> Service -> Repository`. Explicit use case/coordinator chỉ dùng cho operation có invariant hoặc transaction phức tạp.

### 2.2. Vì sao Modular Monolith phù hợp

- Quy mô sản phẩm mục tiêu ban đầu là 5–100 active members mỗi Organization; chưa có yêu cầu scale hoặc ownership team đủ để biện minh microservice.
- Các invariant quan trọng thường đi qua nhiều quan hệ trong cùng tenant: Project Manager cuối cùng, Participating Team, Task owning Team, assignee, checklist và approval. Một transaction boundary chung giảm đáng kể distributed-consistency risk.
- Domain v0.3 vừa được chốt và còn nhiều module hoàn toàn mới. Deploy độc lập từng domain ở thời điểm này làm tăng contract/versioning/observability cost trước khi module boundary được kiểm chứng.
- NestJS modular monolith, Redis và BullMQ đã có trong repository; có thể giữ operational knowledge hiện tại trong khi thay domain model.

Trade-off:

- Một deployment unit lớn hơn và không scale độc lập từng domain.
- Nếu module boundary chỉ tồn tại trên cây thư mục nhưng module tiếp tục dùng raw model của nhau, monolith sẽ trở thành tightly coupled monolith.
- Cross-module transaction thuận lợi nhưng dễ bị lạm dụng; application coordinator phải chỉ xử lý business operation thực sự cần nhiều aggregate.

Microservice chỉ cần được đánh giá lại khi có bằng chứng như independent scaling, independent deployment ownership, regulatory isolation hoặc workload profile khác biệt rõ. Không tách service chỉ để biểu diễn domain list.

### 2.3. Deployment unit mục tiêu

Modular Monolith không đồng nghĩa mọi workload phải chạy trong cùng process:

```text
Một codebase / một domain model
├── API process
├── Worker process
└── Scheduler/dispatcher process, nếu cần tránh duplicate scheduling
```

Worker và scheduler là deployment roles của cùng application, không phải microservice sở hữu business data riêng. Chúng dùng cùng application contracts và persistence source of truth.

### 2.4. Quyết định kiến trúc tóm tắt

| ID | Lựa chọn | Alternatives đã xem xét | Trade-off/impact | ADR? |
|---|---|---|---|---|
| TA-01 | Domain-oriented Modular Monolith: package by Domain/Feature; layered architecture thực dụng trong module; use case/coordinator có chọn lọc | Package by technical layer toàn cục; Clean Architecture/DDD ceremony đầy đủ; microservices | Business ownership rõ nhưng không tạo folder/abstraction ceremony | ADR-001 Accepted |
| TA-02 | User global; Organization tenant; active OrganizationMembership là org authorization SoT | Role trong JWT/User; Organization embedded members | Thêm membership lookup/context, đổi lại role nhất quán cho multi-org | Business decision đã khóa |
| TA-03 | Explicit `organizationId` trong tenant query/repository; context/ALS hỗ trợ propagation | Chỉ dựa global ORM middleware/plugin | Verbose hơn nhưng fail-closed và review được | ADR-003 trước roadmap |
| TA-04 | Project, Team là aggregate ngang cấp; Project participant được model hóa bằng hai relation riêng | Project thuộc Team; add Team auto-add members | Thêm join entities nhưng phản ánh đúng invariant | Business decision đã khóa |
| TA-05 | ProjectTaskStatus là Project-owned configuration entity; Task tham chiếu status ID | Global enum; arbitrary workflow engine | Thêm config/query/invariant; không có transition scripting | Business decision đã khóa |
| TA-06 | Approval độc lập Task Status và có append-only history | Approval statuses trong Task; generic edit | Cần command/transaction riêng nhưng giữ đúng semantic/history | Business decision đã khóa; ADR chỉ khi Approval phase cần |
| TA-07 | PostgreSQL là persistence duy nhất của target runtime; MongoDB chỉ là legacy implementation/reference trong refactor | Mongo-first; dual-write/coexistence target; one-shot big-bang | Không xây target domain/adapter mới trên Mongo; capability chưa refactor có thể còn legacy tạm thời nhưng không thuộc target runtime | ADR-002 trước roadmap |
| TA-08 | Application-level explicit tenant scoping là v1 correctness boundary; RLS để hardening sau | RLS bắt buộc ngay; implicit ORM filter | Giảm ORM/pooling complexity ban đầu; vẫn giữ composite FK và integration tests | Deferred hardening |
| TA-09 | Event chỉ tồn tại khi có consumer; Outbox dùng chọn lọc cho side effect quan trọng; BullMQ giữ cho v1 | Outbox mọi event; direct enqueue mọi nơi; Kafka/RabbitMQ | Reliability theo impact, tránh dựng event platform | ADR khi async phase cần |
| TA-10 | Tách QueryService khi read query khác rõ mutation; PostgreSQL query/index trước projection/cache | Full CQRS/event sourcing; projection mọi màn hình | Đơn giản và đo được | ADR chỉ nếu tách read store |
| TA-11 | StoredFile + hai relation TaskAttachment/ProjectFile và một storage service nhỏ | URL string trên Task; enterprise storage pipeline | Giữ đúng access context và Files-module boundary | ADR khi Files phase cần |
| TA-12 | Realtime deferred; REST là authoritative read path | WebSocket/SSE bắt buộc từ đầu | Không chặn v1 | ADR chỉ khi requirement xuất hiện |

## 3. Ràng buộc từ current implementation

Kiến trúc mục tiêu không giữ legacy model chỉ vì source đang có, nhưng phải thừa nhận các seam ảnh hưởng đến migration và compatibility:

- Backend hiện là NestJS 11 modular monolith với Mongoose, Redis, BullMQ và Schedule.
- Service/guard đang inject Mongoose model trực tiếp; Mongoose ObjectId, populate, aggregation và query operator xuất hiện ngoài persistence layer.
- Membership/header/ALS mới chỉ cutover một phần; User và Organization vẫn chứa role/membership information trùng lặp.
- Tenant plugin hiện fail-open khi thiếu ALS và không bảo vệ đầy đủ aggregate, bulk, raw query hoặc worker.
- Team vẫn có `TEAM_LEAD`, Team invitation và `requireApproval`.
- Task vẫn thuộc Team, dùng fixed enum gồm `PENDING_APPROVAL`, lưu `approvedBy`/`rejectionReason` trực tiếp và chưa có Project.
- Notification worker và một số Organization path vẫn dùng legacy global role, tạo authorization/cross-tenant risk.
- Frontend chưa có active workspace/header; route và cache dựa trên global User role, đồng thời có nhiều contract không khớp backend.
- Docker hiện là development-only; API, cron và worker chạy chung process.
- Safety net hiện chỉ có 11 unit tests, chưa có domain, persistence hoặc tenant E2E coverage đủ cho migration lớn.

Những seam này là migration implication, không phải target architecture rule.

## 4. Module map và dependency direction

### 4.1. Domain-oriented modules

| Module | Sở hữu | Trách nhiệm | Dependency được phép |
|---|---|---|---|
| Identity / Authentication | `User`, credential/session, OTP/reset challenge | Global identity, đăng ký, đăng nhập, token/session, profile | Crypto/email infrastructure; không phụ thuộc Organization role |
| Organization | `Organization`, `OrganizationMembership`, `Invitation` | Tenant lifecycle, workspace discovery, Membership role/lifecycle, invitation, Owner invariant | Identity service/read boundary |
| Team | `Team`, `TeamMember` | Organizational grouping và membership; không có Team role | Organization Membership service/query |
| Project | `Project`, `ProjectTeam`, `ProjectMembership`, `ProjectTaskStatus`, `ProjectModuleSetting` | Lifecycle, Participants, Project role, status config, enabled modules | Organization và Team public services/queries |
| Task | `Task`, `TaskAssignee`, `Checklist`, `ChecklistItem`, `Comment`, Approval-related logical concepts | Planning/execution, assignment, owning Team, status/progress, Task discussion và optional Approval độc lập Task Status | Project participation/status và Team membership public queries |
| Files / Storage | `StoredFile`, `TaskAttachment`, `ProjectFile` | File metadata/access, core Task attachment, optional Project library | Task/Project authorization services; storage provider adapter |
| Milestone | `Milestone` | Optional Project milestone lifecycle và Task assignment validation | Project access/configuration |
| Document | `Document` | Optional Project knowledge content và archive | Project access/configuration |
| Risk | `Risk`, Risk–Task mitigation link | Optional Project risk tracking | Project access/configuration và Task existence query |
| Activity | `ActivityEntry` | User-facing collaboration timeline | Committed actions/events có consumer rõ |
| Audit | `AuditLog` | Append-only governance/security evidence | Principal/context và sensitive application services |
| Notification | `Notification`, delivery attempts cần thiết | In-app/email side effect, recipient resolution và delivery | Business events có consumer + authorization queries |

`ProjectModuleSetting` là technical representation của bốn enabled modules cố định. Nó không cho phép user định nghĩa module mới.

Module boundary dựa trên business ownership, không dựa trên số lượng table/entity. Trong v1, Comment và Approval-related concepts thuộc Task module. Approval state/request/history vẫn là logical model độc lập Task Status và có invariant/history riêng; việc không tạo top-level Approval module không làm thay đổi business semantic đó. Chỉ đánh giá tách Approval thành domain độc lập nếu future requirement sử dụng nó cho nhiều resource ngoài Task.

Coordinator không phải một bounded module bắt buộc. Một coordinator/use case được đặt trong application layer của capability phù hợp khi operation thực sự chạm nhiều module, ví dụ complete Project hoặc remove Participating Team. CRUD thông thường tiếp tục dùng module Service trực tiếp.

### 4.2. Dependency graph

```text
Identity
   │
   v
Organization
   │
   ├────────> Team
   │            │
   └────────────┴────> Project
                           │
                           ├────> Task
                           │       └── owns Comment + Approval capabilities
                           │
                           ├────> Milestone
                           ├────> Document
                           ├────> Risk
                           └────> Project Files

Committed domain/integration events
   ├────> Activity
   ├────> Audit
   └────> Notification -> Email / In-app / optional realtime delivery
```

Mũi tên biểu diễn dependency vào **public application/read contract**, không phải quyền truy cập raw table/repository của module khác.

### 4.3. Quy tắc tránh circular dependency

1. Module không đăng ký hoặc inject ORM model/table adapter của module khác.
2. Module export Service/query contract hẹp; không export raw TypeORM `DataSource`/repository để module khác query tùy ý.
3. Interface/port chỉ cần khi có nhiều implementation, external infrastructure boundary, hoặc giúp test/decouple một dependency có giá trị. Không tạo port cho mọi entity theo mặc định.
4. Operation có chiều ngược dependency graph dùng một explicit use case/coordinator thay vì tạo import hai chiều. Ví dụ:
   - `CompleteProject` đọc terminal Task summary rồi gọi Project lifecycle command.
   - `RemoveParticipatingTeam` đọc Task ownership/Project Member dependency trước khi gọi Project command.
   - `ArchiveProjectTaskStatus` phải resolve/migrate Task trước khi status được archive theo policy.
5. Domain event chỉ dùng cho reaction sau khi business state đã commit; không dùng async event để né một invariant cần đồng bộ.
6. Không dùng `forwardRef()` như giải pháp kiến trúc mặc định. Nếu cần `forwardRef()`, boundary phải được review lại.

### 4.4. Cách module giao tiếp

| Trường hợp | Cơ chế |
|---|---|
| CRUD/rule đơn giản | Controller -> Module Service -> Repository/Data Access |
| Query đồng bộ để kiểm tra invariant | Public service/query method trong cùng process và transaction khi cần |
| Command có invariant phức tạp | Explicit use case + domain policy + repository |
| Command chạm nhiều module | Selective coordinator + database transaction |
| Side effect sau commit | Direct BullMQ/event dispatch; selective outbox nếu impact yêu cầu |
| Read-heavy query | QueryService chỉ khi query khác rõ mutation; ưu tiên SQL/index trước projection |
| External integration | Service/adapter nhỏ; domain không phụ thuộc vendor SDK |

### 4.5. Shared concerns

`shared` chỉ chứa primitive/cross-cutting code thực sự ổn định và không mang business ownership:

- `EntityId`, `TenantId`, `Clock`, `IdGenerator`;
- transaction helper/boundary;
- pagination/sort primitives;
- generic application error/result primitives;
- correlation/context primitives;
- correlation/idempotency primitive khi use case thật sự cần;
- base audit metadata như actor/correlation ID.

Domain-specific DTO, model/entity, enum, constant, error, type và policy nằm trong owning module. Pagination primitive có thể shared, nhưng domain filter/query DTO vẫn thuộc domain. Utility trong shared phải stateless, generic và không biết Organization/Project/Task policy.

Không đặt trong shared:

- Organization/Project role hoặc bất kỳ enum có business meaning;
- Project access policy;
- Task Status semantic;
- approval policy;
- domain DTO/model/error/constant;
- ORM models hoặc generic repository có khả năng bypass tenant;
- DTO dùng chung chỉ vì hai endpoint hiện có shape gần giống nhau.

### 4.6. Request principal và tenant context

Principal mục tiêu:

```text
AuthenticatedPrincipal
├── userId
├── sessionId/token metadata cần thiết
└── activeOrganization (chỉ có ở tenant-plane request)
    ├── organizationId
    ├── organizationMembershipId
    └── organizationRole
```

Flow tenant-plane:

```text
Authentication
-> validate X-Organization-Id
-> resolve ACTIVE OrganizationMembership cho authenticated User
-> attach verified activeOrganization vào principal/context
-> authorize resource ownership và role/policy
-> application service/use case truyền organizationId tường minh vào repository
```

JWT không chứa Organization role có thẩm quyền. Nếu token chứa workspace hint để tối ưu UX thì hint đó vẫn phải được đối chiếu Membership trước authorization.

Control-plane use case như workspace discovery và accept invitation không dùng tenant auto-filter, nhưng phải có explicit authorization riêng. Không có khái niệm “skip tenant đồng nghĩa an toàn”.

## 5. Target Domain Model v0.3

### 5.1. Quy ước persistence-neutral

- API xem ID là opaque string. Target PostgreSQL dùng UUID; ADR-004 ghi nhận exact UUID convention, không rò ORM/ID validator vào domain contract.
- Mọi tenant-scoped record có `organizationId` tường minh khi cần cho explicit query scope, composite tenant constraint và index. RLS không phải lý do bắt buộc của v1.
- Mọi relation từ tenant entity sang tenant entity phải bảo đảm cùng `organizationId` bằng composite foreign key khi khả thi và application validation trong mọi trường hợp.
- Chỉ aggregate/command có race thực tế mới cần `version`, expected state hoặc row lock; CRUD đơn giản không bắt buộc optimistic-concurrency ceremony.
- `createdAt`, `updatedAt`, `archivedAt` và actor metadata là technical fields; không thay thế Activity/Audit.
- Archive/soft delete là mặc định cho business data có history. Hard delete chỉ dành cho ephemeral security data, unreferenced storage object sau retention hoặc operational cleanup đã được chấp nhận.
- Không lưu derived value ở nhiều nơi nếu chưa có ownership/invalidation rõ. Nếu materialize vì performance, field đó phải được đánh dấu projection và có cơ chế rebuild/reconcile.

### 5.2. Quan hệ tổng thể

```text
User 1 ─────── N OrganizationMembership N ─────── 1 Organization
                         │                              │
                         │                              ├── N Invitation
                         │                              ├── N Team
                         │                              └── N Project
                         │
                         └── N TeamMember N ─────── 1 Team

Project 1 ─────── N ProjectTeam N ─────── 1 Team
Project 1 ─────── N ProjectMembership N ─ 1 OrganizationMembership
Project 1 ─────── N ProjectTaskStatus
Project 1 ─────── N Task

Task N ────────── 1 ProjectTaskStatus
Task N ────────── 1 owning Team
Task 1 ────────── N TaskAssignee N ─────── 1 ProjectMembership
Task 1 ────────── 0..1 Checklist ───────── N ChecklistItem
Task 1 ────────── 0..1 Approval (logical) ─ N ApprovalRequest/History (logical)
Task 1 ────────── N Comment
Task 1 ────────── N TaskAttachment ─────── 1 StoredFile

Project 1 ─────── N Milestone / Document / Risk / ProjectFile
```

### 5.3. Identity và Organization entities

#### User

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Opaque ID, UUID khi PostgreSQL ADR được chấp nhận |
| Business identity | Normalized email, unique toàn hệ thống |
| Tenant ownership | Global; không có `organizationId`, Organization role hoặc `teamId` |
| Relationships | `1:N` OrganizationMembership; author/actor reference từ business history |
| Lifecycle | Exact global identity suspension/deactivation policy chưa được Business Scope khóa: `TBD-ID-01` |
| Delete/archive | Không hard delete nếu còn Membership/history; anonymization/retention là `TBD-COM-01` |
| Source of truth | Identity/profile/credential ownership; không phải nguồn Organization authorization |
| Derived/cache | Display profile có thể cache; role/workspace không được derive từ User |

#### Organization

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Opaque ID/UUID |
| Business identity | Không có business key bắt buộc trong v0.3; slug nếu giữ là technical locator và uniqueness policy là `TBD-ORG-01` |
| Tenant ownership | Là tenant root; không thuộc tenant khác |
| Relationships | `1:N` Membership, Invitation, Team, Project và tenant-scoped data |
| Lifecycle | Scope có archive/close nhưng chưa khóa exact state/restore transition: `TBD-ORG-02` |
| Delete/archive | Archive/close; không hard delete business graph hoặc history theo application path |
| Source of truth | Organization metadata/lifecycle; Owner không được biểu diễn bằng `ownerId` như authorization SoT |
| Derived/cache | Member/team/project counts là projection |

#### OrganizationMembership

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Membership ID |
| Business identity | Unique `(userId, organizationId)` |
| Tenant ownership | `organizationId` |
| Relationships | `N:1` User, `N:1` Organization; `1:N` TeamMember và ProjectMembership relations |
| Role | Đúng một trong `OWNER`, `ADMIN`, `MEMBER` |
| Lifecycle | `ACTIVE`, `SUSPENDED`, `REVOKED`, `LEFT` |
| Delete/archive | Không hard delete; transition lifecycle và giữ joined/ended metadata |
| Source of truth | Duy nhất cho Organization membership, Organization role và workspace access |
| DB constraints | Unique user/org; tối đa một active Owner bằng partial unique constraint khi PostgreSQL; “phải có đúng một Owner” cần application transaction/locking vì DB index chỉ bảo vệ upper bound |
| Derived/cache | Active workspace list là query; permission cache chỉ được phép có version/invalidation và không được làm chậm revoke |

#### Invitation

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Invitation ID; public token không phải ID và chỉ lưu token hash |
| Business identity | Một pending invitation cho `(organizationId, normalizedEmail)` theo policy; duplicate control bắt buộc |
| Tenant ownership | `organizationId` |
| Relationships | Organization; inviter là active Membership; accept tạo/kích hoạt OrganizationMembership |
| Lifecycle | `PENDING`, `ACCEPTED`, `REJECTED`, `REVOKED`, `EXPIRED` |
| Delete/archive | Giữ history; token material có thể expire/purge theo security retention |
| Source of truth | Invitation intent/lifecycle; không cấp Team/Project permission |
| Cross-entity invariant | Không tạo mới nếu đã có active Membership; accept phải bind đúng email/User theo security policy |

### 5.4. Team entities

#### Team

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Team ID |
| Business identity | Team name uniqueness trong Organization chưa được Business Scope khóa; giữ `TBD-TEAM-01` thay vì biến current index thành business rule mới |
| Tenant ownership | `organizationId` |
| Relationships | `1:N` TeamMember; `N:N` Project qua ProjectTeam; `1:N` owning Task |
| Lifecycle | `ACTIVE`, `ARCHIVED` |
| Delete/archive | Archive mặc định; không archive khi còn unresolved active Project/Task dependency |
| Source of truth | Team metadata và Team lifecycle; không sở hữu Project permission hoặc approval policy |
| Cấm | Không có `TEAM_LEAD`, role tương đương, `requireApproval` hoặc Team-level task authority |

#### TeamMember

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Relation ID hoặc composite key; API dùng opaque ID khi cần |
| Business identity | Unique `(teamId, organizationMembershipId)` |
| Tenant ownership | `organizationId`, đồng nhất với Team và Membership |
| Relationships | `N:1` Team; `N:1` active OrganizationMembership |
| Lifecycle | Scope không định nghĩa TeamMember lifecycle riêng; active relation + removed metadata là technical representation, không có role |
| Delete/archive | Remove không xóa actor/history; relation history được giữ theo audit/retention policy |
| Source of truth | Membership của một người trong Team |
| Cross-entity invariant | Chỉ active OrganizationMembership cùng Organization được add; Membership suspend/revoke/left làm mất execution eligibility mà không xóa lịch sử Team |

### 5.5. Project entities

#### Project

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Project ID |
| Business identity | Không có business key bắt buộc; project name uniqueness là `TBD-PROJ-01` |
| Tenant ownership | `organizationId` |
| Relationships | `1:N` ProjectTeam, ProjectMembership, ProjectTaskStatus, ProjectModuleSetting, Task và optional module data |
| Lifecycle | `DRAFT`, `ACTIVE`, `COMPLETED`, `ARCHIVED` |
| Delete/archive | Archive/read-only; preserve toàn bộ history; hard delete không qua business API |
| Source of truth | Project metadata/lifecycle; Overview không phải entity/SoT |
| Cross-entity invariant | Có ít nhất một Participating Team; ACTIVE có ít nhất một active Project Manager; không complete khi còn non-terminal Task |
| Transition notes | `COMPLETED -> ACTIVE` reopen đã được scope cho phép; exact restore target từ `ARCHIVED` và direct archive transition cần `TBD-PROJ-02` |

#### ProjectTeam / ParticipatingTeam

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Relation ID hoặc composite key |
| Business identity | Unique `(projectId, teamId)` |
| Tenant ownership | `organizationId`, đồng nhất với Project và Team |
| Relationships | `N:1` Project; `N:1` Team |
| Lifecycle | Active participation relation; removal giữ historical event/audit |
| Delete/archive | Không remove khi Team còn owning active Task hoặc làm Project Member mất qualifying Team |
| Source of truth | Tập Participating Teams; tuyệt đối không suy ra Project Members từ relation này |
| DB/application | Composite same-tenant FK ở DB; dependency validation/locking ở application transaction |

#### ProjectMembership / ProjectMember

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | ProjectMembership ID |
| Business identity | Unique `(projectId, organizationMembershipId)`; tương đương tối đa một Project Membership/User/Project |
| Tenant ownership | `organizationId` |
| Relationships | `N:1` Project; `N:1` OrganizationMembership; qualifying membership qua ít nhất một active ProjectTeam + TeamMember |
| Role | Đúng một `PROJECT_MANAGER` hoặc `CONTRIBUTOR` |
| Lifecycle | Active relation; removal/deactivation giữ history. Quyền chỉ có hiệu lực nếu OrganizationMembership còn ACTIVE |
| Delete/archive | Không hard delete; remove bị chặn khi còn active assignment hoặc là PM cuối cùng của ACTIVE Project |
| Source of truth | Duy nhất cho Project participation và Project role |
| DB/application | Unique/FK ở DB; “thuộc ít nhất một Participating Team” và last PM cần application transaction, lock và negative tests |

#### ProjectTaskStatus

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Status ID; Task tham chiếu ID, không lưu display name làm state |
| Business identity | Unique `(projectId, position)`; name uniqueness trong Project là `TBD-STATUS-01` |
| Tenant ownership | `organizationId` qua Project và field tường minh |
| Relationships | `N:1` Project; `1:N` Task |
| Fields | `name`, semantic category, `position`, lifecycle |
| Semantic | `NOT_STARTED`, `IN_PROGRESS`, `REVIEW`, `COMPLETED`, `CANCELLED` là system enum ổn định |
| Lifecycle | `ACTIVE`, `ARCHIVED` |
| Delete/archive | Status đang được Task dùng không hard delete; archive hoặc migrate Task bằng business command |
| Source of truth | Project workflow column configuration; Board render từ active status ordering |
| Derived/cache | Board column list là cache candidate; transition permission không được suy ra từ `position` |
| Invariant | Mỗi Project duy trì ít nhất một active status thuộc `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED` |

Baseline semantic transition được giữ nguyên từ Business Scope:

```text
NOT_STARTED <-> IN_PROGRESS
IN_PROGRESS -> REVIEW
IN_PROGRESS -> COMPLETED
IN_PROGRESS -> CANCELLED
REVIEW -> IN_PROGRESS
REVIEW -> REVIEW
REVIEW -> COMPLETED
REVIEW -> CANCELLED
COMPLETED -> IN_PROGRESS
CANCELLED -> IN_PROGRESS
```

Transition giữa hai status cùng semantic category có thể hợp lệ theo resource policy. `position` không tạo transition graph; v1 không có arbitrary transition scripting. Exact actor permission trên từng transition vẫn là `TBD-AUTH-04`.

Project creation phải tạo một status set thỏa tối thiểu `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED` trong cùng transaction. Default candidate trace trực tiếp từ Business Scope là `To Do -> NOT_STARTED`, `In Progress -> IN_PROGRESS`, `In Review -> REVIEW`, `Done -> COMPLETED`; exact display labels là configuration/UX data và không thay đổi semantic invariant.

#### ProjectModuleSetting

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Unique `(projectId, moduleCode)` |
| Module code | Chỉ `MILESTONES`, `DOCUMENTS`, `FILES`, `RISKS` trong v1 |
| Tenant ownership | `organizationId` |
| Lifecycle | `ENABLED`/`DISABLED` là technical representation của trạng thái cấu hình |
| Delete/archive | Không xóa setting hoặc module data khi disable |
| Source of truth | Việc module có được phép tạo/mutate theo normal flow |
| Default | Bốn module `MILESTONES`, `DOCUMENTS`, `FILES`, `RISKS` đều `ENABLED` khi tạo Project; luôn tạo row setting, không dùng absence như business state mơ hồ |
| Cấm | Không lưu dynamic schema, custom module type hoặc user-defined module metadata |

### 5.6. Task và Approval entities

#### Task

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Task ID |
| Business identity | Không có business key bắt buộc trong v0.3 |
| Tenant ownership | `organizationId` |
| Required relationships | Đúng một Project, một owning Team, một ProjectTaskStatus, một creator identity/Membership context |
| Optional relationships | `0..1` Milestone khi module enabled; `0..N` assignee/comment/attachment/checklist item |
| Workflow lifecycle | Workflow state là ProjectTaskStatus; archive/soft delete là lifecycle dữ liệu riêng, không thêm global Task Status enum |
| Delete/archive | Archive/soft delete; preserve activity, comment, attachment relation và approval history |
| Source of truth | Task management/execution fields và current status reference |
| Derived | Semantic category lấy từ current ProjectTaskStatus; effective progress lấy từ checklist hoặc manual progress rule |
| Concurrency | State/management command dùng expected version/status khi race có ý nghĩa |
| Cross-entity invariant | Project/Team/status cùng tenant; Team là participating; completion kiểm checklist + approval |

Priority vocabulary cụ thể chưa được Business Scope v0.3 khóa; current `LOW/MEDIUM/HIGH` không tự động trở thành target rule. Đánh dấu `TBD-TASK-01` nếu API/schema cần enum chính thức.

#### TaskAssignee

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Relation ID hoặc composite key |
| Business identity | Unique `(taskId, projectMembershipId)` |
| Tenant ownership | `organizationId` |
| Relationships | `N:1` Task; `N:1` active ProjectMembership |
| Lifecycle | Assignment/unassignment relation; Task chỉ có một shared workflow state |
| Delete/archive | Unassign giữ Activity/Audit; không hard-delete evidence cần thiết |
| Source of truth | Tập assignee hiện tại; không lưu per-assignee status |
| Invariant | ProjectMembership active và User đồng thời là TeamMember của current owning Team |
| Enforcement | FK bảo vệ Task/ProjectMembership cùng Project/tenant khi khả thi; Team intersection cần application validation trong cùng transaction với assignment/change owning Team |

#### Checklist và ChecklistItem

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Checklist identity | Logical `0..1` Task-owned component; không cần public aggregate ID nếu persistence không yêu cầu |
| Item identity | ChecklistItem ID unique trong Task; unique `(taskId, position)` khi ordering được lưu |
| Tenant ownership | `organizationId` qua Task và field tường minh nếu là table riêng |
| Relationships | Checklist thuộc đúng một Task; `1:N` ChecklistItem |
| Lifecycle | Item active/soft removed; không có independent business lifecycle |
| Delete/archive | Task archive giữ checklist; item removal giữ activity/audit khi cần |
| Source of truth | Khi có ít nhất một active item, item completion là progress SoT |
| Derived | `completedItems/totalItems`; completed Task có effective 100%; không cho update manual progress khi checklist tồn tại |
| Completion invariant | Mọi active checklist item phải hoàn thành trước semantic `COMPLETED`; scope không định nghĩa optional item flag |

#### Approval

`Approval`, `ApprovalRequest` và `ApprovalHistoryEntry` trong tài liệu này là **logical domain concepts**, không phải yêu cầu phải có đúng ba PostgreSQL table. Chúng mô tả semantic, command, history và invariant cần bảo toàn. PostgreSQL Target Data Model / Schema Design sẽ quyết định có co-locate configuration/current state hay tách thành một hoặc nhiều table; không được dùng lựa chọn physical schema để gộp Approval trở lại Task Status hoặc overwrite history.

Về logic, một Task có optional Approval capability/context. Khi được cấu hình, Approval độc lập Task Status và gắn duy nhất với Task đó.

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Logical identity | Gắn duy nhất với Task; exact physical primary key/table representation được quyết định ở PostgreSQL schema design |
| Tenant ownership | `organizationId` và `projectId` đồng nhất với Task |
| Configuration | `requiresApproval`, designated `approverProjectMembershipId` khi required |
| Logical relationships | `0..1` Approval context trên một Task; `0..N` request và `0..N` append-only history entry |
| Source of truth | Approval configuration, current request reference và approval validity |
| State semantic | `NOT_REQUIRED`, `PENDING`, `APPROVED`, `REJECTED`; status không được suy ra từ Task `REVIEW` |
| Delete/archive | Không hard delete approval/history; Task archive giữ toàn bộ history |
| Invariant | Required approval có đúng một eligible approver; PENDING không thể bị disable qua generic update; Task required không complete nếu chưa có approval hợp lệ |

Business Scope chưa đặt tên state khi `requiresApproval=true`, approver đã cấu hình nhưng chưa request lần nào, hoặc sau khi một request bị cancel. Target model không tự thêm public enum. Biểu diễn kỹ thuật khuyến nghị là `currentRequestId` nullable và derive public semantic; exact API state được đánh dấu `TBD-APP-01`.

Business Scope cũng chưa khóa thay đổi Task nào làm một kết quả `APPROVED` trước đó mất hiệu lực, hoặc khi nào được request approval vòng mới. Đây là `TBD-APP-04`; implementation không được mặc định approval có hiệu lực vĩnh viễn hoặc tự reset khi generic Task edit.

#### ApprovalRequest và ApprovalHistoryEntry

Hai concept dưới đây là logical records. Chúng có thể dùng cùng hoặc khác physical table miễn current request/outcome, actor, timestamp, reason và toàn bộ history vẫn được biểu diễn nhất quán, truy vết được và không bị overwrite.

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Request identity | Logical request ID; idempotency key unique trong command scope; physical key/table do schema design quyết định |
| Tenant ownership | `organizationId`, `projectId`, `taskId` |
| Relationships | Thuộc Approval; requester và designated approver tham chiếu ProjectMembership/identity snapshot phù hợp |
| Request technical lifecycle | `PENDING`, terminal outcome `APPROVED`, `REJECTED`, `CANCELLED`; `CANCELLED` là request outcome phục vụ cancel action, không phải Task Status |
| History identity | Monotonic/UUID entry ID; immutable action `REQUESTED`, `CANCELLED`, `APPROVED`, `REJECTED` với actor, reason, timestamp, request/version |
| Delete/archive | Append-only; application user không sửa/xóa |
| Source of truth | Request hiện tại + immutable history; không overwrite approval cũ |
| Eligibility | Approver phải là active Project Member tại action time; self-approval là `TBD-APP-02` |

Khi Project Membership của approver mất hiệu lực trong lúc request đang PENDING, người đó không được hành động. Cách reassign/cancel request và actor được phép thực hiện là `TBD-APP-03`, không được tự động suy diễn thành PM/Admin approval.

`APPROVED` chỉ làm thỏa approval gate; nó không tự chuyển Task sang semantic `COMPLETED`. `REJECTED` không tự ép Task về một status cụ thể. Mọi Task Status transition tiếp theo vẫn đi qua Task transition policy và được ghi Activity/Audit phù hợp.

### 5.7. Collaboration, file và optional module entities

#### Comment

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Comment ID |
| Tenant ownership | `organizationId`, `projectId`, `taskId` |
| Relationships | Thuộc một Task; author là identity kèm Project Membership context tại thời điểm tạo; mention references chỉ tới candidate hợp lệ |
| Lifecycle | Active, edited, soft-deleted technical state |
| Delete/archive | Soft delete giữ thread/context; moderation action có audit |
| Source of truth | Nội dung và author/edit/delete metadata |
| Derived/side effect | Mention notification là side effect, không nằm trong Comment SoT |

Nested discussion engine và realtime collaborative editing nằm ngoài v1.

#### StoredFile

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | StoredFile ID; storage object key không lộ như authorization token |
| Tenant ownership | `organizationId`; Project context nằm trên relation hoặc metadata được kiểm chứng |
| Relationships | `1:N` TaskAttachment/ProjectFile references có kiểm soát |
| Fields kỹ thuật | Object key, original name, media type, size, checksum, uploader, timestamps và storage state cần thiết |
| Lifecycle | Exact scanning/quarantine/retention state là technical `TBD-FILE-01`; không mở rộng thành document workflow |
| Delete/archive | Business unlink/soft delete trước; physical delete chỉ khi không còn required reference và retention cho phép |
| Source of truth | File metadata và storage locator; object storage giữ bytes |
| Security | Download/upload authorization được kiểm lại theo relation, không dựa vào biết URL/object key |

#### TaskAttachment và ProjectFile

| Relation | Thiết kế mục tiêu |
|---|---|
| TaskAttachment | Core relation `(taskId, storedFileId)`; hoạt động dù Files module disabled; giữ org/project/task context |
| ProjectFile | Optional Files module relation `(projectId, storedFileId)` với project-wide metadata nếu cần |
| Tenant ownership | Organization/Project của relation và file phải đồng nhất |
| Lifecycle | Active/soft removed relation; history/audit reference được bảo toàn |
| Source of truth | Relation quyết định file xuất hiện ở Task hay Project library; không suy diễn relation này từ relation kia |

Một StoredFile có thể được reuse kỹ thuật, nhưng việc reuse giữa Task Attachment và Project Files không tự động cấp visibility ở context còn lại.

#### Milestone

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Milestone ID |
| Tenant ownership | `organizationId`, `projectId` |
| Relationships | Thuộc đúng một Project; Task có `0..1` Milestone cùng Project |
| Lifecycle | Bounded text `OPEN`/`CLOSED`; close and reopen are explicit actions, never derived from progress |
| Delete/archive | Archive/soft delete; disable module không xóa Milestone hoặc Task relation |
| Source of truth | Milestone metadata/deadline/explicit close state |
| Derived | Milestone progress aggregate từ Task; close không được derive tự động từ progress |

#### Document

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Document ID |
| Tenant ownership | `organizationId`, `projectId` |
| Relationships | Thuộc một Project; author identity/Project context |
| Lifecycle | Active/archived/soft-deleted semantics; exact editorial states ngoài scope |
| Delete/archive | Archive/soft delete; disable module block normal mutation nhưng giữ content/history |
| Source of truth | Title, content, author, timestamps và edit metadata tối thiểu |
| Out of scope | Google-Docs-style realtime collaboration, generic knowledge schema |

Content format/versioning chi tiết là `TBD-DOC-01` của module specification; không làm thay đổi core hierarchy.

#### Risk

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Primary identity | Risk ID |
| Tenant ownership | `organizationId`, `projectId` |
| Relationships | Thuộc một Project; owner; `0..N` mitigation Task links cùng Project |
| Lifecycle | Baseline đơn giản `OPEN`, `MITIGATING`, `RESOLVED` |
| Delete/archive | Archive/soft delete; disable module giữ Risk và Task links |
| Source of truth | Title, description, likelihood, impact, owner, mitigation, status |
| Vocabulary/policy | Likelihood and impact use `LOW`/`MEDIUM`/`HIGH`; owner must be an active Project Member in the same Project when assigned |

### 5.8. Activity, Audit và Notification

#### Activity

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Identity | ActivityEntry ID + event/correlation ID để deduplicate |
| Tenant ownership | `organizationId`, thường có `projectId` và optional resource ID |
| Lifecycle | Append-oriented; không cho user sửa business event đã ghi |
| Source classification | User-facing projection từ committed event, không phải business SoT |
| Delete/archive | Retention/visibility policy `TBD-COM-01`; Project archive vẫn đọc history |
| Rebuild | Có thể rebuild một phần nếu event payload bền vững, nhưng v1 không dùng event sourcing |

#### AuditLog

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Identity | Audit ID + correlation/command/event ID |
| Tenant ownership | Organization hoặc global security scope; project/resource context khi có |
| Content | Actor, action, target, timestamp, source, result, reason và safe before/after metadata cần thiết |
| Lifecycle | Append-only đối với application user |
| Source classification | SoT của audit evidence, không phải SoT của business entity/authorization |
| Delete/archive | Chỉ retention/operational policy ngoài application mutation; không chứa password/token/secret |
| Reliability | Sensitive command phải tạo audit record/intent đáng tin cậy; outbox chỉ dùng nếu audit được xử lý async và failure window có impact cần loại bỏ |

#### Notification

| Thuộc tính kiến trúc | Thiết kế mục tiêu |
|---|---|
| Identity | Notification ID; unique deduplication key theo event/recipient/channel |
| Tenant ownership | `organizationId`, Project/resource context khi có |
| Relationships | Recipient là User nhưng eligibility được resolve qua current Membership/Project access |
| Technical lifecycle | Pending/delivered/read/failed/expired tùy channel implementation; không phải business state |
| Delete/archive | User dismissal/read không xóa business/audit event; retention là `TBD-NOTIF-01` |
| Source classification | Side-effect/delivery record, không phải business SoT |
| Invariant | Revalidate recipient ở send time; duplicate controlled; failure không rollback state đã commit |

Kênh v1 là in-app và email cho event quan trọng. Realtime chỉ là delivery enhancement và chưa được Business Scope bắt buộc.

Notification coverage tối thiểu gồm Organization invitation, Task assignment, due/overdue reminder, approval request và approval result. Mỗi recipient vẫn phải được revalidate theo Organization/Project context tại delivery time.

### 5.9. Source-of-truth summary

| Dữ liệu | Phân loại |
|---|---|
| User, Organization, Membership, Team, Project, Participants | Transactional SoT |
| ProjectTaskStatus và ProjectModuleSetting | Transactional configuration SoT |
| Task, TaskAssignee, ChecklistItem | Transactional SoT |
| Approval configuration/request/history | Transactional SoT; history append-only |
| Comment, StoredFile metadata và file relations | Transactional SoT |
| Milestone, Document, Risk | Transactional SoT khi module enabled hoặc preserved while disabled |
| Task semantic category | Derived từ referenced ProjectTaskStatus |
| Task progress khi có checklist | Derived từ active ChecklistItem |
| Project/Milestone progress, workload, dashboard counts | Derived/projection |
| Board columns | Query từ ProjectTaskStatus; cache candidate |
| Activity | User-facing projection |
| AuditLog | Append-only audit evidence; không phải domain entity state |
| Notification | Side-effect/delivery state |
| Redis/RTK Query data | Cache/operational state; không phải business SoT |

## 6. Authorization Model

### 6.1. Ba authorization context độc lập

```text
Global context
  authenticated User

Organization context
  ACTIVE OrganizationMembership
  role = OWNER | ADMIN | MEMBER

Project context
  active ProjectMembership
  role = PROJECT_MANAGER | CONTRIBUTOR
```

Không có role inheritance giữa các context:

- OWNER/ADMIN không tự trở thành Project Member hoặc Project Manager.
- Project Manager không có Organization administration permission.
- TeamMember không tạo Project permission.
- Designated approver không cần là Project Manager; người đó chỉ cần hợp lệ theo approval policy.
- Administrative fallback là explicit command path có audit, không phải hidden role elevation.

### 6.2. Authorization evaluation flow

Mọi tenant-plane action đánh giá theo thứ tự fail-closed:

```text
1. Authentication
2. ACTIVE OrganizationMembership cho requested Organization
3. Resource thuộc đúng Organization
4. Organization role requirement, nếu action thuộc tenant governance
5. ACTIVE ProjectMembership, nếu action thuộc Project execution
6. Project role requirement
7. Team/Task/resource relationship
8. Business state, enabled module và field policy
9. Concurrency precondition/expected version
```

Centralized Authorization/Query Policy là boundary application dùng chung cho access/manage và visibility filtering. Nó đọc authoritative Membership/resource relationships từ PostgreSQL, không phải một framework/provider abstraction mới. Domain Policy vẫn chạy sau authorization để giữ business-state invariant trong transaction.

Biết một resource ID hợp lệ không cấp visibility. API không nên tiết lộ cross-tenant existence; 404/403 contract cụ thể cần nhất quán và được khóa trong API specification.

### 6.3. Permission matrix

Ký hiệu:

- **Có**: role là điều kiện đủ trong context đã xác thực, trừ business state invariant.
- **Có điều kiện**: cần thêm Project Membership, ownership, assignment hoặc policy.
- **Không**: role đó không cấp action.
- **Fallback**: chỉ explicit administrative fallback có reason/audit; chi tiết là TBD.

| Action | Organization OWNER | Organization ADMIN | Project Manager | Contributor | Resource/business condition |
|---|---:|---:|---:|---:|---|
| Quản lý Organization metadata thường | Có | Có theo org policy | Không | Không | Owner-only fields tách riêng |
| Transfer Owner, archive/close Organization | Có | Không | Không | Không | Atomic; không mất Owner cuối cùng |
| Invite/change/suspend/revoke Organization Member | Có | Có theo policy | Không | Không | Không được phá last Owner invariant |
| Xem tenant-wide governance data | Có | Có | Không | Không | Read visibility không cấp mutation permission |
| Tạo/sửa/archive Team và TeamMember | Có | Có | Không | Không | Team không có role; dependency phải được resolve trước archive |
| Tạo Project | Có | Có | Không mặc định | Không | Creator setup theo Project creation policy |
| Xem Project | Có cho governance | Có cho governance | Có | Có | Owner/Admin visibility không biến thành Project role |
| Sửa Project metadata | Fallback hoặc đồng thời là PM | Fallback hoặc đồng thời là PM | Có | Không | Fallback detail `TBD-AUTH-01` |
| Quản lý Participating Teams | Fallback hoặc PM | Fallback hoặc PM | Có | Không | Dependency checks bắt buộc |
| Add/remove/change Project Member role | Fallback hoặc PM | Fallback hoặc PM | Có | Không | Last PM, active Membership và qualifying Team invariants |
| Cấu hình Project Task Status | Fallback hoặc PM | Fallback hoặc PM | Có | Không | Không phá required semantic/status references |
| Enable/disable module | Fallback hoặc PM | Fallback hoặc PM | Có | Không | Disable giữ data và block normal mutation |
| Tạo Task | Chỉ khi có Project execution right | Chỉ khi có Project execution right | Có | Có theo Project policy | Owning Team/status/assignee hợp lệ; Contributor creation policy `TBD-AUTH-02` |
| Sửa Task management fields | Chỉ khi PM hoặc fallback | Chỉ khi PM hoặc fallback | Có | Hạn chế/TBD | Creator được set giá trị hợp lệ lúc create; quyền sau create `TBD-AUTH-03` |
| Assign/unassign Task | Chỉ khi PM hoặc fallback | Chỉ khi PM hoặc fallback | Có | Không mặc định | Assignee intersection invariant |
| Đổi owning Team | Chỉ khi PM hoặc fallback | Chỉ khi PM hoặc fallback | Có | Không | Revalidate toàn bộ assignee và dependency |
| Transition Task Status | Chỉ khi có execution right | Chỉ khi có execution right | Có | Có điều kiện | Creator/assignee/resource ownership và exact transition permission `TBD-AUTH-04` |
| Sửa manual progress khi không checklist | Chỉ khi có execution right | Chỉ khi có execution right | Có | Có điều kiện | Không cho manual progress khi checklist tồn tại |
| Sửa checklist | Chỉ khi có execution right | Chỉ khi có execution right | Có | Có điều kiện | Task visibility/execution policy |
| Cấu hình `requiresApproval`/approver trước request | Không chỉ nhờ org role | Không chỉ nhờ org role | Chỉ khi đồng thời thỏa Task policy | Creator/assignee theo policy | Exact field-level policy `TBD-AUTH-03`; approver phải hợp lệ |
| Request Approval | Không chỉ nhờ org role | Không chỉ nhờ org role | Có nếu thỏa Task policy | Creator/assignee theo policy | Task non-terminal, configured approver, không có pending request |
| Cancel Approval | Không chỉ nhờ org role | Không chỉ nhờ org role | Có nếu được policy cho phép | Requester/actor theo policy | Explicit reason/history; exact actor policy `TBD-APP-03` |
| Approve/reject | Chỉ khi designated approver | Chỉ khi designated approver | Chỉ khi designated approver | Chỉ khi designated approver | Active eligible Project Member tại action time; self-approval `TBD-APP-02` |
| Comment | Có nếu visibility/moderation | Có nếu visibility/moderation | Có | Có | Active Project Member có visibility; moderation theo scope |
| Upload Task Attachment | Chỉ khi có Task execution right | Chỉ khi có Task execution right | Có | Có điều kiện | Không phụ thuộc Files module; storage policy áp dụng |
| Quản lý Project Files | Fallback hoặc PM | Fallback hoặc PM | Có | Module policy `TBD-FILE-02` | Files module phải enabled |
| Quản lý Milestone | Fallback hoặc PM | Fallback hoặc PM | Có | Không mặc định | Milestones module enabled |
| Quản lý Document/Risk | Theo moderation/fallback policy | Theo moderation/fallback policy | Có theo module policy | Ownership policy `TBD-DOC-02`/`TBD-RISK-02` | Module enabled |
| Complete/reopen/archive Project | Fallback hoặc PM | Fallback hoặc PM | Có | Không | Lifecycle, terminal Task và audit invariant |
| Xem Organization Audit Log | Có | Có | Không mặc định | Không | Tenant governance only |

Owner/Admin thực hiện fallback phải dùng command được đặt tên rõ, cung cấp reason, ghi Audit Log và không tạo/ghi ngầm ProjectMembership. Exact set action được phép fallback là `TBD-AUTH-01`.

### 6.4. Task field boundaries

**Management fields**:

- owning Team;
- assignees;
- priority;
- due date;
- approval configuration;
- Milestone assignment khi module enabled.

**Execution fields/capabilities**:

- current ProjectTaskStatus;
- manual progress khi không có checklist;
- checklist;
- comment;
- Task Attachment;
- title/description trong phạm vi field policy.

Không có generic policy `editTask` cấp quyền cho mọi field. API command/update DTO và application authorization phải phản ánh hai nhóm này. Exact quyền Contributor đối với title/description/priority/due date sau khi tạo là `TBD-AUTH-03`.

### 6.5. Defense-in-depth

- Presentation guard cung cấp fail-fast UX/security, nhưng sensitive application command vẫn kiểm tra principal/resource/business policy.
- Repository tenant-scoped luôn nhận `organizationId`; không có `findById(id)` cho tenant entity.
- PostgreSQL target dùng composite FK/check/unique. RLS là hardening có thể bổ sung sau, không phải v1 correctness dependency.
- Query/list/search/aggregate/export/worker áp dụng cùng visibility policy với detail API.
- Permission cache, nếu có, không được cho phép quyền sau khi Membership/ProjectMembership đã mất hiệu lực.

## 7. Aggregate và Transaction Boundary

### 7.1. Aggregate boundaries

| Aggregate/boundary | Thành phần | Không chứa |
|---|---|---|
| Organization | Organization metadata/lifecycle | Toàn bộ Membership collection như in-memory child list |
| OrganizationMembership | Membership role/lifecycle | User identity hoặc Project roles |
| Invitation | Invitation lifecycle/token hash | Team/Project permission |
| Team | Team metadata/lifecycle | Team role; Project Members; Task |
| Project | Project metadata/lifecycle | Task collection |
| Project Participants | ProjectTeam và ProjectMembership commands coordinated under Project policy | Team members được auto-copy |
| Project Configuration | ProjectTaskStatus và ProjectModuleSetting | Arbitrary workflow/module schema |
| Task | Task fields, status reference, TaskAssignee, Checklist items theo persistence boundary phù hợp | Approval history, comments, file bytes |
| Approval (trong Task module) | Approval configuration, requests và history | Task workflow status |
| Comment (trong Task module) | Một Comment và edit/delete metadata | Full Task aggregate |
| StoredFile | File metadata/storage locator | Task/Project permission tự suy diễn |
| Milestone/Document/Risk | Mỗi resource là aggregate trong Project | Project role layer mới |
| Activity/Audit/Notification | Append/projection/delivery record | Business entity state |

Aggregate boundary không đồng nghĩa top-level module boundary: một domain module có thể sở hữu nhiều aggregate. Aggregate nhỏ không có nghĩa operation luôn chỉ ghi một table. Application transaction coordinator được dùng khi invariant đi qua nhiều aggregate/domain.

### 7.2. Multi-aggregate operations

| Operation | Atomic write/read set | Concurrency control | Failure rule |
|---|---|---|---|
| Create Organization | Organization + OWNER Membership + General Team + creator TeamMember | Transaction; unique membership/owner/team constraints | Rollback toàn bộ; không tồn tại Organization không Owner |
| Transfer Owner | Current Owner Membership + target Membership | Lock Organization/owner set; conditional role updates | Không có thời điểm commit với 0 hoặc >1 active Owner |
| Create Project | Project + ít nhất một selected/default Participating Team + ít nhất một ProjectMembership PM + default status config + module settings defaults nếu có | Transaction; validate active Membership/Team | Rollback toàn bộ setup; solo flow dùng General + creator PM, không ép flow khác phải dùng creator/General |
| Add Project Member | Project + OrganizationMembership + ProjectTeam/TeamMember eligibility + new ProjectMembership | Transaction snapshot/locks phù hợp | Không tạo member nếu eligibility thay đổi trước commit |
| Remove/demote Project Manager | ProjectMembership set | Lock Project/active PM set; conditional update | Reject nếu làm ACTIVE Project mất PM cuối cùng |
| Remove Participating Team | ProjectTeam + ProjectMembership eligibility + Task owning-team dependencies | Coordinator transaction; lock ProjectTeam/dependency rows | Reject đến khi dependency được xử lý hợp lệ |
| Suspend/revoke/leave OrganizationMembership | Membership + dependent ProjectMemberships, Task assignments, pending approvals và last Owner/PM checks | Cross-module coordinator; lock Membership/dependent authority rows | Không để active Project mất PM, invalid assignee/approver hoặc Organization mất Owner; dependency phải được resolve |
| Remove TeamMember | TeamMember + ProjectMember qualification + Task assignment/approval dependencies | Cross-module coordinator; expected relation version/locks | Không làm Project Member mất qualifying Team hoặc Task assignee trở nên invalid |
| Assign Task | Task + ProjectMembership + TeamMember | Transaction/conditional version | Không tạo invalid assignee |
| Change owning Team | Task + target ProjectTeam + current assignees/TeamMembers | Lock Task; expected version; validate all assignees | Reject hoặc yêu cầu explicit reassignment; không silently drop assignee |
| Transition Task | Task + target ProjectTaskStatus + checklist + Approval summary | Lock/conditional version; semantic policy | Không commit partial status/progress/approval bypass |
| Request Approval | Approval config + new request/history; notification intent nếu chọn selective outbox | Unique pending request + version/conditional transition | Chỉ một pending request; DB state không phụ thuộc queue success |
| Cancel/approve/reject | Current pending request + history + Approval current state; selective notification intent | Conditional `PENDING` update/version | Một competing command thành công; history không overwrite |
| Complete Project | Project + terminal Task query snapshot | Lock Project; transaction isolation/consistent check | Reject nếu còn Task non-terminal |
| Enable/disable module | ProjectModuleSetting + required Audit record | Expected setting version nếu có race | Disable không xóa module data |
| Archive Team/Project | Aggregate + dependency query + required Audit record | Lock target/dependencies khi cần | Không orphan relation; archive giữ history |

### 7.3. Invariant enforcement matrix

| Invariant | Database | Domain/application | Cần cả hai? |
|---|---|---|---:|
| Unique User email | Unique normalized/case-insensitive constraint | Normalize và map conflict | Có |
| Unique Membership user/org | Unique constraint | Membership lifecycle policy | Có |
| Tối đa một active Owner | Partial unique constraint PostgreSQL | Transfer/role command | Có |
| Luôn có đúng một active Owner | DB không bảo vệ lower bound đầy đủ | Lock + transaction + policy | Application chính |
| Team/Project/child cùng Organization | Composite FK/constraint khi khả thi | Explicit tenant checks | Có |
| TeamMember là active org member | FK tới Membership; lifecycle không thể chỉ bằng FK | Add/revoke policy và transaction | Có |
| Unique ProjectTeam/ProjectMembership | Unique constraints | Command idempotency/error mapping | Có |
| Project có ít nhất một Participating Team | Không thuận tiện bằng declarative constraint | Creation/removal transaction | Application chính |
| Project Member thuộc qualifying Participating Team | Same-tenant FKs hỗ trợ nhưng không bảo vệ existential relation đầy đủ | Eligibility query + locks/test | Application chính |
| ACTIVE Project có PM | DB có thể bảo vệ upper/unique, không lower bound | Lifecycle/member command transaction | Application chính |
| Owning Team là Participating Team | Composite FK từ Task `(org, project, team)` tới ProjectTeam | Task command validation | Có |
| Status thuộc cùng Project | Composite FK `(org, project, status)` | Transition/config policy | Có |
| Required semantic statuses luôn tồn tại | DB enum/check bảo vệ category, không bảo vệ per-Project minimum dễ dàng | Status config transaction | Application chính |
| Status đang dùng không hard delete | FK restrict | Archive/migrate command | Có |
| Assignee là Project Member và TeamMember | Composite FK có thể bảo vệ bằng redundant org/project/team keys; exact DDL cần review | Assignment/owning Team transaction | Có |
| Checklist là progress SoT | Check range cho manual field | Domain calculator; block conflicting update | Có |
| Checklist complete trước Task complete | Không phù hợp row check đơn giản | Transition transaction | Application chính |
| Approval độc lập status | Physical representation chưa khóa; constraint/index phải hỗ trợ model được chọn | Separate logical state, commands và policy; không dùng Task Status làm Approval state | Có |
| Required approval trước semantic COMPLETED | Không phù hợp FK/check đơn giản | Transition transaction đọc Approval validity | Application chính |
| Một pending approval request | Partial unique constraint hoặc conditional update | Approval state machine | Có |
| Module disabled block mutation | Setting FK không đủ | Module gate trong application policy | Application chính |
| Project complete chỉ khi terminal Tasks | DB check không phù hợp aggregate rows | Consistent query + lock/isolation | Application chính |
| Audit append-only | DB permissions; không expose update/delete | Audit API/query policy | Có |

Không đề xuất trigger cho mọi invariant ngay từ đầu. Trigger chỉ nên dùng khi declarative FK/index và application transaction không đủ sau review, vì trigger làm business rule khó discover/test qua ORM.

### 7.4. Task completion policy

Task transition sang status có semantic `COMPLETED` phải thực hiện như một business command:

```text
load Task with expected version
-> load active target ProjectTaskStatus in same Project
-> authorize transition/resource relationship
-> if checklist exists: require all active items completed
-> if requiresApproval: require valid APPROVED result for current approval configuration/request
-> update Task status atomically
-> effective progress becomes 100
-> ghi Audit/Activity intent phù hợp; publish side effect nếu có consumer
```

Task semantic `CANCELLED` là terminal nhưng không phải completed work và không được dùng completion metric numerator.

### 7.5. Project lifecycle policy

- `DRAFT`: cấu hình/participants/status setup; vẫn phải thỏa invariant Project được tạo với ít nhất một Participating Team theo baseline.
- `ACTIVE`: execution enabled; phải có active Project Manager.
- `COMPLETED`: chỉ khi mọi Task ở semantic `COMPLETED` hoặc `CANCELLED`; normal flow không tạo active work mới.
- `ARCHIVED`: read-only trừ restore/administrative command; giữ history.
- `COMPLETED -> ACTIVE` là explicit reopen command có Activity/Audit.
- Chỉ `COMPLETED -> ARCHIVED`; restore là administrative command `ARCHIVED -> COMPLETED`.

### 7.6. Module enable/disable policy

Mọi optional module command thực hiện gate:

```text
active Organization Membership
-> Project visibility/role
-> ProjectModuleSetting == ENABLED
-> resource ownership/state policy
```

Disable chỉ thay setting và phát event/audit. Nó không cascade delete, null Task–Milestone/Risk links hoặc xóa file/document. Normal create/update/archive action của module bị block khi disabled; read/history vẫn khả dụng theo visibility policy. Administrative data-retention operation là luồng riêng, không phải module disable.

## 8. Persistence Architecture

### 8.1. Current persistence assessment

Current runtime dùng MongoDB/Mongoose và phụ thuộc không chỉ ở schema:

- Mongoose model được inject trực tiếp vào controller-adjacent service và guard.
- ObjectId, populate, document method, aggregation và update operator xuất hiện trong application logic.
- Embedded arrays đang biểu diễn Organization members, invitations, Team members, checklist và assignees.
- Tenant correctness phụ thuộc một phần vào implicit global plugin/ALS.
- Mongo transaction cần replica set; DB mutation và BullMQ enqueue chưa atomic.
- DTO/API hiện làm lộ Mongo-specific ID validation.

Target v0.3 có mật độ quan hệ và invariant cao hơn đáng kể: Membership, TeamMember, ProjectTeam, ProjectMembership, ProjectTaskStatus, TaskAssignee, Approval history, comments, file relations và optional modules. Việc giữ document embedding làm nguồn chính sẽ tăng duplicate relation, cross-document invariant và update race.

### 8.2. Các hướng đã xem xét

| Hướng | Lợi ích | Chi phí/risk | Kết luận |
|---|---|---|---|
| Refactor target domain trên MongoDB trước | Ít thay đổi hạ tầng ban đầu | Xây relational domain hai lần, tiếp tục weak constraints, dễ trì hoãn PostgreSQL | Không chọn |
| Thay toàn bộ domain và PostgreSQL trong một big-bang | Chỉ có một target persistence | Blast radius lớn khi test/API hiện còn yếu; rollback khó | Không chọn |
| PostgreSQL trực tiếp theo bounded capability | Mỗi capability mới đi thẳng target schema; không đầu tư target Mongo adapter | Legacy Mongo code có thể còn tạm ở capability chưa refactor | Chọn; trạng thái chuyển tiếp này không phải cross-database target runtime |

### 8.3. Recommendation

**Quyết định: PostgreSQL là persistence duy nhất của target architecture; TypeORM là infrastructure detail.**

Target runtime sau khi refactor hoàn tất:

```text
TaskForge
    ↓
PostgreSQL
```

MongoDB chỉ là legacy implementation/reference để hiểu behavior cũ trong lúc refactor. Target không có permanent Mongo/PostgreSQL coexistence, dual-write, target Mongo adapter hoặc cross-database domain architecture. Việc legacy Mongo code còn tồn tại trong một capability chưa cutover chỉ là trạng thái chuyển tiếp của implementation, không phải thành phần của target runtime.

Lý do:

1. Domain v0.3 có nhiều N:N relation, FK và multi-row invariant phù hợp PostgreSQL.
2. Xây target domain mới trên MongoDB tạo double rewrite mà không đem lại giá trị v1.
3. Refactor theo capability vẫn kiểm soát blast radius: phần chưa chuyển có thể tiếp tục chạy legacy tạm thời, nhưng phần đã chuyển dùng PostgreSQL làm authoritative store.
4. Không dual-write hoặc xây long-lived Mongo/PostgreSQL adapter coexistence mặc định.

Quyết định này không phải authorization tạo TypeORM entity/migration trong task hiện tại. Target Domain Model và ADR persistence/identifier phải được review trước schema đầu tiên.

### 8.4. Vì sao PostgreSQL phù hợp target domain

- Foreign key/composite foreign key thể hiện same-tenant relation giữa Project, Team, Status, Task và child entities.
- Unique/partial unique constraint bảo vệ Membership, ProjectMembership, pending approval request và active Owner upper bound.
- ACID transaction và row-level locking phù hợp last Owner/PM, participant removal, Task completion và approval race.
- SQL tự nhiên cho Project Overview, Board/List filter, My Tasks, workload, approval queue và report theo nhiều relation.
- RLS có thể bổ sung defense-in-depth sau khi application scoping và schema đã ổn định; nó không phải điều kiện để PostgreSQL phù hợp domain.
- Schema migration history giúp review destructive/constraint change rõ hơn document schema drift.

PostgreSQL không tự giải quyết authorization hoặc mọi business invariant. Last Owner/PM lower bound, existential Team participation, checklist completion và approval validity vẫn cần application/domain transaction.

### 8.5. Target persistence boundaries

- Controller không thao tác TypeORM `DataSource`/repository trực tiếp; business rule không phụ thuộc TypeORM-specific behavior.
- Service/use case dùng repository hoặc data-access class có boundary rõ. Không bắt buộc tạo repository interface/adapter cho mọi entity nếu chỉ có một implementation và abstraction không giúp test/decouple.
- Tenant-scoped data access nhận `organizationId` tường minh và trả application/output model, không trả raw TypeORM entity qua API.
- QueryService có thể dùng TypeORM QueryBuilder hoặc parameterized SQL khi Board/List/Search khác rõ transactional CRUD, nhưng vẫn enforce tenant/visibility.
- Multi-row operation dùng transaction helper/context; không cần generic Unit of Work framework cho CRUD đơn giản.
- Database error được map thành stable domain/application error.
- API ID validation dùng opaque/UUID contract sau ADR, không `IsMongoId` trong target DTO.
- JSONB chỉ dành cho payload kỹ thuật linh hoạt như outbox/audit-safe metadata, không dùng thay relational core model hoặc custom schema.

### 8.6. Tenant isolation và RLS

V1 correctness boundary là application-level explicit scoping:

- tenant request phải resolve active OrganizationMembership;
- tenant-scoped query/mutation nhận `organizationId` rõ ràng và fail-closed khi thiếu;
- resource ownership được kiểm tra, không chỉ tin ID/header;
- composite FK/unique constraint bảo vệ same-tenant relation khi khả thi;
- integration/E2E test bao phủ read, write, aggregate và worker.

PostgreSQL RLS được xếp **LATER / security hardening**. Chỉ đánh giá triển khai sau khi schema, TypeORM transaction/pooling và application tenant tests đã ổn định. Khi đó ADR riêng phải khóa runtime DB role, transaction-local tenant context, `USING`/`WITH CHECK` và system-operation bypass. Architecture Acceptance và v1 correctness không phụ thuộc RLS.

### 8.7. ID, legacy data và rollback

- Target recommendation là UUID; frontend phải coi ID là opaque.
- MongoDB là legacy implementation/reference trong refactor, không phải target runtime hoặc target adapter.
- Nếu data chỉ là development/demo, không cần production-grade ETL; có thể reset và tạo lại dữ liệu bằng PostgreSQL seed sau khi owner xác nhận. Legacy Mongo schema/code chỉ dùng để tham chiếu behavior cũ.
- Nếu có data bắt buộc giữ, ObjectId→UUID mapping, validation và rollback là Migration Strategy concern riêng: `TBD-MIG-01`.
- Không dual-write mặc định. Yêu cầu downtime thấp/production data thực nếu có phải được chứng minh trước khi thêm compatibility architecture: `TBD-MIG-02`.
- Một capability đã cutover hoàn chỉnh dùng PostgreSQL làm authoritative store; legacy Mongo implementation của capability đó được loại bỏ thay vì duy trì lâu dài.

### 8.8. Persistence decision cần ADR

Trước Refactor Roadmap chỉ cần ADR khóa:

- PostgreSQL là persistence duy nhất của target runtime và không dual-write mặc định;
- ORM/data-access boundary thực dụng;
- ID strategy;
- explicit tenant scoping và composite constraint convention.

RLS, data ETL/rollback chi tiết và isolation tuning được quyết định ở security hardening hoặc migration phase tương ứng.

## 9. API Boundary

### 9.1. Nguyên tắc

- Version API tường minh, ví dụ `/api/v1`.
- ID là opaque; response DTO không lộ ORM document/record.
- Control-plane và tenant-plane được phân biệt.
- Tenant-plane request dùng verified active Organization context; nếu tiếp tục header switching, `X-Organization-Id` là bắt buộc và được đối chiếu Membership.
- Generic PATCH chỉ dùng cho field thực sự là normal editable metadata.
- State transition/dependency-sensitive operation là explicit business command.
- Sensitive command hỗ trợ idempotency key và expected version/ETag khi retry/race có ý nghĩa.
- Stable error code phân biệt authorization, invalid transition, dependency conflict và concurrency conflict.

Exact URI naming là API specification concern; bảng dưới khóa resource/command semantics, không khóa controller implementation.

### 9.2. Control-plane resources

| Resource/action | Loại | Ý nghĩa |
|---|---|---|
| `/auth/*` | Authentication command | Register identity, verify, login, refresh, logout, reset |
| `/me` | Resource | Global profile, không chứa Organization role |
| `/me/organizations` | Query | Active/visible Memberships cho workspace discovery |
| `/organizations` | Resource/command | Create Organization atomic onboarding operation |
| `/invitations` hoặc token-specific endpoint | Query/command | List/accept/reject invitation theo authenticated identity/token policy |

Signup chỉ tạo User. Create Organization là command riêng tạo Organization + OWNER Membership + General Team + TeamMember.

### 9.3. Tenant-plane resources

Resource hierarchy khuyến nghị:

```text
/organization-memberships
/invitations
/teams
/teams/{teamId}/members
/projects
/projects/{projectId}/participating-teams
/projects/{projectId}/members
/projects/{projectId}/task-statuses
/projects/{projectId}/modules
/projects/{projectId}/tasks
/projects/{projectId}/activity
/projects/{projectId}/milestones
/projects/{projectId}/documents
/projects/{projectId}/files
/projects/{projectId}/risks
/tasks/{taskId}
/tasks/{taskId}/assignees
/tasks/{taskId}/checklist-items
/tasks/{taskId}/comments
/tasks/{taskId}/attachments
/tasks/{taskId}/approval
/approval-requests/{requestId}
/audit-logs
/notifications
```

Project nesting thể hiện query/context, nhưng authorization vẫn kiểm tra resource relationship; path có đúng `projectId` không đủ.

### 9.4. CRUD và business command

| Capability | Normal CRUD/resource mutation | Explicit business command |
|---|---|---|
| Organization | Read/update metadata | Transfer Owner, archive/close, restore nếu policy cho phép |
| Membership | Read/list | Invite, accept/reject/revoke invitation; change role; suspend/revoke/leave Membership |
| Team | Create/read/update metadata | Add/remove member; archive/restore Team sau dependency check |
| Project | Create/read/update metadata | Activate, complete, reopen, archive, restore |
| Participants | Read collection | Add/remove Participating Team; add/remove Project Member; change Project role |
| Task Status | Create/read/rename khi policy cho phép | Reorder statuses; archive status; migrate Tasks khỏi status nếu cần |
| Modules | Read settings | Enable/disable fixed module |
| Task | Create/read/update normal field subset | Assign/unassign, change owning Team, transition status, archive/restore |
| Checklist | Add/edit/reorder item | Toggle/complete item có progress side effect; bulk operation nếu được spec hóa |
| Approval | Configure trước pending | Request, cancel, approve, reject |
| Comment | Create/edit own content | Soft delete/moderate |
| Attachment/File | Create metadata/link sau upload | Remove/archive relation; physical deletion là storage operation riêng |
| Milestone | CRUD metadata | Close/reopen/archive |
| Document/Risk | CRUD theo module policy | Archive/restore và state command khi có |

Không ép `completeProject`, `removeParticipatingTeam`, `transitionTask`, `requestApproval`, `approve` hoặc `disableModule` vào generic PATCH.

### 9.5. Command contracts

Business command input tối thiểu có thể gồm:

```text
resource ID
expected version/current state nếu cần
target state/resource
reason khi operation cần audit/cancel/reject/fallback
idempotency key cho retryable create/action
```

Command response trả updated representation hoặc accepted command result ổn định. Notification/email success không nằm trong synchronous success criteria.

### 9.6. Workspace và frontend contract

- Frontend lưu `activeOrganizationId` tách khỏi User.
- Organization role lấy từ selected OrganizationMembership.
- Project role lấy từ ProjectMembership của từng Project, không đưa vào global auth slice.
- Switch workspace phải reset hoặc namespace mọi tenant RTK Query cache, cancel/ignore stale response và điều hướng tới route hợp lệ.
- Backend luôn là authority; frontend permission chỉ phục vụ UX.
- API response không dùng global `user.role`, `user.organization`, Team role hoặc fixed status labels.

## 10. Domain Event và Async Boundary

### 10.1. Nguyên tắc

Domain/integration event ghi nhận một fact đã được business command chấp nhận. TaskForge v1 không dùng event sourcing; current entity rows vẫn là transactional SoT.

Phân loại:

```text
Synchronous transaction
  validate + authorize + mutate business SoT
  + ghi Audit record cần thiết
  + optional selective outbox intent nếu side effect quan trọng
  -> trả thành công

Asynchronous side effects
  Activity projection
  Notification/in-app/email
  Reminder
  Realtime delivery
  Analytics/non-critical projection
```

Không publish event trước commit. Không dùng Notification, Activity hoặc realtime payload để quyết định business state.

### 10.2. Candidate events, không phải implementation checklist

Danh sách dưới chỉ là vocabulary candidate. Chỉ tạo event khi đã có consumer/use case rõ; không phát event chỉ vì event được liệt kê trong architecture document.

| Domain | Event candidates |
|---|---|
| Identity/Organization | `UserRegistered`, `OrganizationCreated`, `OrganizationArchived`, `OwnerTransferred` |
| Membership/Invitation | `MemberInvited`, `InvitationAccepted`, `MembershipRoleChanged`, `MembershipSuspended`, `MembershipRevoked`, `MembershipLeft` |
| Team | `TeamCreated`, `TeamMemberAdded`, `TeamMemberRemoved`, `TeamArchived` |
| Project | `ProjectCreated`, `ProjectActivated`, `ProjectCompleted`, `ProjectReopened`, `ProjectArchived` |
| Participants | `ParticipatingTeamAdded`, `ParticipatingTeamRemoved`, `ProjectMemberAdded`, `ProjectMemberRemoved`, `ProjectRoleChanged` |
| Project configuration | `ProjectTaskStatusCreated`, `ProjectTaskStatusChanged`, `ProjectModuleEnabled`, `ProjectModuleDisabled` |
| Task | `TaskCreated`, `TaskAssigned`, `TaskUnassigned`, `TaskOwningTeamChanged`, `TaskStatusChanged`, `ChecklistChanged`, `TaskArchived` |
| Approval | `ApprovalConfigured`, `ApprovalRequested`, `ApprovalCancelled`, `ApprovalApproved`, `ApprovalRejected` |
| Collaboration/files | `CommentAdded`, `CommentDeleted`, `TaskAttachmentAdded`, `TaskAttachmentRemoved`, `ProjectFileAdded` |
| Optional modules | `MilestoneChanged`, `DocumentChanged`, `RiskChanged` với action metadata cụ thể |

Event payload phải chứa verified `organizationId`, aggregate ID/version, actor/correlation ID và chỉ dữ liệu tối thiểu cần cho consumer. Không truyền ORM document, secret hoặc toàn bộ object tùy tiện.

### 10.3. Synchronous và asynchronous responsibility

| Concern | Sync trước success | Async sau commit |
|---|---:|---:|
| Business validation/authorization | Có | Không |
| Entity state/relationship/approval history | Có | Không |
| Durable audit intent cho sensitive action | Có | Có thể materialize sau từ durable intent |
| Activity timeline | Không bắt buộc | Có |
| In-app notification | Không | Có |
| Email | Không | Có |
| Reminder scheduling/delivery | Không | Có |
| Realtime push | Không | Có |
| Analytics/read projection không critical | Không | Có |

### 10.4. BullMQ và selective Outbox

BullMQ tiếp tục phục vụ email, notification và reminder vì repository đã có Redis/BullMQ. Không thêm Kafka/RabbitMQ.

Direct enqueue sau commit có failure window. Mức reliability được chọn theo impact:

| Side effect | Default v1 |
|---|---|
| Invitation, important assignment, approval request/result, critical async audit intent | Xem xét Outbox để lưu durable intent cùng transaction |
| Realtime refresh, non-critical Activity, analytics | Best-effort event/job; không bắt buộc Outbox |
| Business state | Luôn commit đồng bộ trong PostgreSQL; không phụ thuộc queue |

Outbox là **selective reliability pattern**, không phải hạ tầng bắt buộc cho mọi event. Chỉ phase có side effect quan trọng mới cần ADR/implementation cho outbox table, dispatcher, retry và cleanup. Consumer vẫn cần idempotency khi BullMQ có thể redeliver.

### 10.5. Notification recipient và scheduler

- Recipient được resolve từ verified OrganizationMembership/ProjectMembership, không từ global User role.
- Consumer revalidate access/status ở delivery time; revoked user không nhận nội dung tenant mới.
- Payload chỉ mang IDs; consumer reload safe data trong tenant context.
- Cron cross-tenant dùng system query được đặt tên rõ và job key đủ để kiểm soát duplicate.
- Nếu deployment có nhiều scheduler replica, khi đó mới thêm leader/lock; một deployment v1 không cần dựng scheduler coordination platform trước.
- Reminder không gửi cho Task terminal/archived hoặc recipient không còn eligible.

### 10.6. Realtime

Business Scope yêu cầu in-app Notification và Activity, nhưng không khóa push latency/transport. Vì vậy:

- Realtime là async adapter từ committed event/projection.
- WebSocket, SSE hoặc polling là `TBD-RT-01` sau khi có latency, connection, hosting và client requirement.
- Realtime disconnect không ảnh hưởng business transaction.
- Client luôn có REST/query path để reload authoritative representation.

## 11. Read Model, Projection và Cache

### 11.1. Tách query khi có giá trị thực tế

TaskForge v0.3 không yêu cầu CQRS, command bus, separate read database hoặc event sourcing. Một module CRUD đơn giản có thể dùng cùng một Service cho command và query. Chỉ tách `QueryService` khi read shape khác đáng kể với write model, ví dụ Task Board, search/filter hoặc dashboard aggregate.

Mặc định, query đọc trực tiếp PostgreSQL bằng SQL/ORM có index phù hợp. Projection/materialized view/cache chỉ được thêm sau khi query thực tế và số liệu vận hành chứng minh cần thiết. Mọi query luôn nhận tenant/principal visibility context và không bypass module policy.

### 11.2. Read-heavy use cases

| Use case | Transactional source | Read shape/projection | Cache candidate |
|---|---|---|---:|
| Project Overview | Project, participants, statuses, Tasks, enabled module summaries | Indexed aggregate query trước; projection chỉ khi đo được | Chưa cần mặc định |
| Task Board | Active ProjectTaskStatus + Tasks + assignees | Columns ordered by status position, paginated cards | Chưa cần mặc định |
| Task List | Task relations | Filtered/paginated rows | Dựa DB indexes trước |
| My Tasks | TaskAssignee + active Membership/ProjectMembership | Assigned/due/overdue by active workspace | Dựa DB indexes trước; invalidation quyền là critical nếu cache |
| Dashboard | Task/approval/project aggregates | Indexed aggregate query trước | Projection/cache chỉ khi đo được |
| Activity timeline | ActivityEntry | Cursor-paginated entries | Chưa cần mặc định |
| Search/filter | Task + Project/Team/status/Milestone relations | Indexed relational query/full-text nếu cần | Query/result cache chỉ sau measurement |
| Workload | Assignments + terminal semantic/category | Counts/grouping theo Team/Project/User | Projection chỉ khi đo được |
| Approval queue | Pending ApprovalRequest + designated approver + Task | Approver-specific list | DB index trước; cache không cần thiết ban đầu |

### 11.3. Projection rules

- Project Overview không sở hữu state riêng.
- Board không sở hữu column state ngoài ProjectTaskStatus configuration và Task status reference.
- Activity có thể eventual consistent; Audit reliability cao hơn và không được gộp với Activity.
- Nếu tạo projection, row phải chứa tenant key và thông tin đủ để deduplicate/reconcile.
- Nếu materialize projection, phase triển khai đó phải định nghĩa rebuild/reconciliation path.
- Search/report dùng cùng resource visibility với detail; không tạo “report bypass”.

### 11.4. Cache policy

- PostgreSQL/index/query optimization là lựa chọn đầu tiên cho quy mô v1; không thêm Redis cache cho mọi query.
- Cache candidate sau measurement: Project status configuration, Project Overview/dashboard aggregate và stable lookup metadata.
- Không cache raw authorization decision dài hạn. Membership/ProjectMembership revoke phải có immediate hoặc bounded, documented invalidation.
- Cache key bắt buộc có Organization và visibility-relevant dimension.
- Frontend cache bắt buộc namespace/reset theo active Organization và Project context.
- Redis failure không được làm mất business state; cache miss fallback về SoT.

Cross-Organization “My Tasks” dashboard chưa được scope xác định rõ là tổng hợp toàn bộ workspace hay chỉ active workspace: `TBD-READ-01`.

## 12. Optional Project Modules và Files/Storage

### 12.1. Fixed module registry

Registry v1 là code-defined và chỉ có:

```text
MILESTONES
DOCUMENTS
FILES
RISKS
```

`ProjectModuleSetting` chỉ lưu enabled/disabled state cho bốn code trên. Không có table/config cho custom entity, custom module, dynamic schema hoặc low-code builder.

### 12.2. Dependency matrix

| Module | Phụ thuộc Project | Quan hệ với Task | Khi disabled | Không được làm |
|---|---|---|---|---|
| Milestones | Project ownership, visibility, module setting | Task có optional một Milestone cùng Project | Giữ Milestone và Task relation; block normal create/update/assign | Không tự close theo progress; không tạo role |
| Documents | Project ownership, visibility, module setting | Không có required Task relation trong baseline | Giữ content/history; block normal create/edit/archive flow theo policy | Không trở thành realtime collaborative editor |
| Files | Project ownership, visibility, module setting | Không điều khiển Task Attachment | Giữ ProjectFile metadata/relation; block Project library mutation | Không tắt/xóa Task Attachment |
| Risks | Project ownership, visibility, module setting | Có thể link mitigation Tasks cùng Project | Giữ Risk/link; block normal create/update | Không tạo permission layer hoặc Issue domain mới |

### 12.3. Milestones

- Milestone module sở hữu Milestone lifecycle/metadata.
- Task chỉ lưu optional Milestone reference; assignment command phải xác minh module enabled, Milestone active/assignable và cùng Project.
- Khi module disabled, existing Task reference vẫn được đọc để giữ history nhưng không được gán/chuyển Milestone theo normal flow.
- Milestone progress là query aggregate từ Task semantic state/progress; explicit close/reopen vẫn là command.
- Milestone dùng bounded text `OPEN` hoặc `CLOSED`; close/reopen là command explicit.

### 12.4. Documents

- Document là content được TaskForge sở hữu, không chỉ là uploaded file.
- StoredFile có thể được Document tham chiếu sau khi module specification yêu cầu, nhưng Document content và file bytes không bị đồng nhất.
- Read dựa trên active Project participation/governance visibility.
- Contributor author/edit/archive policy chi tiết là `TBD-DOC-02`.
- Collaborative editing realtime, nested document database và external editor replacement nằm ngoài v1.

### 12.5. Files và Task Attachment

Kiến trúc tách ba lớp:

```text
Object Storage
  bytes/object key

StoredFile
  metadata, tenant, uploader, checksum, access/storage state

Business relations
  TaskAttachment (core)
  ProjectFile   (Files module)
```

Task Attachment:

- không query `ProjectModuleSetting(FILES)` khi add/read attachment;
- authorize qua Task visibility/execution policy;
- luôn giữ Organization, Project và Task context;
- có thể dùng cùng upload/storage adapter với Project Files.

Project Files:

- chỉ mutate khi Files module enabled;
- authorize qua Project Files policy;
- là project-wide library, không tự attach file vào Task.

Object storage target:

- dùng một `StorageService`/adapter nhỏ để tách provider khỏi business code; không cần framework abstraction nhiều lớp;
- `StoredFile` giữ metadata và tenant/resource relationship; object key không phải public permission token;
- mọi download phải authorize bằng quan hệ business trước khi lấy nội dung hoặc cấp quyền truy cập tạm thời;
- provider, direct upload hay server upload, signed URL hay stream, checksum, cleanup orphan, file-size/type policy, malware scanning và retention là quyết định theo phase (`TBD-FILE-01`), không phải yêu cầu kiến trúc v1 upfront.

### 12.6. Risks

- Risk owner và mitigation Task phải cùng Project/Organization.
- Risk status baseline có thể dùng `OPEN`, `MITIGATING`, `RESOLVED` như Business Scope.
- Risk resolution không tự complete mitigation Task và Task completion không tự resolve Risk.
- Probability/impact dùng `LOW`, `MEDIUM`, `HIGH`; Risk owner phải là active Project Member cùng Project khi create/assign. Detailed contributor edit policy vẫn được quyết định trong module specification.

## 13. Testing Implications

Tài liệu này không tạo test. Mỗi phase triển khai phải bổ sung test cho invariant thuộc chính phase đó; không dựng trước test infrastructure cho feature chưa được implement. Test pyramid ưu tiên domain/policy unit test, repository/database integration test và một tập E2E security/business flow nhỏ nhưng bắt buộc.

### 13.1. Test layers

| Layer | Mục tiêu | Không nên làm |
|---|---|---|
| Domain unit | Semantic transition, lifecycle policy, checklist/approval decision, permission rules thuần | Mock ORM/HTTP rồi gọi đó là domain test |
| Application unit | Service/use-case orchestration, error mapping và field-level authorization | Mock trực tiếp ORM API ở mọi service |
| Repository integration | FK/unique/check, query scoping, mapping, transaction rollback/locking | Chỉ test happy path bằng in-memory fake |
| Authorization integration | Principal + Membership + Project role + resource relationship | Chỉ test frontend hidden button |
| E2E | Critical cross-module flow và negative tenant cases | Dựa scaffold Hello World hoặc shared state DB không kiểm soát |
| Worker/async integration | Retry, dedup/idempotency và recipient revalidation của job đã triển khai; Outbox chỉ khi phase dùng nó | Assume queue delivery exactly-once |
| Frontend contract | Workspace header/cache, role-context UI, API DTO/error handling | Dùng global User role làm fixture target |

### 13.2. Ưu tiên test theo phase

- **Organization/Membership:** tenant isolation, onboarding atomic, active Membership, last Owner và workspace context.
- **Team/Project participants:** Team không có role, add Team không auto-add Member, Project Member eligibility và last Project Manager.
- **Task/status/checklist:** owning Team, assignee intersection, Project status ownership, checklist/progress và completion gate.
- **Approval:** approval độc lập status, request/cancel/approve/reject history, completion gate và competing action.
- **Optional modules:** disabled-module mutation và history preservation khi từng module được triển khai.
- **Async/files/realtime:** chỉ thêm integration test khi capability tương ứng được triển khai.

### 13.3. Target invariant test matrix — tài liệu tham chiếu, không phải upfront checklist

| Invariant | Unit | DB integration | Authorization | E2E |
|---|:---:|:---:|:---:|:---:|
| Tenant isolation find/list/update/delete/search/report |  | Có | Có | Có |
| Header org không có active Membership |  |  | Có | Có |
| Last Organization Owner | Có | Có concurrency | Có | Có |
| Team không có role/Lead authority | Có |  | Có | Có contract |
| Suspend/revoke/leave Membership có dependent PM/assignee/approver | Có | Có transaction | Có | Có |
| Remove TeamMember làm mất Project eligibility | Có | Có transaction | Có | Có |
| Add Team không auto-add Project Members | Có | Có relation count | Có | Có |
| Invalid Project Member không active/không qualifying Team | Có | Có | Có | Có |
| Last Project Manager | Có | Có concurrency | Có | Có |
| Remove Participating Team có unresolved dependency | Có | Có transaction | Có | Có |
| Owning Team không tham gia Project | Có | Có composite FK | Có | Có |
| Invalid assignee không thuộc Project/Team intersection | Có | Có | Có | Có |
| Status khác Project hoặc archived | Có | Có FK | Có | Có |
| Required semantic status cuối cùng bị archive | Có | Có transaction | Có | Có |
| Checklist chưa xong nhưng complete Task | Có | Có rollback | Có | Có |
| Checklist là progress SoT | Có | Có | Có | Có |
| Required approval chưa hợp lệ nhưng complete Task | Có | Có rollback | Có | Có |
| Pending approval bị generic edit disable | Có | Có conditional update | Có | Có |
| Task mutation làm approval cũ mất hiệu lực theo policy đã chốt | Có | Có version/history | Có | Có |
| Competing approve/reject/cancel | Có | Có race test | Có | Có |
| Archived Project mutation | Có |  | Có | Có |
| Disabled module mutation và history preservation | Có | Có | Có | Có |
| Complete Project còn non-terminal Task | Có | Có consistency/concurrency | Có | Có |
| Notification recipient bị revoke/cross-tenant | Có | Có worker test | Có | Có |
| Audit append-only/no secret | Có | Có permissions | Có | Có sampled flow |

### 13.4. Database-specific verification cho PostgreSQL

- Apply migration từ database trống và từ supported previous version.
- Unique/partial unique/composite FK/check constraint.
- Transaction rollback cho onboarding và multi-aggregate command.
- Row locking/isolation cho last Owner/PM và Project completion race.
- Explicit Organization scoping, composite constraint và negative tenant queries.
- Nếu phase sau bật RLS: test `USING`, `WITH CHECK`, missing tenant setting, pooled connection reuse và runtime role.
- Nếu phase dùng Outbox: test claim concurrency/idempotency.

Testcontainers hoặc disposable PostgreSQL instance phù hợp hơn mock cho lớp này. Exact tool được chọn trong test/persistence ADR, không phải business decision.

### 13.5. Contract và frontend tests

- Auth response không có authoritative Organization role trên User.
- Workspace switch gắn đúng header và không hiển thị stale tenant cache.
- Project role thay đổi theo Project, không theo global route tree.
- Board render status name/order từ API configuration.
- Approval UI không derive từ `REVIEW` status.
- Disabled module navigation/mutation phản ánh server policy nhưng server vẫn là authority.

## 14. Technical Risks và TBD Register

### 14.1. Rủi ro ưu tiên cao

| Risk | Nguyên nhân | Impact | Architecture response |
|---|---|---|---|
| Cross-tenant data leak | Implicit/fail-open scope, raw model, worker/global User role | Security-critical | Explicit Organization scope trong application/data access, composite constraints, negative E2E và verified recipient; RLS là hardening về sau |
| Mixed authorization SoT | User.role, Organization.members, Membership cùng tồn tại | Quyền sai giữa workspaces | Membership/ProjectMembership là SoT duy nhất; legacy fields không tồn tại trong target |
| Domain + DB change quá rộng | Project model mới và PostgreSQL cùng thay trên nhiều capability | Regression/rollback khó | Chuyển trực tiếp từng bounded capability sang PostgreSQL, giữ phase nhỏ và có test/cutover criteria; không dual-write mặc định |
| Circular module coupling | Project/Task/optional supporting modules cần data nhau | Nest `forwardRef`, raw repository leak | Dependency DAG, public service/query contract và coordinator chỉ cho operation thực sự đa module |
| Last Owner/PM race | Concurrent remove/demote | Tenant/Project mất authority | Lock/version/transaction + DB constraints + race tests |
| Invalid participant/assignee after relation change | Team/Membership/Project relation bị revoke/remove | Orphan permission/assignment | Dependency-aware commands và same-transaction revalidation |
| Approval bypass/race | Generic Task edit hoặc competing action | Invalid completion/history loss | Separate aggregate, explicit commands, conditional state/version, append history |
| Project completion race | Task tạo/transition đồng thời với complete | Completed Project có active Task | Lifecycle gate + consistent transaction/lock strategy ADR |
| DB/queue dual-write gap | Direct enqueue sau mutation | Missing/duplicate side effect | Phân loại reliability theo consumer; BullMQ + idempotency, selective Outbox chỉ cho side effect critical |
| File authorization/orphan bytes | Object key/direct upload thiếu business relation | Data leak/storage leak | StoredFile metadata và relation-based auth; upload/cleanup/retention quyết định trong Files phase |
| Read model visibility drift | Dashboard/search query khác detail policy | Cross-tenant/project leak | Shared authorization filter specification + query/E2E tests |
| Mongo legacy tồn tại quá lâu | Capability đã cutover nhưng Mongo implementation vẫn được giữ | Hai nguồn sự thật và compatibility debt | PostgreSQL là SoT của capability đã cutover; xóa Mongo path tương ứng, không duy trì long-lived adapter/dual-write |

### 14.2. Architecture Blocking TBD

**Không còn Architecture Blocking TBD (`0`).** Các quyết định đủ để chuyển sang ADR/refactor-roadmap review đã được khóa ở mức kiến trúc:

- Modular Monolith với module boundary đơn giản;
- PostgreSQL là persistence duy nhất của target runtime, MongoDB là legacy reference và không dual-write mặc định;
- tenant isolation v1 dựa trên active Membership + explicit Organization scope + relational constraints; RLS là hardening về sau;
- UUID là target identifier và API coi ID là opaque;
- domain/authorization invariants lấy Business Scope v0.3 làm source of truth.

Các TBD dưới đây có thể chặn contract hoặc implementation của **feature tương ứng**, nhưng không chặn kiến trúc tổng thể.

### 14.3. Deferred Feature Decision — không tự khóa bằng implementation

| ID | Câu hỏi/quyết định hoãn | Chỉ chặn phase/capability |
|---|---|---|
| TBD-APP-02 | Có cho self-approval không? | Approval eligibility policy/tests |
| TBD-AUTH-03 | Contributor được sửa management fields sau create đến mức nào? | Task field command/policy |
| TBD-AUTH-01 | Owner/Admin administrative fallback cụ thể gồm action nào? | Command surface/audit; không auto-elevate |
| TBD-AUTH-04 | Exact Task transition permission theo role/relationship? | Task transition policy |
| TBD-AUTH-02 | Contributor tạo Task theo Project policy nào? | Task-create specification |
| TBD-APP-01 | Public approval state trước request/sau cancel được gọi là gì? | Approval API contract |
| TBD-APP-03 | Ai được cancel/reassign khi pending approver mất eligibility? | Approval edge-case commands |
| TBD-APP-04 | Task change nào làm approval cũ mất hiệu lực; khi nào request vòng mới? | Approval validity/lifecycle |
| TBD-ORG-02 | Exact Organization archive/close/restore lifecycle? | Organization lifecycle commands |
| TBD-PROJ-02 | Exact archive/restore transitions của Project? | Project lifecycle commands |
| TBD-READ-01 | My Tasks chỉ active workspace hay cross-workspace? | My Tasks/dashboard contract |
| TBD-ID-01 | Global User suspension/deactivation semantics | Identity lifecycle; không thay Membership lifecycle |
| TBD-ORG-01 | Có giữ slug; uniqueness/global URL semantics | Organization addressing, không authorization |
| TBD-TEAM-01 | Team name có unique trong Organization không? | Team validation/schema |
| TBD-PROJ-01 | Project name uniqueness policy? | Project validation/schema |
| TBD-STATUS-01 | Status display-name uniqueness trong Project? | Status configuration |
| TBD-TASK-01 | Priority vocabulary? | Task DTO/UI |
| TBD-FILE-02 | Contributor permission trong Project Files? | Files module |
| TBD-DOC-01 | Document content format/versioning? | Documents module |
| TBD-DOC-02 | Document author/editor/moderation policy? | Documents module |
| TBD-RISK-02 | Contributor create/edit/archive Risk policy? | Risks module |

### 14.4. Technical / Operational Decision — quyết định đúng phase

| ID | Quyết định | Thời điểm khóa |
|---|---|---|
| TBD-COM-01 | Retention/anonymization cho User, Activity, Audit và business history | Khi có legal/operational requirement |
| TBD-FILE-01 | Storage provider, upload flow, signed URL/stream, size/type, scanning, cleanup và retention | Trước phase Files/Attachment |
| TBD-NOTIF-01 | Notification retention/preferences và delivery SLA | Trước phase Notification production |
| TBD-RT-01 | Polling, SSE hay WebSocket; latency/hosting requirement | Khi realtime có requirement được đo |
| TBD-MIG-01 | Mongo data là disposable hay cần ETL production-grade | Trước migration dữ liệu môi trường có state cần giữ |
| TBD-MIG-02 | Có downtime requirement đặc biệt buộc kỹ thuật cutover phức tạp không? | Trước production cutover; dual-write vẫn không là mặc định |
| TBD-RLS-01 | Có bật PostgreSQL RLS sau application scoping không? | Sau security/performance assessment của persistence đã chạy |
| TBD-CACHE-01 | Query nào thực sự cần Redis/projection? | Sau profiling/measurement |

### 14.5. Legacy assumptions gây conflict

- `User.organization`, `User.role`, `User.team`.
- `Organization.owner` hoặc `Organization.members[]` như authorization SoT.
- Strict one-user-one-org invitation flow.
- `TEAM_LEAD`, Team role, TeamLeadGuard và Team-level management authority.
- Team-level `requireApproval`.
- Project ngầm đồng nhất với Team hoặc Task chỉ thuộc Team.
- Project permission suy từ Team membership.
- Fixed global Task Status enum, đặc biệt `PENDING_APPROVAL`/`REJECTED`.
- Approval auto-complete/reject auto-transition Task và overwrite một rejection reason.
- Admin/Owner mặc định là approver.
- Dashboard/API/frontend route dựa trên global role.
- Tenant plugin ngầm là correctness boundary duy nhất.
- Attachment là URL string không metadata/access relation.

## 15. Migration Implications — Capability Classification

Phần này chỉ phân loại impact; không phải executable refactor roadmap.

### 15.1. Có thể giữ về bản chất

| Capability | Phần có thể giữ | Giới hạn |
|---|---|---|
| NestJS modular application | Framework/bootstrap/module composition | Boundary hiện tại cần siết; không giữ raw-model coupling |
| JWT/refresh/OTP mechanics | Global identity authentication concepts | Security hardening và onboarding phải refactor; role không nằm trên User/JWT authority |
| Membership concept | User–Organization relation, unique pair, active workspace guard direction | Lifecycle/role ownership/write paths chưa hoàn tất |
| Tenant header + ALS | Workspace selection và context propagation | Repository phải explicit/fail-closed; ALS không là correctness duy nhất |
| Redis/BullMQ | OTP operational store và internal async job infrastructure | Reliability, recipient scope và worker deployment phải refactor; Outbox chỉ thêm cho flow cần mức reliability đó |
| ValidationPipe/DTO validation | Reject unknown input và transform | DTO target không phụ thuộc Mongo ID/raw document |
| Basic Team metadata/membership | Team là Organization grouping | Loại toàn bộ Team role/invitation authority/approval policy |
| Basic Task fields | Title, description, priority concept, due date, creator, multi-assignee, checklist/progress skeleton | Project/status/permission/approval model thay đổi lớn |
| Atomic conditional update technique | Race-safe state mutation | Áp dụng vào target version/state, không giữ legacy status semantics |
| Compound tenant indexes/explicit aggregate match intent | Tenant-aware query optimization | Target constraints/query được thiết kế lại theo relational model |

### 15.2. Refactor

- Identity/auth onboarding: signup chỉ tạo User; workspace create/accept invitation tách riêng.
- OrganizationMembership lifecycle, Owner transfer, role/revoke/suspend/leave path.
- Organization control-plane authorization và workspace discovery.
- Team membership thành relation không role, có archive/dependency checks.
- Task field model, assignment/update validation, checklist progress và archive.
- Frontend active workspace, tenant header, API contract, cache namespace/reset và project-centric navigation.
- Async jobs, recipient revalidation, retry/dedup và worker separation; scheduler leadership chỉ khi deploy nhiều scheduler replica.
- API response DTO/error/version/idempotency contracts.
- Tests, Docker, observability và deployment roles.

### 15.3. Replace

- Global User/Organization role model bằng OrganizationMembership SoT.
- Embedded Organization members/invitations bằng first-class relations/entities.
- Team role/TeamLead authorization bằng Organization governance + Project role model.
- Team-centric Task authorization bằng Project participation/resource policy.
- Fixed Task Status enum bằng ProjectTaskStatus entity.
- Status-coupled approval fields/flow bằng Approval aggregate và history.
- Raw Mongoose models xuyên module bằng PostgreSQL repository/data-access nằm trong module; interface/port chỉ dùng khi có seam thực tế.
- Implicit fail-open tenant plugin làm correctness boundary bằng active Membership + explicit Organization-scoped query + relational constraints; RLS là hardening về sau.
- Admin/User route tree và dashboards dựa global role bằng workspace/project-context UX.
- URL-string attachment bằng StoredFile metadata + contextual relations.

### 15.4. Remove khỏi target model

- `TEAM_LEAD`, `TEAM_MEMBER` role enum và promote Team Lead operation.
- `TeamLeadGuard` và Team Lead dashboard/permission.
- Team-level `requireApproval`.
- `PENDING_APPROVAL` và `REJECTED` như Task Status.
- `approvedBy`/single overwritten `rejectionReason` như approval history model.
- `User.role`, `User.organization`, `User.team` authorization fields.
- `Organization.members[]` như membership source.
- Team invitation flow nếu nó cấp collaboration authority ngoài Organization invitation; v0.3 chỉ chốt Organization invitation rồi Owner/Admin add Team Member.
- API/selector dựa trên global `user.role`.
- Stale Team-centric seed/dashboard/report assumptions.

### 15.5. Add mới

- Project aggregate/lifecycle.
- ProjectTeam và ProjectMembership với hai Project roles.
- ProjectTaskStatus và semantic category model.
- ProjectModuleSetting.
- Project-aware Task, TaskAssignee intersection invariants.
- Independent Approval/request/history.
- Comment, Activity, Audit Log, in-app Notification.
- StoredFile, TaskAttachment và ProjectFile.
- Milestone, Document, Risk.
- Project Overview, Board/List, My Tasks, workload, approval queue query models.
- Selective cross-module coordinator và transaction helper cho operation nhiều invariant; Outbox/idempotent consumer chỉ cho async flow critical.
- Production-grade tenant/persistence/security test boundaries.

Định hướng cutover là trực tiếp theo capability:

```text
Legacy Mongo capability
        ↓ implement + verify target capability
PostgreSQL becomes authoritative
        ↓ remove corresponding legacy path
No long-lived dual write / no permanent Mongo adapter
```

Việc chia phase/cutover order thuộc Migration Strategy và Refactor Roadmap sau tài liệu này, không được suy diễn thành migration implementation tại đây.

## 16. Architecture Decision Records

### 16.1. Priority ADR — Accepted

| ADR | Quyết định đã ghi nhận | Accepted direction | Lý do cần ADR |
|---|---|---|---|
| [ADR-001 Domain-oriented Modular Monolith & Internal Layering](../.spec-kit/adr/ADR-001-modular-monolith.md) | Top-level domain ownership, internal layering, shared-code rule và module communication | Package by Domain/Feature; layered architecture thực dụng trong module; selective use case/coordinator | Chi phối source organization và ngăn cả cross-domain coupling lẫn folder ceremony |
| [ADR-002 PostgreSQL Target & Persistence Boundary](../.spec-kit/adr/ADR-002-postgresql-persistence.md) | Target DB, target runtime và ORM coupling | PostgreSQL là persistence duy nhất của target runtime; ORM là infrastructure detail; không dual-write | Chi phối schema/cutover và loại ambiguity Mongo-vs-PostgreSQL |
| [ADR-003 Tenant Isolation v1](../.spec-kit/adr/ADR-003-tenant-isolation.md) | Correctness boundary cho request/worker/query | Active Membership + explicit Organization scope + relational constraints + negative tests; RLS để later hardening | Security-critical và ảnh hưởng mọi data-access path |
| [ADR-004 Identifier Strategy](../.spec-kit/adr/ADR-004-identifier-strategy.md) | ObjectId/UUID/public API ID | UUID v4 target, API ID opaque | Ảnh hưởng FK, data conversion, DTO và frontend contract |

Bốn ADR này hoàn tất architecture baseline cần thiết trước PostgreSQL Target Data Model / Schema Design và Refactor Roadmap.

### 16.2. Deferred ADR — chỉ tạo khi phase có requirement thực tế

- [ADR-005 OpenFGA Relationship-Based Authorization](../.spec-kit/adr/ADR-005-openfga-rebac.md) được defer tới sau v0.3; không có server/SDK/tuple/projection/reconciliation/provider abstraction trong roadmap hiện tại.
- Approval concurrency/validity policy khi Approval phase bắt đầu và các business TBD liên quan đã được chốt.
- Transactional Outbox khi một async side effect có reliability requirement đủ cao; BullMQ vẫn là queue hiện tại.
- Object storage khi triển khai Attachment/Files và đã biết provider/security/retention requirement.
- Read model/projection/cache khi profiling cho thấy PostgreSQL query/index chưa đáp ứng.
- Realtime transport khi có latency, scale và hosting requirement.
- PostgreSQL RLS khi đánh giá later hardening cho persistence đã vận hành.

Không tạo ADR để mở lại business decision đã accepted như Team không có role, hai Project participant concepts, Project-configurable Task Status, Approval độc lập Status hay bốn optional module.

## 17. Traceability với Business Scope v0.3

| Business Scope | Quyết định/invariant | Target architecture mapping |
|---|---|---|
| §3, §4, invariant 1–5 | Organization tenant; User global; role từ Membership; role scopes không kế thừa | OrganizationMembership SoT, principal/context, explicit Organization-scoped data access, composite constraints và auth matrix; RLS later hardening |
| §5, §6 | Signup chỉ User; Organization onboarding atomic; Membership/Invitation lifecycle | Identity/Organization modules, onboarding transaction, first-class Invitation |
| §7, baseline 4–5 | Team reusable, không Team role/Lead | Team/TeamMember entities không role; legacy TeamLead removal classification |
| §8, invariant 6–11 | Participating Teams và Project Members riêng; PM/Contributor; last PM | ProjectTeam/ProjectMembership entities, unique/eligibility/transaction rules |
| §8, §10, invariant 12–13 | Task thuộc Project, owning Team participating, assignee intersection | Task relations, composite FK candidates, assignment/owning Team transaction |
| §9, §24.2 | Core vs bốn optional modules | ProjectModuleSetting fixed registry và module gates |
| §10.2 | Management vs execution fields | Field boundary và permission matrix riêng; không generic editTask |
| §11, invariant 20–24 | Project status config, semantic enum, ordering/archive, no workflow engine | ProjectTaskStatus entity, Board query, status config commands |
| §12, invariant 26–28 | Checklist là progress SoT và completion gate | Task aggregate calculator + completion transaction |
| §13, invariant 29–32 | Approval optional/independent, one approver, cancel/history | Approval aggregate, request/history, explicit commands, TBD self-approval |
| §14–17 | Milestone/Document/File/Risk | Optional bounded modules, fixed settings, contextual relations |
| §16, invariant 33 | Task Attachment độc lập Files module | StoredFile + separate TaskAttachment/ProjectFile relations |
| §18 | Comment/collaboration | Comment aggregate, Task/Project visibility, soft delete |
| §19 | In-app/email, recipient revalidate, dedup | Notification module, BullMQ worker/idempotency, delivery-time eligibility; selective Outbox khi cần |
| §20 | Activity khác Audit; Audit append-only | Hai module/store riêng; events/projection vs durable evidence |
| §21, invariant 41 | Search/dashboard/report cùng visibility | Query services/read models với tenant/principal filters |
| §23 invariant 37–40 | Atomic critical mutation, no side-effect SoT, archive default | Selective transaction/coordinator, synchronous SoT, optional reliable async publication, delete policy và audit model |
| §25, §28 | Không custom workflow/module/low-code/microservice complexity | Fixed semantics/modules, no arbitrary transition graph, Modular Monolith |

## 18. Architecture Review Checklist

Architecture Simplification Review xác nhận:

- [x] Không có `TEAM_LEAD`, Team role hoặc Team-level approval trong target model.
- [x] OrganizationMembership là nguồn duy nhất của Organization role.
- [x] ProjectTeam và ProjectMembership là hai relation riêng; add Team không auto-add member.
- [x] Project role chỉ có `PROJECT_MANAGER` và `CONTRIBUTOR`.
- [x] Task luôn có Project + one owning Team và assignee intersection được enforce.
- [x] ProjectTaskStatus là entity theo Project; semantic category cố định; `REVIEW` không phải Approval.
- [x] Approval có configuration, request/cancel/approve/reject và append-only history riêng.
- [x] Checklist/completion, last Owner/PM, participant removal và Project completion có transaction strategy rõ.
- [x] Optional modules chỉ có Milestones/Documents/Files/Risks; disable không xóa data.
- [x] Task Attachment độc lập Files module.
- [x] Activity, Audit và Notification không bị gộp hoặc dùng làm business SoT.
- [x] Module dependency là DAG/public contracts; coordinator chỉ dùng cho operation đa module cần transaction/invariant rõ.
- [x] Application/data access fail-closed theo Organization; worker/read model áp cùng visibility policy.
- [x] PostgreSQL là persistence duy nhất của target runtime; MongoDB chỉ là legacy reference; ORM là infrastructure detail; không dual-write mặc định.
- [x] Business question chưa khóa vẫn là `TBD` theo capability, không chặn architecture tổng thể.
- [x] Architecture không thêm custom workflow, custom module, event sourcing, microservice hoặc broker không có requirement.
- [x] CQRS/read projection/cache/realtime/RLS/Outbox không bị biến thành v1 prerequisite khi chưa có requirement.

**Kết luận review:** `Architecture Blocking TBD = 0`; tài liệu đạt trạng thái `Accepted — Architecture Simplification Review`.

## 19. Implementation Priority

### MUST HAVE — v1 correctness

- Domain-oriented Modular Monolith: top-level package by Domain/Feature, layered architecture thực dụng trong module và dependency direction rõ.
- PostgreSQL là persistence duy nhất của target runtime.
- OrganizationMembership là Organization role source of truth duy nhất.
- ProjectTeam và ProjectMembership là hai relation riêng.
- Explicit tenant isolation bằng active Membership, `organizationId`, resource ownership và fail-closed data access.
- OrganizationRole `OWNER/ADMIN/MEMBER` và ProjectRole `PROJECT_MANAGER/CONTRIBUTOR` không suy diễn lẫn nhau; Team không có role.
- ProjectTaskStatus thuộc Project với semantic category hệ thống.
- Approval độc lập Task Status và có explicit actions/history.
- Task owning Team và assignee intersection invariant.
- Transaction cho critical business operation và concurrency control tại race thực sự tồn tại.
- Authorization theo context, role, resource relationship và business state.
- Relational constraints/indexes cho tenant ownership, uniqueness và referential integrity.
- Critical security/invariant tests được viết cùng phase tương ứng.
- Mọi schema/roadmap decision liên quan phải trace về bốn Accepted ADR tại §16.1.

### SHOULD HAVE — thêm trong phase khi capability cần

- Repository/data-access boundary có ý nghĩa; không tạo interface/adapter máy móc.
- QueryService cho Board/List/My Tasks/dashboard khi read shape đủ khác biệt.
- BullMQ cho async notification/reminder với retry, dedup và recipient revalidation; selective Outbox cho side effect critical.
- StorageService/StoredFile tối thiểu khi triển khai Task Attachment hoặc Files.
- Optimistic concurrency hoặc targeted row lock tại race đã xác định.
- Audit và Activity tách semantic/reliability; Notification không là SoT.
- Observability, Docker worker role và operational checks đi cùng capability được deploy.

### LATER / ONLY IF JUSTIFIED

- PostgreSQL RLS defense-in-depth.
- Outbox cho toàn bộ event; mặc định chỉ dùng chọn lọc.
- Materialized projection và Redis query cache diện rộng.
- Realtime transport (SSE/WebSocket) thay vì polling.
- Storage direct-upload, malware scanning và retention automation nâng cao.
- ETL production-grade nếu `TBD-MIG-01` xác nhận có dữ liệu legacy cần giữ.
- Full Mongo/PostgreSQL persistence-adapter coexistence hoặc dual write.
- Bất kỳ service split/infrastructure pattern nào không có requirement rõ.

## 20. Architecture Simplification Summary

### 20.1. Được giữ nguyên

- Accepted domain model, authorization scopes, aggregate invariants và API business commands.
- Domain-oriented Modular Monolith, PostgreSQL target và bốn optional Project modules.
- Task Attachment là core; Approval tách Task Status; Project status cấu hình theo Project.

### 20.2. Được đơn giản hóa

- Top-level source tổ chức theo domain; layering bên trong module mặc định là `Controller → Service/Use Case → Repository/Data Access`.
- Use case/policy/coordinator chỉ dùng cho invariant hoặc transaction phức tạp.
- ORM nằm trong infrastructure/module data access nhưng không bắt buộc tạo port/interface cho từng entity.
- Read path ưu tiên PostgreSQL query/index; storage dùng một service/adapter nhỏ.

### 20.3. Được hoãn đến đúng phase

- Outbox, RLS, projection/cache, realtime transport, storage provider/security nâng cao và ETL.
- ADR cho Approval concurrency, async reliability, storage/read model/realtime/RLS.
- Feature-policy TBD không thuộc capability đang triển khai.

### 20.4. Không còn là v1 prerequisite

- Full clean/hexagonal ceremony, command bus, full CQRS, event sourcing hoặc separate read database.
- Long-lived Mongo/PostgreSQL adapter coexistence hoặc dual write.
- Transactional Outbox cho mọi event, RLS làm correctness boundary ban đầu, Redis cache mặc định, WebSocket mặc định.
- Microservice, Kafka/RabbitMQ hoặc custom workflow/module framework.

### 20.5. Acceptance decision

Kiến trúc hiện không còn blocker tổng thể và bốn priority ADR đã được Accepted. Artifact kế tiếp là PostgreSQL Target Data Model / Schema Design; các TBD còn lại được giữ explicit và chỉ chặn feature/operation tương ứng.

## 21. Kết quả và bước tài liệu kế tiếp

Tài liệu đã được review và chuyển sang `Accepted`; nó trở thành input cho các artifact riêng:

```text
Business Scope v0.3
        ↓
Current State / Gap Analysis
        ↓
Target Technical Architecture v0.3
        ↓
Persistence / Architecture ADRs
        ↓
PostgreSQL Target Data Model / Schema Design
        ↓
Migration Strategy
        ↓
Refactor Roadmap
        ↓
spec-kit implementation phases
        ↓
Source implementation
```

Tài liệu hiện tại không định nghĩa executable phase order, migration command, TypeORM entity hoặc source refactor. Mọi implementation phải trace về accepted Business Scope và một architecture/ADR decision đã được review tương ứng.
