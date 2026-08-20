# TaskForge backend guidance

File này áp dụng cho toàn bộ `backend/`. Đọc cùng root `AGENTS.md`; với thay đổi business behavior, đọc thêm `../docs/BUSINESS_SCOPE.md`. Source trong worktree là bằng chứng của trạng thái hiện tại, `docs/BUSINESS_SCOPE.md` mô tả phạm vi sản phẩm mục tiêu, còn `.spec-kit/` mô tả intent/roadmap triển khai khi không mâu thuẫn với source.

## Đọc theo phạm vi thay đổi

- Bootstrap/config: `src/main.ts`, `src/app.module.ts`, `package.json`, `docker-compose.yml`, `.env.example`.
- Auth/identity: `src/modules/auth/auth.controller.ts`, `src/modules/auth/auth.service.ts`, `src/modules/auth/auth.module.ts`, `src/modules/auth/strategies/`, `src/modules/user/`, Redis/email service. Nếu quyền theo workspace liên quan, đọc thêm Membership/tenancy files.
- Tenant/RBAC: `src/common/guards/tenant-membership.guard.ts`, `src/common/interceptors/tenant.interceptor.ts`, `src/common/als/`, `src/common/plugins/tenant.plugin.ts`, `src/modules/membership/` và guard/controller của feature.
- Organization/Membership: controller, service, schema và guards trong `src/modules/organization/`, rồi toàn bộ `src/modules/membership/`.
- Team: `team.controller.ts` -> `team.service.ts` -> `schemas/team.schema.ts`; đọc `guards/team-lead.guard.ts` và Membership khi thay đổi quyền/thành viên.
- Task: `task.controller.ts` -> `task.service.ts` -> `schemas/task.schema.ts`; đọc Team schema/guard và `src/modules/automation/` nếu đụng approval/reminder.
- Job/cron: đọc cả producer, consumer, queue payload, ALS reconstruction và recipient query; HTTP ALS không tự đi qua BullMQ boundary.
- PostgreSQL: trước tiên đọc `../.spec-kit/specs/phase-2c-postgresql-database-dockerization.plan.md`; không suy ra Prisma structure/command là đã tồn tại.

## Kiến trúc đang chạy

Backend là NestJS modular monolith:

- `src/main.ts`: bootstrap HTTP, global `ValidationPipe` (whitelist, reject field lạ, transform), CORS từ `CLIENT_URL`, prefix `/api`, Swagger tại `/api/docs`, port mặc định `8001`.
- `src/app.module.ts`: Config, Mongoose global connection/plugin, BullMQ, scheduler và feature modules. `TenantInterceptor` là global interceptor.
- Persistence hiện tại là Mongoose trực tiếp trong service/guard. Chưa có repository ports, Prisma hoặc PostgreSQL runtime.
- `SharedModule` là global và cung cấp Redis, email, `TenantStorageService`.
- Controller xử lý transport/Swagger/guard và chuyển actor sang service; service hiện trộn orchestration, policy và persistence. Đây là trạng thái thật, không phải clean-boundary target.

### Ownership hiện tại

| Module | Trách nhiệm chính | Dependency đáng chú ý |
|---|---|---|
| Auth | OTP register, login, access/refresh JWT, profile/password | User, Organization, Mongo transaction, Redis, Email |
| User | Global identity/profile persistence theo mục tiêu; schema vẫn còn legacy org/role/team | Mongoose User model; chưa có controller |
| Membership | Quan hệ User-Organization, org-scoped role, active access lookup | Mongoose Membership model; cung cấp `TenantMembershipGuard`; chưa có HTTP controller |
| Organization | Metadata, legacy member array và invitation lifecycle | User + Organization models; nhiều write path chưa cutover sang Membership |
| Team | Team metadata, team roles, member/invitation subdocuments | Team + legacy User lookup, active tenant context |
| Task | CRUD, dashboard/report, checklist/progress, approval flow | Task + Team + User models; publish notification queue |
| Automation | Due-date cron, reminder/approval workers | BullMQ, Task/User models, Email, reconstructed ALS |
| Seeder/scripts | Operational data creation/migration | Stateful; không thuộc request path và không an toàn để chạy mặc định |

Không mở rộng việc module tự đăng ký raw schema của module khác. Khi task yêu cầu refactor/migrate một vertical slice, ưu tiên contract hẹp và explicit tenant id, nhưng không di chuyển toàn bộ cây thư mục ngoài slice.

## Request, auth và tenant flow

### Route tenant-scoped (Task, Team và Organization management)

