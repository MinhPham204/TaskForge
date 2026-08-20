# TaskForge Backend — Review các Phase và đề xuất tổ chức kiến trúc

> Ngày review: 2026-08-08  
> Phạm vi: `.spec-kit/constitution.md`, toàn bộ plan Phase 1–8 và source backend/frontend liên quan trực tiếp đến multi-organization.

## 1. Kết luận ngắn

Roadmap hiện tại có hướng đi đúng: vá state transition trước, chuyển tenancy sang `Membership`, đồng bộ FE/BE, bổ sung test, benchmark, CI rồi deploy. Quyết định dùng header `X-Organization-Id` kết hợp `Membership` phù hợp với SaaS hỗ trợ một user tham gia nhiều workspace.

Điểm chưa ổn không nằm ở ý tưởng tổng thể mà ở **thứ tự cutover của Phase 2**. Code hiện đã chuyển `TenantInterceptor` sang mô hình mới, nhưng guard, Task/Team controller, registration, invitation, notification worker và frontend vẫn đọc `User.role`/`User.organization`. Đây là trạng thái migration “nửa mới, nửa cũ”, có thể gây lỗi quyền và rò rỉ cross-tenant.

Khuyến nghị chính:

1. Tạm thời chưa đi tiếp Phase 3–4.
2. Hoàn tất một **Phase 2B — Membership Cutover & Security Gate**.
3. Đưa các test security quan trọng của Phase 5 lên chạy ngay trong Phase 2B.
4. Chỉ xóa field cũ khỏi `User` sau khi tất cả read/write path đã chuyển sang `Membership` và test cutover đã xanh.
5. Refactor kiến trúc theo từng module trong quá trình này, không đổi toàn bộ cây thư mục một lần.

## 2. Đánh giá constitution

### 2.1. Điểm tốt

- Bốn nguyên tắc ngắn, dễ nhớ và gắn trực tiếp với rủi ro thật của sản phẩm.
- Nhấn mạnh tenant isolation và atomic transition là đúng trọng tâm.
- Đã xác định rõ ALS, Mongoose, BullMQ và RTK Query là các boundary quan trọng.

### 2.2. Điểm cần làm rõ

Quy tắc hiện tại nói “Every database query and mutation MUST filter by `organizationId`”. Câu này không đúng cho mọi collection:

- `User` là global identity.
- `Organization` cần được truy vấn trước khi chọn workspace.
- `Membership` phải span nhiều organization để phục vụ `GET /auth/my-organizations`.
- Migration, seed, cron cross-tenant và system command có chủ đích chạy ngoài request tenant.

Nên sửa constitution theo loại dữ liệu:

```text
Tenant-scoped collections:
  Task, Team và dữ liệu nghiệp vụ thuộc workspace
  -> bắt buộc có tenant context hoặc organizationId tường minh.

Global/control-plane collections:
  User, Organization, Membership
  -> không auto-filter, nhưng mọi use case phải có authorization policy tường minh.

Cross-tenant system operations:
  migration, seed, cron scan, reporting cấp hệ thống
  -> chỉ chạy qua entry point được đặt tên rõ và có audit/logging.
```

Nên bổ sung các nguyên tắc:

5. **Membership Is the Authorization Source of Truth**: role theo workspace chỉ được đọc từ active `Membership`; JWT/User không chứa quyền organization-scoped.
6. **Fail-Closed Tenant Access**: repository của dữ liệu tenant-scoped phải từ chối chạy nếu thiếu tenant context; cross-tenant access phải dùng API riêng có chủ đích.
7. **Module Boundary**: module chỉ export application contract/use case, không export raw Mongoose model cho module khác.
8. **Transactional Consistency**: use case ghi nhiều document phải dùng transaction; DB mutation + queue event quan trọng cần outbox hoặc cơ chế retry/idempotency tương đương.

## 3. Đánh giá từng Phase

| Phase | Đánh giá | Trạng thái quan sát được | Điều chỉnh đề xuất |
|---|---|---|---|
| 1 — Vá backend | Tốt | Checklist đã được hiện thực hóa: `requireApproval`, atomic approve/reject, validate assignee | Giữ quyết định cho phép Team Lead self-approval; bổ sung state-machine test trước cutover |
| 2 — Membership | Đúng hướng nhưng chưa khép kín | TASK 1, 2, 4, 5 đã làm; các read/write path cũ vẫn còn nhiều | Tách rõ Expand → Migrate → Cutover → Contract; thêm security gate trước Phase 3 |
| 3 — Sync route | Chưa nên bắt đầu | FE chưa có active workspace/header; chưa có `UserController` mới | Sửa thiết kế User directory: query `Membership`, không dựa tenant plugin của `User` |
| 4 — Frontend | Hợp lý nhưng phụ thuộc Phase 2–3 | FE vẫn route theo `user.role`, lưu `user.organization` | Chỉ triển khai sau khi API workspace contract ổn định |
| 5 — Unit test | Đúng trọng tâm nhưng quá muộn | Hiện chỉ có test `Hello World` | Kéo test tenant/RBAC/notification lên Phase 2B; sửa mâu thuẫn self-approval |
| 6 — Benchmark | Hợp lý | Chưa triển khai | Benchmark workload thật; không chỉ đo một query cô lập |
| 7 — CI/docs | Hợp lý | Chưa triển khai | CI dùng `npm ci` + cache npm, không cache trực tiếp `node_modules`; thêm typecheck/build/e2e security |
| 8 — Deploy | Hợp lý nhưng còn lệch config | Chưa triển khai | Chuẩn hóa tên env với code thật; thêm health/readiness, migration job, backup và graceful shutdown |

### 3.1. Phase 1

Phase 1 có phạm vi tốt và tránh đụng vào tenancy trước khi migration. Atomic conditional update cho approve/reject là lựa chọn đúng.

Mâu thuẫn cần sửa:

- Phase 1 quyết định **cho phép** Team Lead tự approve/reject.
- Phase 5 TASK-2 lại yêu cầu “test self-approval bị chặn”.

Phase 5 phải đổi thành test xác nhận self-approval **được phép khi actor là Team Lead hợp lệ**, đồng thời user không phải Team Lead vẫn bị chặn.

### 3.2. Phase 2

Các phần đã làm tốt:

- `Membership` có unique index `(user, organization)`.
- Migration idempotent, có dry-run và không kéo Redis/BullMQ vào migration context.
- Header không được tin trực tiếp mà được validate qua active Membership.
- ALS lưu cả `organizationId` và `membershipRole`.

Các blocker hiện tại:

1. `RolesGuard`, hai `OrgAdminGuard` và `TeamLeadGuard` vẫn đọc `user.role`.
2. Task/Team controller tạo actor bằng `user.role` thay vì active Membership.
3. Registration chưa tạo owner Membership trong cùng transaction.
4. `acceptInvitation` vẫn áp dụng strict one-user-one-org và cập nhật `User.organization/User.role`.
5. Chưa có `GET /auth/my-organizations`.
6. Frontend chưa có `activeOrgId`, chưa gắn header và vẫn route theo `user.role`.
7. Notification worker query global `User` theo role; do `User` bị loại khỏi tenant plugin, email có thể đi tới admin của organization khác.
8. Các validation “user thuộc organization” trong Task/Team đang query `User.organization`; sau khi xóa field này chúng phải query `Membership`.
9. `Organization.members` và `Membership` đang cùng biểu diễn quan hệ thành viên, tạo hai source of truth.

#### Thứ tự cutover an toàn

**Bước A — Expand, đã gần hoàn thành**

- Tạo Membership schema/service/index.
- Backfill dữ liệu cũ.
- Giữ field cũ để rollback.

**Bước B — Dual-write có kiểm soát**

- Registration tạo `User + Organization + owner Membership` trong một transaction.
- Accept invitation tạo Membership trong transaction.
- Update role/deactivate/remove member ghi vào Membership.
- Nếu còn cần field legacy trong thời gian ngắn, dual-write có test; không để từng service tự quyết định.

**Bước C — Read cutover**

- Guard và policy chỉ đọc active Membership.
- Task/Team actor lấy role từ `RequestPrincipal.activeMembership`.
- User directory, assignee validation và notification recipients đi qua Membership.
- FE lấy workspace/role từ `GET /auth/my-organizations`.

**Bước D — Security gate**