```text
HTTP request
  -> JwtAuthGuard: verify access token; JwtStrategy load active User identity
  -> TenantMembershipGuard: validate X-Organization-Id + active Membership
     and attach request.activeMembership
  -> route RBAC guard (OrgAdmin/OrgOwner/TeamLead when present)
  -> global TenantInterceptor: open ALS { organizationId, membershipRole }
  -> DTO ValidationPipe / controller
  -> service
  -> Mongoose query hooks / queue publish
```

Guards chạy trước interceptor. Guard nào query tenant data phải scope `organization` tường minh; `TeamLeadGuard` là ví dụ. Controller lấy org role qua `@CurrentMembership()`, không lấy `user.role`.

`TenantMembershipGuard` trả 400 khi header thiếu/sai ObjectId, 403 khi không có active Membership và gắn Membership đã kiểm chứng cho guard sau. `TenantInterceptor` fail closed nếu authenticated tenant route thiếu `activeMembership`.

### Auth/control-plane

`AuthController` dùng `@SkipTenant()`. Public register/login/OTP không có tenant context; auth route có JWT vẫn không yêu cầu workspace header. Registration hiện là:

```text
register email -> OTP in Redis + email
verify OTP -> short-lived verified JWT
set password -> Mongo transaction creates Organization + legacy User
             -> issue access/refresh tokens; store refresh-token hash
```

Registration chưa tạo OWNER Membership. JWT/User vẫn chứa legacy `role`/`organization`; claim này không được dùng để authorize tenant action. Active Membership role là authority ở guard/controller mới.

Chỉ dùng `@SkipTenant()` cho bootstrap/control-plane use case có authorization tường minh. Organization discovery, pending invitation, lookup và accept routes hiện có một số skip; audit từng route thay vì coi skip là public hoặc an toàn mặc định.

### Mongoose tenant plugin

- Query hooks hiện cover find/findOne/findOneAndUpdate/findOneAndDelete/count/update/delete/replace và tự thêm `organization` khi ALS có tenant.
- New tenant document được gắn organization ở `pre('validate')` nếu chưa có.
- `User`, `Organization`, `Membership` bị loại khỏi auto-filter vì là control-plane/global data.
- Thiếu ALS làm plugin bỏ qua filter (fail-open). `aggregate`, `bulkWrite`, `insertMany`, raw collection và system jobs không được query middleware bảo vệ.
- Vì vậy aggregate đầu tiên phải `$match` organization tường minh; guard/job/migration phải truyền org hoặc dùng entry point cross-tenant có chủ đích. Không dựa duy nhất vào comment nói “plugin tự scope”.

### Background flow

Cron reminder chạy ngoài HTTP/ALS và chủ đích scan nhiều tenant; mỗi job phải mang `organizationId`. Consumer gọi `TenantStorageService.run(organizationId, ...)` trước mọi tenant-scoped work. Không truyền Mongoose document hoặc tin tenant id lấy từ recipient/input bên ngoài.

DB mutation và enqueue hiện chưa dùng outbox; không mô tả hai bước là atomic. Phase 2C coi outbox/idempotency là quyết định cần triển khai theo slice.

## Invariant phải bảo toàn

### Tenant và Membership

- Không tin `X-Organization-Id` nếu chưa đối chiếu active Membership của authenticated user.
- Role organization-scoped đến từ Membership, không từ JWT claim hoặc `User.role` legacy.
- Mọi Task/Team read-write phải thuộc active organization. Cross-tenant ID không được làm lộ hoặc mutate record.
- Control-plane query không auto-scope; authorization phải nằm trong use case/query tường minh.
- Một cặp `(user, organization)` chỉ có một Membership; `isActive=false` phải thu hồi tenant access.
- `User` là global identity ở kiến trúc mục tiêu. Không xóa legacy `User.organization`, `User.role`, `User.team` hoặc `Organization.members` cho tới khi mọi read/write consumer đã cutover, migration được kiểm chứng và security tests xanh.
- Job/event tenant-scoped luôn mang organization id đã kiểm chứng; recipient phải được resolve trong đúng organization.

### Organization và Team

- Owner không được remove/downgrade qua member-management path; role mutation cuối cùng phải tác động Membership khi cutover hoàn tất.
- Team name unique trong organization.
- Team member/lead phải có active Membership trong cùng organization; không dùng global user role để thay cho team role.
- Team management cho active Org Owner/Admin hoặc Team Lead của chính team theo guard/policy hiện tại.
- Không tự loại Team Lead cuối cùng nếu actor chỉ là Team Lead; thay đổi rule này cần requirement/test rõ.

### Task