- Test giả mạo header, missing header, inactive membership.
- Test cùng user là Admin ở org A và Member ở org B.
- Test query Task/Team không lẫn org.
- Test notification chỉ gửi recipient trong đúng org.
- Test registration luôn tạo owner Membership.

**Bước E — Contract**

- Dừng dual-write.
- Xóa `User.organization`, `User.role` và `User.team` sau khi grep không còn consumer.
- Cân nhắc xóa `Organization.members`; membership listing phải lấy từ Membership collection.
- Xóa code migration compatibility sau một release ổn định.

### 3.3. Phase 3

Plan nói `UserController` sẽ tự động scope theo organization nhờ Mongoose tenant plugin. Điều này không còn đúng trong kiến trúc multi-org:

- `User` là global identity và được loại khỏi plugin.
- `User` không còn `organization` sau contract phase.

Thiết kế đúng cho user directory:

```text
GET /users
  -> active organization từ TenantContext
  -> MembershipRepository.findActiveByOrganization(orgId)
  -> populate/batch load User profile
  -> map thành WorkspaceMemberResponse
```

Endpoint nên trả workspace member, không trả raw User:

```ts
interface WorkspaceMemberResponse {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  profileImageUrl: string | null;
  role: MembershipRole;
  joinedAt: string;
}
```

Audit route nên thêm các cột:

- Authentication required?
- Tenant header required?
- Required membership role/team role?
- Request DTO / response DTO?
- Idempotent?
- FE consumer nào đang dùng?

### 3.4. Phase 4

Không nên dựng ba cây dashboard dựa trực tiếp trên `user.role`. Nên có `activeWorkspace` selector:

```text
activeWorkspace = {
  organization,
  membershipId,
  role
}
```

Route/UI permission chỉ dùng `activeWorkspace.role`. Backend vẫn là nơi enforce quyền; frontend chỉ dùng role để điều hướng và ẩn/hiện UX.

Khi switch workspace cần thực hiện atomically ở UI flow:

1. Set `activeOrgId`.
2. Persist lựa chọn nếu cần.
3. Reset RTK Query cache.
4. Điều hướng về route hợp lệ đối với role mới.
5. Hủy/không hiển thị response cũ được trả về sau lúc switch.

### 3.5. Phase 5

Nội dung test đúng nhưng đặt quá muộn. Test tenant isolation là điều kiện để kết thúc Phase 2, không phải việc làm sau khi hoàn thiện frontend.

Nên chia thành:

- **Phase 2B tests**: interceptor, Membership role, guards, registration/invitation, notification isolation.
- **Phase 5 tests**: coverage mở rộng cho Task/Team/Organization use cases, controllers và state machine.

Không nhất thiết dùng `mongodb-memory-server` cho mọi unit test:

- Policy/domain unit test: không cần database.
- Use-case unit test: mock repository ports.
- Repository integration test: dùng MongoDB container hoặc memory server.
- Tenant E2E security test: chạy app thật với MongoDB/Redis test.

### 3.6. Phase 6

Index Membership hiện tại hợp lý cho exact lookup `(user, organization)` và list theo prefix `user`. Cần benchmark thêm:

- `(user, organization, isActive)` hoặc partial index tùy cardinality/thống kê thật.
- List thành viên trong org: `(organization, isActive, role)`.
- Invitation lookup nếu invitation chuyển thành collection riêng.
- Chi phí thêm một Membership query trên mỗi HTTP request.
- P95/P99 của endpoint thật, không chỉ `executionTimeMillis` của query.

Không nên bỏ index trên production để đo “before/after”. Benchmark phải chạy database riêng như plan đã nêu.

### 3.7. Phase 7

CI backend tối thiểu nên chạy:

```text
npm ci
npm run lint:check
npm run typecheck
npm run test
npm run test:e2e:security
npm run build
```

Script `lint` hiện có `--fix`; CI không nên tự sửa file. Tạo `lint:check` không có `--fix`.

`setup-node` nên cache npm download cache dựa trên `package-lock.json`, không cache trực tiếp `node_modules` khi vẫn dùng `npm ci`.

### 3.8. Phase 8

Plan đang dùng tên env khác code hiện tại:

- Plan: `MONGODB_URI`, code: `MONGO_URI`.
- Plan: `JWT_SECRET`, code: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_VERIFIED_SECRET`.
- Plan: `CORS_ORIGIN`, code: `CLIENT_URL`.

Cần chọn một naming contract và validate khi bootstrap. Deploy plan cũng nên thêm:

- `/health/live` và `/health/ready`.
- Graceful shutdown cho HTTP, Mongo, Redis và BullMQ worker.
- Migration job chạy một lần trước rollout.
- Backup/restore MongoDB.
- Redis persistence/retry policy.
- Không log connection string/secrets.
- Worker process tách khỏi API nếu scale nhiều replica để tránh mỗi API replica cùng chạy cron.

## 4. Kiến trúc backend đề xuất

### 4.1. Chọn mức kiến trúc

Không cần chuyển sang Clean Architecture cực đoan. Nên dùng **Modular Monolith + Clean boundaries bên trong feature**:

```text
HTTP/BullMQ/CLI
      |
      v
Application use cases
      |
      v
Domain policies/entities
      ^
      |
Infrastructure adapters (Mongoose, Redis, Email, BullMQ)
```

Dependency rule:

```text
presentation      -> application
infrastructure    -> application ports + domain
application       -> domain
domain            -> không phụ thuộc NestJS, Mongoose, Redis, BullMQ, Swagger
```

Application không import Mongoose model. Controller không trả Mongoose document trực tiếp.

### 4.2. Cây thư mục mục tiêu

```text
backend/src/
├── main.ts
├── app.module.ts
│
├── bootstrap/
│   ├── config/
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   └── env.validation.ts
│   ├── swagger.ts
│   └── validation.ts
│
├── common/
│   ├── domain/
│   │   ├── entity.ts
│   │   ├── domain-error.ts
│   │   └── result.ts
│   ├── application/
│   │   ├── clock.port.ts
│   │   ├── id-generator.port.ts
│   │   └── transaction-manager.port.ts
│   └── presentation/
│       ├── filters/http-exception.filter.ts
│       ├── pipes/parse-mongo-id.pipe.ts
│       └── dto/paginated.response.ts
│
├── tenancy/
│   ├── application/
│   │   ├── tenant-context.port.ts
│   │   ├── resolve-active-membership.use-case.ts
│   │   └── workspace-authorization.policy.ts
│   ├── infrastructure/
│   │   └── als-tenant-context.adapter.ts
│   └── presentation/
│       ├── tenant.interceptor.ts
│       ├── current-membership.decorator.ts
│       ├── roles.guard.ts
│       └── skip-tenant.decorator.ts
│
├── modules/
│   ├── identity/
│   │   ├── domain/
│   │   │   └── user.ts
│   │   ├── application/
│   │   │   ├── ports/user.repository.ts
│   │   │   └── use-cases/
│   │   ├── infrastructure/mongoose/
│   │   │   ├── user.schema.ts
│   │   │   ├── mongoose-user.repository.ts
│   │   │   └── user.mapper.ts
│   │   ├── presentation/http/
│   │   │   ├── auth.controller.ts
│   │   │   ├── profile.controller.ts
│   │   │   └── dto/
│   │   └── identity.module.ts
│   │
│   ├── organization/
│   │   ├── domain/
│   │   ├── application/
│   │   │   ├── ports/organization.repository.ts
│   │   │   └── use-cases/
│   │   ├── infrastructure/mongoose/
│   │   ├── presentation/http/
│   │   └── organization.module.ts
│   │
│   ├── membership/
│   │   ├── domain/
│   │   │   ├── membership.ts
│   │   │   ├── membership-role.ts
│   │   │   └── membership.policy.ts
│   │   ├── application/
│   │   │   ├── ports/membership.repository.ts
│   │   │   └── use-cases/
│   │   │       ├── list-my-workspaces.use-case.ts
│   │   │       ├── invite-member.use-case.ts
│   │   │       ├── accept-invitation.use-case.ts
│   │   │       ├── change-membership-role.use-case.ts
│   │   │       └── revoke-membership.use-case.ts
│   │   ├── infrastructure/mongoose/
│   │   ├── presentation/http/
│   │   └── membership.module.ts
│   │
│   ├── team/
│   │   ├── domain/
│   │   │   ├── team.ts
│   │   │   ├── team-member-role.ts
│   │   │   └── team.policy.ts
│   │   ├── application/
│   │   ├── infrastructure/mongoose/
│   │   ├── presentation/http/
│   │   └── team.module.ts
│   │
│   └── task/
│       ├── domain/
│       │   ├── task.ts
│       │   ├── task-status.ts
│       │   ├── task-state-machine.ts
│       │   └── task.policy.ts
│       ├── application/
│       │   ├── ports/
│       │   │   ├── task.repository.ts
│       │   │   ├── team-reader.port.ts
│       │   │   └── notification-publisher.port.ts
│       │   ├── use-cases/
│       │   │   ├── create-task.use-case.ts
│       │   │   ├── update-task.use-case.ts
│       │   │   ├── submit-task.use-case.ts
│       │   │   ├── approve-task.use-case.ts
│       │   │   └── reject-task.use-case.ts
│       │   └── queries/
│       │       ├── list-tasks.query.ts
│       │       └── workload-report.query.ts
│       ├── infrastructure/
│       │   ├── mongoose/
│       │   └── bullmq/
│       ├── presentation/http/
│       └── task.module.ts
│
├── integrations/
│   ├── email/
│   ├── redis/
│   └── queue/
│
└── workers/
    ├── task-reminder/
    └── notification/