- Người tạo task phải là thành viên của team; assignee phải là thành viên team trong cùng organization.
- Mutation hiện cho Team Lead của team hoặc task creator/assignee; Org Owner/Admin không tự bypass nếu không thỏa policy task.
- Nếu `team.requireApproval` là true (default), `updateStatus` không được set Completed trực tiếp.
- Submit chỉ từ In Progress sang Pending Approval.
- Approve/reject chỉ Team Lead; self-approval của Team Lead **được phép có chủ đích** theo Phase 1.
- Approve/reject dùng conditional `findOneAndUpdate` từ Pending Approval để chỉ một request cạnh tranh thành công. Approve -> Completed/progress 100; reject -> In Progress và lưu reason.
- Progress nằm trong 0..100. Aggregate/report phải có organization `$match` explicit.

## Trạng thái chuyển đổi và seam rủi ro

Snapshot source ngày 2026-08-15:

| Hiện tại | Mục tiêu đã ghi trong spec |
|---|---|
| MongoDB/Mongoose + implicit plugin | PostgreSQL/Prisma, repository nhận org id explicit, RLS defense-in-depth |
| User vẫn có org/role/team | User chỉ là global identity |
| Membership bảo vệ Task/Team/management guards | Membership là source duy nhất cho registration, invitation, directory, role/revoke, notification |
| Organization.members + Membership cùng tồn tại | Membership là quan hệ thành viên duy nhất |
| Service inject nhiều raw models | Application ports/use cases theo từng vertical slice |
| Frontend chưa gửi workspace header | Workspace selector + `X-Organization-Id` + cache reset |

Các seam chưa hoàn tất cần kiểm tra trước khi sửa gần đó:

- `AuthService.setPassword()` chưa tạo OWNER Membership; chưa có `GET /auth/my-organizations`.
- `OrganizationService` vẫn dùng strict one-user-one-org, `User.organization`/`User.role` và `Organization.members` cho invitation/role/remove.
- `NotificationConsumer` query legacy global User role; User bị loại khỏi tenant plugin nên ALS không scope recipient. Đây là risk cross-tenant cần test/fix.
- `TaskService.update()` validate assignee mà không truyền team, nên invariant “assignee thuộc team” mới được enforce đầy đủ ở create path.
- Plugin fail-open khi thiếu ALS và không cover aggregate/bulk/insert; mọi entry point mới phải chọn explicit tenant hoặc explicit system operation.
- Frontend API paths/header/role vẫn là legacy; không coi backend multi-org hoàn tất.
- Generic `RolesGuard` đã có test nhưng hiện chưa được wire vào controller; authorization thực tế dùng các module-specific guards/service policy.

Active phase là hoàn tất Phase 2 Membership cutover + security gate. Không bắt đầu PostgreSQL implementation cho tới khi business/tenant contract được khóa bằng test. Backend task kế tiếp có scope rõ, ít mơ hồ: cập nhật registration để tạo `User + Organization + OWNER Membership` trong cùng Mongo transaction (vẫn giữ legacy fields tạm thời) và thêm rollback/role test.

Decision cần user hoặc spec chốt trước khi code tương ứng:

- Approval notification gửi Team Lead (khớp actor được approve) hay Org Owner/Admin (behavior worker hiện tại).
- MongoDB data là disposable dev/demo hay cần ETL ObjectId -> UUID, validation và rollback production-grade.
- Loại bỏ enum `Rejected` theo Phase 2C hay giữ API state riêng; service hiện reject về In Progress nhưng schema/seeder vẫn có Rejected.

Mâu thuẫn đã có quyết định: Phase 1/source cho phép self-approval của Team Lead; yêu cầu Phase 5 “self-approval bị chặn” là stale và không được áp dụng.

## Quy ước sửa code

- Giữ thay đổi trong feature/vertical slice nhỏ nhất. Không “cleanup” file lân cận chỉ vì lint/format đang đỏ.
- DTO dùng `class-validator`; global pipe reject field không khai báo. Không nhận raw role/org id rồi bỏ qua validation.
- Controller chỉ map HTTP input/principal; business authorization phải còn lớp service/policy defense-in-depth cho mutation nhạy cảm.
- Với Mongoose hiện tại, dùng ObjectId đúng nơi và conditional atomic update cho state transition. Chỉ đổi sang UUID trong slice PostgreSQL đã được yêu cầu.
- Query tenant-scoped mới phải thể hiện tenant scope có thể review được. Với aggregate/system worker, luôn explicit; không dựa vào ALS/plugin như correctness duy nhất.
- Multi-document write dùng transaction. Nếu vừa ghi DB vừa publish job, ghi nhận failure window và thêm idempotency/outbox khi task yêu cầu.
- Không trả secret/token hash/password; dùng response shape hẹp thay vì mở rộng raw document khi tạo API mới.
- Test unit colocated `src/**/*.spec.ts`; E2E ở `test/`. Thêm negative tenant/RBAC case cho mọi permission boundary.
- Match style file gần nhất, nhưng không sao chép comment/assumption đã sai. Lint baseline đang có lỗi; chỉ chịu trách nhiệm không làm tăng lỗi trong phạm vi sửa.