```

### 4.3. Trách nhiệm của từng layer

#### Domain

Chứa business rule thuần:

- Task state transition hợp lệ.
- Ai được sửa/approve/reject task.
- Role hierarchy trong Membership.
- Quy tắc không được xóa owner cuối cùng.

Không chứa decorator `@Injectable`, `@Schema`, `@ApiProperty` hay HTTP exception.

#### Application

Chứa use case và orchestration:

- Nhận command/query input thuần.
- Gọi repository port.
- Chạy transaction.
- Gọi domain policy.
- Publish event qua port.
- Trả output model, không trả Mongoose document.

#### Infrastructure

Chứa chi tiết kỹ thuật:

- Mongoose schema/model/query/aggregation.
- Redis implementation.
- BullMQ producer.
- Nodemailer adapter.
- Mapper database document ↔ domain/application model.

#### Presentation

Chứa transport concern:

- Controller, request/response DTO.
- Swagger.
- Guard/decorator/pipe.
- Mapping domain/application error thành HTTP response.

### 4.4. Module interaction

Không làm như hiện tại là `TaskModule` tự đăng ký `TeamSchema` và `UserSchema`. Dùng contract hẹp:

```text
CreateTaskUseCase
  -> TaskRepository
  -> TeamReaderPort
  -> MembershipReaderPort
  -> NotificationPublisherPort
```

`TaskModule` có thể bind `TeamReaderPort` tới adapter do Team module export, nhưng không truy cập raw `TeamModel`.

Đối với query/report phức tạp, không cần ép qua domain entity. Dùng CQRS nhẹ:

- Command use case tuân thủ domain policy.
- Read query service có thể dùng aggregation tối ưu nhưng vẫn bắt buộc tenant scope.

## 5. Mô hình request principal đề xuất

Thay vì truyền `UserDocument` và lấy `user.role`, tạo principal thuần:

```ts
interface RequestPrincipal {
  userId: string;
  email: string;
  activeWorkspace?: {
    organizationId: string;
    membershipId: string;
    role: MembershipRole;
  };
}
```

Flow:

```text
JwtStrategy
  -> xác thực identity, tạo principal chưa có workspace

TenantInterceptor/Guard
  -> đọc X-Organization-Id
  -> resolve active Membership
  -> gắn activeWorkspace vào principal + ALS

Controller
  -> truyền RequestPrincipal vào use case

Policy
  -> quyết định quyền từ activeWorkspace.role/team membership