## Quy trình trước, trong và sau thay đổi

1. Trước khi sửa: xem `git status --short`, đọc phase + controller/service/schema/test liên quan, trace đủ request/job flow và ghi lại invariant có nguy cơ bị ảnh hưởng.
2. Chốt scope nhỏ nhất và cách kiểm chứng. Nếu cần quyết định nghiệp vụ trong mục “Decision” phía trên, dừng và hỏi thay vì tự chọn.
3. Trong khi sửa: bảo toàn dirty changes, giữ tenant scope có thể review được, thêm test cùng slice và không chạy formatter/auto-fix ngoài file thuộc scope.
4. Sau khi sửa: chạy test liên quan, unit suite và build khi an toàn; chạy lint với `--no-fix` hoặc lint riêng file và phân biệt lỗi mới với baseline.
5. Kiểm tra consumer khi API contract đổi, rồi đọc lại diff để phát hiện source/config/docs ngoài scope, secret hoặc migration/seed phát sinh ngoài ý muốn.
6. Báo rõ command đã chạy/chưa chạy, kết quả, known gap còn lại và mọi khác biệt giữa source, README và `.spec-kit/`.

## Command đã kiểm chứng và mức an toàn

Chạy từ `backend/`. Trên PowerShell bị chặn `npm.ps1`, dùng `npm.cmd` với cùng arguments.

| Mục đích | Command | Ghi chú |
|---|---|---|
| Install lockfile | `npm ci` | Dùng `backend/package-lock.json`; có network và ghi `node_modules` |
| Dev server | `npm run start:dev` | Cần MongoDB, Redis và env hợp lệ |
| Build | `npm run build` | Đã pass ngày 2026-08-15 |
| Unit tests | `npm run test -- --runInBand` | Đã pass 4 suites/11 tests ngày 2026-08-15; không chứng minh DB/E2E isolation |
| Coverage | `npm run test:cov -- --runInBand` | Chưa có coverage gate |
| Lint check không ghi file | `npm run lint -- --no-fix` | Đã xác nhận không sửa worktree; baseline fail 253 vấn đề ngày 2026-08-15 |
| Lint auto-fix | `npm run lint` | Script có `--fix`; chỉ chạy khi scope cho phép sửa format |
| Format | `npm run format` | Ghi lại `src/**/*.ts` và `test/**/*.ts`; không dùng như check |
| E2E | `npm run test:e2e` | AppModule kết nối infra thật; scaffold hiện chưa là security E2E đáng tin. Chỉ chạy trên env disposable |
| Docker dev | `docker compose up --build` | Dựng API + Mongo replica-set config + Redis; stateful |
| Membership dry-run | `npm run migrate:membership -- --dry-run` | Branch dry-run không gọi data write, nhưng vẫn mở kết nối và có thể initialize index; phải xác nhận đúng DB |
| Membership write | `npm run migrate:membership` | Ghi DB; không chạy nếu user chưa yêu cầu/approve |
| Seeder | `npm run seed -- seed:data` | **Destructive:** xóa bốn collection rồi seed lớn; chỉ dùng DB disposable với xác nhận rõ |

Chưa có command Prisma/PostgreSQL thật trong manifest. Không ghi hoặc chạy `prisma migrate*` chỉ vì phase 2C đề xuất chúng.

## Definition of done cho backend task

- Scope và phase/requirement liên quan được nêu rõ; source hiện tại và target không bị nhập làm một.
- Tenant, authorization, membership và state-transition invariants phía trên được giữ; có negative tests theo rủi ro của thay đổi.
- Multi-document/state transition được transaction/conditional update phù hợp; queue failure window được xử lý hoặc báo rõ.
- `npm run build` và test liên quan pass. Chạy unit suite đầy đủ khi an toàn; lint bằng `--no-fix` và báo baseline thay vì auto-fix toàn repo.
- Không chạy E2E/migration/seed trên database không được xác nhận. Không đưa secret hoặc nội dung `.env` vào output/docs.
- Kiểm tra API consumer tối thiểu nếu contract đổi; không mở rộng sang frontend implementation ngoài scope.
- `git diff` chỉ chứa thay đổi được yêu cầu và giữ nguyên edits có sẵn của user. Không commit/push nếu chưa được yêu cầu.
- Nếu source, README và `.spec-kit/` lệch nhau, báo file/behavior cụ thể; không tự tick phase hoặc rewrite specification ngoài task.