```

JWT không cần chứa organization role. Nếu token hiện vẫn chứa `role`, coi đó là legacy claim và tuyệt đối không dùng để authorize.

## 6. Tenant isolation nên triển khai thế nào

### Phương án khuyến nghị

Repository tenant-scoped luôn nhận `TenantId` tường minh từ application context:

```text
taskRepository.findById(tenantId, taskId)
taskRepository.updateStatus(tenantId, taskId, expectedStatus, nextStatus)
```

ALS vẫn hữu ích để:

- Correlation/logging.
- Truyền context qua framework boundary.
- Kiểm tra defense-in-depth trong infrastructure.

Nhưng business correctness không nên chỉ dựa vào global Mongoose plugin ngầm.

Mongoose plugin có thể giữ như lớp phòng vệ thứ hai, với thay đổi:

- Model tenant-scoped + thiếu context → throw.
- Không tự bypass chỉ vì ALS rỗng.
- Cross-tenant cron/migration dùng model/repository system riêng.
- Audit riêng `aggregate`, `bulkWrite`, populate và raw collection vì query middleware không bảo vệ đầy đủ các đường này.

## 7. Lộ trình refactor không làm gián đoạn roadmap

### PR 1 — Security stabilization

- Sửa notification recipient theo Membership/org.
- Guard đọc active Membership.
- Task/Team actor không đọc `User.role`.
- Thêm `CurrentPrincipal`/`CurrentMembership` decorator.
- Viết security tests tối thiểu.

### PR 2 — Membership write cutover

- Registration tạo owner Membership trong transaction.
- Invitation/role/revoke chuyển sang Membership.
- Thêm `GET /auth/my-organizations`.
- Quy định Membership là source of truth.

### PR 3 — Frontend workspace foundation

- `workspaceSlice` và selector active role.
- Gắn header.
- Reset cache và route lại khi switch.
- Xóa authorization dựa trên `user.role`.

### PR 4 — Membership read cutover

- User directory/assignee validation qua Membership.
- Organization member listing qua Membership.
- Loại dần `Organization.members` read path.

### PR 5 — Contract cleanup

- Xóa field legacy khỏi User sau verification.
- Xóa guard duplicate và compatibility code.
- Cập nhật seed/migration/docs.

### PR 6+ — Refactor theo vertical slice

Mỗi lần chọn một use case có rủi ro cao, ví dụ `approveTask`, rồi tách đủ domain/application/infrastructure/presentation. Không di chuyển toàn bộ file chỉ để có cây thư mục đẹp.

Thứ tự nên tách:

1. Tenancy + Membership authorization.
2. Task approval state machine.
3. Organization invitation/membership lifecycle.
4. Task reporting queries.
5. Team management.
6. Auth/profile CRUD đơn giản sau cùng.

## 8. Definition of Done cho Phase 2

Phase 2 chỉ nên đánh dấu hoàn thành khi:

- [ ] Registration tạo owner Membership atomically.
- [ ] Một user tham gia được ít nhất hai organizations.
- [ ] `GET /auth/my-organizations` trả đúng role từng org.
- [ ] Toàn bộ org-scoped guard dùng Membership role.
- [ ] Task/Team service không nhận quyền từ `User.role`.
- [ ] Assignee/member validation không dựa vào `User.organization`.
- [ ] Invitation/role/revoke dùng Membership làm source of truth.
- [ ] Notification recipient được scope đúng organization.
- [ ] FE gắn `X-Organization-Id` và reset cache khi switch.
- [ ] Header thiếu → 400; membership không tồn tại/inactive → 403.
- [ ] Admin org A không có quyền admin tại org B nếu Membership B là Member.
- [ ] Không có cross-tenant data leak qua find/update/delete/aggregate/worker.
- [ ] Test security và typecheck/build đều xanh.
- [ ] Sau khi quan sát ổn định mới xóa field legacy.

## 9. Kết luận cuối

Roadmap đủ tốt để tiếp tục, nhưng cần sửa Phase 2 và Phase 5 trước khi triển khai tiếp. Membership/header-based switching là lựa chọn hợp lý; vấn đề hiện tại là cutover chưa đi hết toàn bộ read/write/authorization path.

Cấu trúc kiến trúc nên hướng tới modular monolith có bốn layer trong từng feature, nhưng ưu tiên dependency boundary và source of truth hơn việc di chuyển file. Nếu chỉ đổi tên thư mục mà service vẫn inject trực tiếp nhiều Mongoose model và chứa toàn bộ policy/orchestration/query thì kiến trúc thực tế chưa thay đổi.
