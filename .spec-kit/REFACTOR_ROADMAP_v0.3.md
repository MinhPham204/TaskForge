# TaskForge Backend Refactor Roadmap v0.3

> **Trạng thái:** Proposed for Roadmap Review  
> **Ngày:** 2026-08-24  
> **Business baseline:** [`TASKFORGE_BUSINESS_SCOPE_v0.3.md`](../docs/TASKFORGE_BUSINESS_SCOPE_v0.3.md) — Accepted  
> **Architecture baseline:** [`TARGET_TECHNICAL_ARCHITECTURE_v0.3.md`](../docs/TARGET_TECHNICAL_ARCHITECTURE_v0.3.md) và [ADR-001..004](./adr/) — Accepted  
> **Data baseline:** [`POSTGRESQL_TARGET_DATA_MODEL_v0.3.md`](../docs/POSTGRESQL_TARGET_DATA_MODEL_v0.3.md) — Accepted  
> **Phạm vi:** Roadmap backend cấp cao; không phải Detailed Phase Plan, Prisma schema, migration SQL hoặc source implementation.

## 1. Kết luận và hướng chuyển đổi

TaskForge sẽ đi từ:

```text
NestJS 11 modular monolith
+ MongoDB/Mongoose
+ raw model access xuyên module
+ implicit/fail-open tenant plugin
+ legacy Team-centric Task/Approval
```

sang:

```text
Domain-oriented Modular Monolith
+ package by domain/feature
+ pragmatic layers inside each domain
+ explicit fail-closed tenant boundary
+ PostgreSQL-only target runtime
+ UUID v4 opaque IDs
```

Roadmap gồm **12 phase**. Thứ tự được quyết định bởi dependency nghiệp vụ:

```text
PostgreSQL foundation
        ↓
Identity + OrganizationMembership
        ↓
Team
        ↓
Project participants/configuration
        ↓
Task + Checklist + Comment
        ↓
Approval
        ↓
Read/API models
        ↓
Supporting capabilities
        ↓
Frontend contract alignment + one-way cutover
        ↓
Operational hardening
```

Không có phase “move controllers”, “move services” hoặc “move repositories” riêng. Mỗi capability phase đi xuyên qua persistence, repository/data access, service/policy, authorization, API và tests của chính domain đó.

## 2. Current → Target summary

| Area | Current implementation đã kiểm chứng | Target v0.3 | Roadmap owner |
|---|---|---|---|
| Persistence | MongoDB/Mongoose; service/guard inject raw models; chưa có Prisma/PostgreSQL dependency | PostgreSQL duy nhất; ORM nằm sau domain data access | Phase 1 và từng capability phase |
| Source organization | Đã package theo module nhưng service lớn, module export raw MongooseModule/model | Top-level theo domain; pragmatic layers bên trong; public cross-module contract hẹp | Từng capability phase |
| Identity | User bắt buộc có `organization`, global `role`, `team`, ObjectId; refresh hash đơn session | User global, UUID; không Organization role trên User | Phase 2 |
| Organization | `owner`, `members[]`, pending invitations embedded; unique slug/name assumption; nhiều path one-user-one-org | Organization + Membership + Invitation; role SoT chỉ từ active Membership | Phase 2 |
| Tenant boundary | Membership guard/ALS đã có; plugin bỏ filter khi thiếu ALS, không cover aggregate/worker; một số control-plane route còn rộng | Verified active Membership + explicit `organizationId` + ownership/policy; fail-closed | Phase 2 và mọi phase |
| Team | Embedded members có `TEAM_LEAD`; Team invitation; `requireApproval` | Team/TeamMember không role; reusable across Projects; không Team approval | Phase 3 |
| Project | Không có Project aggregate đúng target | Project, Participating Teams, Project Members, roles, status/module config | Phase 4 |
| Task | Task thuộc Team; required due date; embedded assignee/checklist/URL attachment; fixed global status | Task thuộc Project + one owning Participating Team; relational assignee/checklist; Project status | Phase 5 |
| Approval | Team-level config; `PENDING_APPROVAL` là Task status; `approvedBy`/one rejection reason | Task-owned optional Approval độc lập Task Status; immutable request cycles | Phase 6 |
| Query/report | Mongo aggregate trong `TaskService`; dashboard theo legacy roles/team | Project-aware Board/List/My Tasks/overview/search/workload/approval queue | Phase 7 |
| Async | BullMQ/Redis có sẵn; DB+queue không atomic; notification query global User role | Side effect only; explicit tenant payload/recipient; reliability theo requirement | Phase 8 |
| Activity/Audit | Chưa có target capability | Activity projection, append-oriented Audit, không là business SoT | Phase 8 |
| Files | URL strings; chưa có stored-object ownership model | StoredFile + TaskAttachment core + Project Files module | Phase 9 |
| Optional modules | Chưa có Milestones/Documents/Risks/Project Files target | Đúng bốn module, disable giữ data | Phase 9–10 |
| Tests | 11 unit tests chủ yếu guard/interceptor; E2E Hello World không bảo vệ domain | Domain + PostgreSQL integration + tenant/auth negative + critical E2E tăng dần | Mọi phase |
| Docker/deploy | API + Mongo latest + Redis; dev Dockerfile port lệch; chưa migration job/health/CI target | PostgreSQL/Redis, reproducible migration, production image, health/backup/deploy gates | Phase 1 và 12 |
| Frontend contract | Global `user.role`/`user.organization`, ObjectId, Team approval/fixed status; chưa gửi workspace header | Active workspace Membership role, UUID opaque ID, Project-aware contract | Phase 7 và 11 |

## 3. Refactor principles

1. **Accepted baseline thắng legacy.** Source hiện tại chỉ là reference cho behavior có thể giữ; không port `TEAM_LEAD`, Team approval, Team-centric Project hoặc fixed Task Status sang PostgreSQL.
2. **Domain boundary first.** Chỉ tổ chức layer bên trong domain đang được refactor; không di chuyển toàn bộ cây source để làm đẹp.
3. **PostgreSQL-only target.** Không target Mongo adapter, permanent coexistence, cross-database repository hoặc dual-write.
4. **Một source of truth trong mọi thời điểm.** Trước cutover, legacy runtime vẫn là authority; target capability được kiểm chứng trong PostgreSQL test composition nhưng không tạo public write path thứ hai. Sau cutover, PostgreSQL là authority duy nhất.
5. **Không trộn ID graph.** ObjectId legacy không trở thành target FK; UUID không được ghép trực tiếp với Mongo document.
6. **Invariant đi cùng capability.** Test và transaction rule được thêm trước hoặc cùng lúc behavior legacy tương ứng bị bỏ.
7. **Explicit tenant everywhere.** Detail/list/search/aggregate/worker đều nhận verified tenant context và repository query luôn scope Organization rõ ràng.
8. **Business command rõ nghĩa.** Complete/archive/participant/status/approval/module actions không bị ép vào generic patch.
9. **No abstraction ceremony.** Không interface/port/generic repository/use-case class cho mọi CRUD; chỉ tạo seam giúp business logic không phụ thuộc ORM hoặc giữ module boundary.
10. **Technology đúng nhu cầu.** Không RLS, full Outbox, realtime, Redis cache, CQRS, Kafka/RabbitMQ hoặc microservice trong baseline roadmap nếu phase chưa chứng minh requirement.

## 4. Transition và cutover policy

Project và ProjectMembership là dependency mới không tồn tại trong legacy. Legacy Task lại tham chiếu Team/User bằng ObjectId. Vì vậy cutover riêng từng table hoặc cố cho một request đi qua cả MongoDB và PostgreSQL sẽ tạo cross-database invariant không thể bảo vệ an toàn.

Roadmap chọn:

```text
Phase 1–9:  build + verify target capability by dependency
              legacy runtime remains the only served authority
              no target/legacy dual-write

Phase 10:     dependency-closed one-way runtime cutover
              PostgreSQL becomes sole authority
              remove Mongo runtime paths in the same bounded phase

Phase 11–12: add remaining new capability and operational hardening
              on PostgreSQL-only runtime
```

Các target module trước Phase 10 được test qua isolated application/integration composition, không được mở như API production song song. Detailed Phase Plan có thể chọn integration branch hoặc composition-root technique phù hợp, nhưng không được tạo một permanent two-database architecture.

### Data disposition gate

- Mặc định ưu tiên **PostgreSQL seed/reset** nếu Mongo hiện tại chỉ là development/demo data.
- Trước Phase 10 phải xác nhận bằng văn bản dữ liệu Mongo có cần giữ hay không.
- Nếu có production data phải giữ, tạo và Accept một **Data Migration Strategy** riêng trước cutover: mapping ObjectId→UUID, dry-run, validation, rollback/maintenance window. Không tự thêm compatibility column vào target schema hoặc dual-write.
- Quyết định này không chặn Phase 1–9 và không thay đổi target architecture.

## 5. Phase overview

| Phase | Capability outcome | Depends on | Runtime cutover? |
|---:|---|---|---|
| 1 | PostgreSQL foundation, executable schema workflow và test safety net | Accepted baselines | Không |
| 2 | Identity, Authentication, Organization, Membership, Invitation và tenant control plane | 1 | Không |
| 3 | Team/TeamMember không role | 2 | Không |
| 4 | Project, Participants, Task Status và module settings | 2–3 | Không |
| 5 | Task core, assignment, checklist, comment và transitions | 4 | Không |
| 6 | Approval độc lập Task Status | 5 | Không |
| 7 | Project/Task read models và target API contracts | 4–6 | Không |
| 8 | Activity, Audit, Notification và async jobs | 2–7 | Không |
| 9 | Stored files, core Task Attachment và Project Files | 5, 8 | Không |
| 10 | Minimal frontend alignment, seed/data action, PostgreSQL cutover và Mongo removal | 1–9 | **Có** |
| 11 | Milestones, Documents và Risks | 4–5, 8–10 | PostgreSQL only |
| 12 | CI, container/deploy, observability và operational hardening | 11 | PostgreSQL only |

## 6. Phase details

### Phase 1 — PostgreSQL Foundation & Verification Harness

#### Goal

Tạo persistence/test foundation có thể thực thi từ Data Model Accepted mà chưa thay đổi business runtime.

#### Why now

Mọi target capability phụ thuộc UUID, transaction, composite tenant constraint và PostgreSQL integration tests. Làm domain trên Mongo trước sẽ tạo double rewrite.

#### Scope

- PostgreSQL/ORM/migration foundation và application-wide database infrastructure tối thiểu.
- Physical schema/migration từ Data Model Accepted; không redesign domain trong phase plan.
- Dev/test PostgreSQL, Redis và repeatable database lifecycle.
- Convention repository/data access và transaction coordinator tối thiểu cho các phase sau.
- Rebaseline technical constitution/guidance đang hardcode Mongoose/ALS để trỏ về các baseline Accepted, không đổi Business Scope.

#### Target state

- Database trống có thể apply toàn bộ migration và đạt schema v0.3.
- Nest build/generate client thành công; PostgreSQL integration test có database disposable.
- Legacy AppModule vẫn phục vụ Mongo cho tới Phase 10; không có write sang hai DB.

#### Main work

- Chọn/pin ORM version tương thích NestJS 11/Node; thêm PostgreSQL driver.
- Tạo executable schema/migration có review SQL cho enum, partial unique và composite FK.
- Thêm database module/service; controller không thấy ORM client.
- Chuẩn hóa `DATABASE_URL`/migration config trong `.env.example`, không log connection string.
- Loại logging connection URI/secret khỏi bootstrap hiện tại và thêm fail-fast configuration validation tối thiểu.
- Dev Compose có PostgreSQL healthcheck, Redis và migration workflow; không còn dùng image `latest` cho target DB.
- Tạo test helper để reset schema/data trên database disposable, không dùng production target.
- Ghi rõ schema conformance checklist với Data Model Accepted.

#### Verification

- Migration chạy từ volume/database trống và chạy deploy lần hai không tạo pending drift.
- Database tests chứng minh UUID, enum, check, unique/partial unique, composite same-tenant FK và rollback transaction quan trọng.
- Nest build và smoke integration test pass.
- Không có target route hoặc dual-write được bật.

#### Legacy cleanup

Chưa gỡ Mongo/Mongoose. Có thể loại bỏ tài liệu schema PostgreSQL cũ khỏi vai trò source of truth bằng reference/deprecation note, không xóa lịch sử.

#### Dependencies

Business Scope, Target Architecture, Data Model và ADR-001..004 Accepted.

---

### Phase 2 — Tenant Control Plane: Identity, Organization & Membership

#### Goal

Xây target control plane cho global User, authentication, Organization tenant, Membership role SoT, Invitation và onboarding atomic.

#### Why now

Team, Project, authorization và mọi tenant query đều phụ thuộc active OrganizationMembership đã xác minh.

#### Scope

- Identity/Auth repository và API models dùng UUID opaque string.
- Organization, OrganizationMembership, OrganizationInvitation lifecycle.
- Authentication → active Membership → tenant context flow.
- Organization onboarding transaction, last Owner và workspace discovery.
- Minimal Team provisioning contract chỉ để tạo `General` Team/TeamMember trong onboarding; Team management hoàn thiện ở Phase 3.

#### Target state

- User không có Organization role hoặc tenant field trong target model/JWT authorization.
- Registration/onboarding tạo User + Organization + one active OWNER Membership + General Team + creator TeamMember atomically.
- Một User có Membership ở nhiều Organization với role khác nhau.
- Tenant-scoped target access fail-closed; control-plane operation có explicit policy riêng.

#### Main work

- Tách Identity/Auth persistence khỏi raw ORM; giữ `refresh_token_hash` là minimal v1 authentication persistence.
- Implement organization create/onboarding coordinator và Owner transfer/last-owner policy.
- Implement invite/accept/reject/revoke/expire và Membership suspend/revoke/leave lifecycle theo Accepted baseline.
- Thay global User role trong principal bằng `userId` global + verified active Membership context.
- Repository signature bắt buộc explicit tenant cho tenant data; ALS chỉ truyền context, không là correctness layer.
- Thiết kế response DTO hẹp: profile global, workspace membership và invitation; không expose ORM record.
- Thêm domain, persistence, authorization và critical E2E tests cùng phase.

#### Verification

- Organization không thể tồn tại sau onboarding commit nếu thiếu active Owner/General Team/creator TeamMember.
- Exactly one active Owner; competing transfer/remove không làm mất hoặc tạo hai active Owner.
- Admin ở Organization A không có quyền tại B; inactive Membership bị chặn; giả mạo/missing tenant context fail-closed.
- Invitation accept tạo/activate Membership atomically và không quay lại one-user-one-org.
- JWT/global User role không được dùng cho Organization authorization.
- Auth bootstrap không dùng fallback JWT secret; thiếu secret bắt buộc phải fail fast.

#### Legacy cleanup

Đánh dấu target replacement cho `User.organization`, `User.role`, `User.team`, `Organization.owner`, `Organization.members[]`, embedded invitations và control-plane `@SkipTenant()` rộng. Chưa xóa Mongo fields/path trước Phase 10.

#### Dependencies

Phase 1.

---

### Phase 3 — Team Capability

#### Goal

Xây Team như reusable Organization grouping chỉ quản lý tập Member, không role/invitation authority/approval policy.

#### Why now

Project Participants và Task owning Team đều cần Team/TeamMember target ổn định.

#### Scope

- Team metadata/lifecycle và TeamMember relation.
- Team create/update/archive; add/remove Member.
- Dependency query contract để Project/Task kiểm Team membership.
- Hoàn thiện public Team provisioning contract đã dùng trong onboarding.

#### Target state

- Không có `TEAM_LEAD`, `TEAM_MEMBER` role column, Team invitation hoặc `requireApproval` trong target.
- TeamMember luôn trỏ active OrganizationMembership cùng tenant khi add.
- Team archive/remove Member bảo toàn history và cung cấp dependency checks cho Project/Task.

#### Main work

- Team repository/data access với composite tenant integrity.
- Team service/policies và Organization-role authorization theo permission matrix.
- Public Team membership query contract; không export Team ORM/repository.
- API/DTO bỏ lead/promote/invite semantics; ID là opaque UUID.
- Test archive/removal và same-tenant negative cases.

#### Verification

- User ngoài Organization hoặc inactive Membership không thể thành TeamMember.
- Team membership không cấp Organization/Project role.
- Không endpoint/policy nào cần Team Lead để quản lý Team.
- Cross-tenant Team ID không đọc/mutate được.

#### Legacy cleanup

Mark remove: `TeamMemberRole`, `TeamLeadGuard`, promote-to-lead route, Team pending invitations, embedded members role và Team `requireApproval`. Physical Mongo cleanup chờ Phase 10.

#### Dependencies

Phase 2.

---

### Phase 4 — Project, Participants, Status Configuration & Module Settings

#### Goal

Thêm Project aggregate đúng Business Scope và tạo dependency boundary cho mọi Task.

#### Why now

Legacy không có Project model phù hợp; Task không thể refactor đúng trước Participating Teams, Project Members, roles và ProjectTaskStatus.

#### Scope

- Project lifecycle `DRAFT`, `ACTIVE`, `COMPLETED`, `ARCHIVED`.
- ProjectTeam/Participating Team và ProjectMembership/Project Member tách riêng.
- `PROJECT_MANAGER`/`CONTRIBUTOR` và participant commands.
- ProjectTaskStatus configuration + semantic category.
- Bốn ProjectModuleSetting rows và enable/disable commands.
- Project creation transaction.

#### Target state

- Project và Team là peer aggregates trong Organization.
- Project có ít nhất một active Participating Team; active Project có ít nhất một PM.
- Project Member là active Organization Member và thuộc ít nhất một Participating Team.
- Board columns đến từ ProjectTaskStatus; module disable chỉ đổi setting và giữ data.

#### Main work

- Project repositories/query contracts và selective coordinator cho participant dependencies.
- Create Project transaction: default team + creator PM + default status configuration + four module settings.
- Commands add/remove Participating Team, add/remove Member, assign/change role, status configure/reorder/archive, module toggle, lifecycle transitions.
- Authorization phân tách Organization role và Project role; Owner/Admin không auto thành PM.
- API dùng explicit business commands thay generic patch cho participant/status/module/lifecycle.
- Test last PM, participant qualification, status/project ownership và same-tenant constraints.
- Đặt public dependency contracts để Phase 5 bổ sung Task owning-Team/assignee checks vào remove Participating Team, TeamMember và Membership lifecycle; không giả định invariant này đã hoàn tất khi Task target chưa tồn tại.

#### Verification

- Add Team không tự tạo Project Member.
- Invalid/inactive Organization Member hoặc Member không có qualifying Team bị reject.
- Không remove/demote PM cuối của active Project.
- Không remove Participating Team nếu làm participant dependency invalid.
- Status khác Project/archived không dùng cho mutation mới; required semantic status set được bảo toàn.
- Disable module không xóa data hoặc relation.

#### Legacy cleanup

Không tạo compatibility “Project = Team”. Các route/dashboard ngầm Team-centric được đưa vào removal map Phase 7/11.

#### Dependencies

Phase 2–3.

---

### Phase 5 — Task Core, Assignment, Checklist, Comment & Transition

#### Goal

Xây Task aggregate Project-aware, owning-Team/assignee invariants, checklist progress và normal status transition độc lập Approval.

#### Why now

Task cần Project participants, Team membership và ProjectTaskStatus đã ổn định.

#### Scope

- Task, TaskAssignee, ChecklistItem và Comment.
- Task management fields vs execution fields và authorization riêng.
- Project-configurable status transitions, checklist/progress/completion baseline.
- Task archive/history; due date optional.
- Task Attachment chỉ đặt contract seam; storage implementation ở Phase 9.

#### Target state

- Task thuộc đúng một Project và một owning Participating Team.
- Assignee là active Project Member đồng thời thuộc owning Team; multi-assignee là shared responsibility.
- Task có một workflow state chung từ ProjectTaskStatus.
- Checklist là progress SoT khi có active items; completed Task có effective progress 100%.

#### Main work

- Focused Task services/policies cho assignment, owning-Team change, transition và completion; tránh `task.service.ts` god service.
- Repository queries luôn mang Organization/Project context; không Prisma query trong controller/service policy.
- Transaction revalidation khi assign/change owning Team/status/complete.
- Comment author/visibility/soft-delete theo ProjectMembership.
- Hoàn thiện cross-domain dependency checks cho remove Participating Team, remove TeamMember và suspend/revoke/leave Membership khi đang có owning Task/assignee; finalize Complete Project coordinator trên consistent terminal-Task query.
- CRUD/API DTO tách management/execution; explicit transition command.
- Board-relevant domain output không expose ORM model.

#### Verification

- Owning Team không participating, assignee ngoài Project hoặc ngoài owning Team đều fail.
- Change owning Team revalidate toàn bộ current assignees và không silently drop relation.
- Status phải thuộc cùng Project và active.
- Task không complete nếu required checklist item chưa xong; checklist/manual progress không tạo hai SoT.
- Archived Project/Task chặn normal mutation.
- Không remove Participating Team/TeamMember/Membership nếu làm owning Team hoặc current assignee invalid; dependency phải được xử lý bằng explicit command trước.
- Project không thể chuyển `COMPLETED` khi còn Task non-terminal.
- Cross-tenant detail/list/update/delete fail-closed.

#### Legacy cleanup

Mark replace: Team-only Task, fixed `TaskStatus`, embedded `assignedTo[]`, embedded todos, required `dueDate`, global role/team-lead mutation policy và Mongoose aggregate coupling. Chưa xóa runtime path trước Phase 10.

#### Dependencies

Phase 4.

---

### Phase 6 — Task Approval

#### Goal

Implement Approval như Task-owned capability độc lập Task Status với immutable request cycles và completion gate.

#### Why now

Approval cần Task transition/completion policy ổn định; làm cùng fixed legacy status sẽ tái tạo model sai.

#### Scope

- `requiresApproval`, designated approver và request history.
- Request/cancel/approve/reject commands và race-safe terminal transition.
- Approval queue contract cho Phase 7.
- Audit/activity/notification intent contract; persistence side effects hoàn thiện ở Phase 8.

#### Target state

- `REVIEW` chỉ là semantic Task Status, không phải Approval.
- Mỗi request cycle đi `PENDING` đến một terminal outcome; terminal row không overwrite/reuse.
- Pending request không bị generic edit silently disable.
- Task yêu cầu approval không complete nếu chưa có approval hợp lệ theo policy hiện hành.

#### Main work

- Focused approval service/policy trong Task module; không generic top-level Approval module v1.
- Conditional update/transaction cho competing approve/reject/cancel.
- Designated approver phải là active eligible Project Member tại action time.
- Bổ sung pending-approval dependency vào Membership/TeamMember/ProjectMember removal coordinators; không để approver mất eligibility mà request bị silently bypass.
- Giữ feature-policy TBD explicit: self-approval, invalidating fields/request lại, cancel/reassign actor.
- API dùng business command endpoints và response/history DTO riêng.

#### Verification

- Status `REVIEW` hoạt động với Task không yêu cầu approval.
- Không có `PENDING_APPROVAL`/`REJECTED` như Task Status.
- Chỉ một competing terminal action thành công; history cũ không đổi.
- Pending approval không thể bypass bằng disabling/complete patch.
- Invalid/inactive/cross-Project approver bị chặn.

#### Legacy cleanup

Mark remove/replace: Team `requireApproval`, Team Lead approver, auto-complete/auto-return status semantics, `approvedBy` và one overwritten `rejectionReason`.

#### Dependencies

Phase 5; feature-policy TBD tương ứng phải được chốt trong Detailed Approval Phase Plan trước khi implement action bị ảnh hưởng.

---

### Phase 7 — Core Read Models, Search, Reporting & API Contract

#### Goal

Hoàn thiện query/API surface cho frontend và vận hành core domain mà không thêm CQRS/cache sớm.

#### Why now

Read model chỉ ổn định sau Project, Task và Approval source-of-truth model.

#### Scope

- Project Overview, Board, Task List, My Tasks, dashboard, workload, search/filter và approval queue.
- Workspace discovery/directory và target API resource hierarchy.
- Contract mapping UUID opaque IDs, tenant header, Project roles và configured statuses.
- Route/consumer audit backend–frontend.

#### Target state

- Read query dùng PostgreSQL index/query trước; projection riêng chỉ khi query thực tế cần.
- Board render từ ProjectTaskStatus config; approval UI state không derive từ REVIEW.
- API không expose Prisma record/ObjectId/global User role.

#### Main work

- Focused query services/read DTO trong owning module; aggregate/projection không là business SoT.
- Explicit tenant/project filters cho list/search/report.
- Pagination shared primitive; filter thuộc domain.
- Lập target-vs-current API contract map và compatibility policy cho Phase 10; không invent Team→Project mapping.
- Contract tests cho main response và negative tenant case.

#### Verification

- Board order/name/semantic đúng config Project.
- My Tasks, approval queue và workload không leak Organization/Project khác.
- `CANCELLED` không tính là completed metric.
- Query source values khớp transactional data; cache/projection failure không đổi business state.

#### Legacy cleanup

Mark replace: Mongo aggregation, role-specific legacy dashboard, fixed status labels và frontend paths dựa Team/global role.

#### Dependencies

Phase 4–6.

---

### Phase 8 — Activity, Audit, Notification & Async Boundary

#### Goal

Thêm supporting records/side effects mà không biến queue, Activity hoặc Notification thành source of truth.

#### Why now

Business commands và target recipient/resource relations đã ổn định; trước đó event payload dễ mang legacy assumption.

#### Scope

- Activity timeline projection, append-oriented AuditLog và Notification.
- Domain event classification cho core commands.
- BullMQ producers/workers/reminders và recipient eligibility.
- Reliability/idempotency theo từng side effect; selective Outbox chỉ nếu requirement chứng minh cần.

#### Target state

- Source-of-truth transaction hoàn tất trước success response.
- Worker payload có verified Organization/resource identity; worker revalidate access/recipient.
- Queue/email/realtime failure không rollback hoặc thay business truth.
- Audit records critical command; Activity/Notification có thể rebuild/reconcile theo policy.

#### Main work

- Public event/intent contract hẹp, không gửi ORM record.
- Chuyển reminder scan và notification recipients sang PostgreSQL queries explicit tenant.
- Idempotency/dedup/retry; đánh giá transaction-outbox gap cho từng critical flow.
- Tách worker/scheduler bootstrap role nếu multiple API replicas sẽ duplicate cron.
- Không thêm realtime transport trong phase nếu chưa có requirement.

#### Verification

- Không notification cross-tenant; inactive recipient/ProjectMember không nhận action link trái quyền.
- Duplicate job không duplicate business mutation; retry an toàn.
- Worker chạy ngoài HTTP ALS vẫn scope đúng tenant.
- Notification/Activity failure không làm mất committed Task/Approval state.
- Audit không có normal update/delete path và redacts secret.

#### Legacy cleanup

Mark replace: NotificationConsumer query global `User.role`, Mongoose cross-tenant cron scan assumptions và direct DB-mutation→queue coupling không có idempotency.

#### Dependencies

Phase 2–7.

---

### Phase 9 — Files, Storage, Task Attachment & Project Files

#### Goal

Thiết lập object-storage boundary và authorization dựa trên business relation.

#### Why now

Stored file visibility cần Organization, Project, Task và ProjectMembership đã ổn định.

#### Scope

- StoredFile metadata/storage adapter.
- TaskAttachment core capability.
- Project Files optional module capability.
- Upload/finalize/download/unlink/cleanup contracts và retention baseline.

#### Target state

- Object key không là permission token; download đi qua relation authorization.
- Task Attachment hoạt động dù Files module disabled.
- Disable Files module giữ ProjectFile/StoredFile history và chặn normal mutation mới.

#### Main work

- Storage service/adapter nhỏ; provider exact chọn trong Detailed Phase Plan.
- Metadata/relationship transactions và orphan cleanup strategy.
- File validation/size/type/security policy theo requirement; không lưu raw URL array trên Task.
- Authorization/integration tests cho cross-tenant/object-key abuse.

#### Verification

- Không attach/download file khác tenant/Project.
- Disable Files module không ảnh hưởng Task Attachment.
- Unlink/archive không hard-delete bytes còn historical reference.
- Failed upload/finalize có cleanup/retry path rõ.

#### Legacy cleanup

Mark replace: `Task.attachments: string[]`, direct URL trust và file visibility không có relational owner.

#### Dependencies

Phase 5 và 8.

---

### Phase 10 — Frontend Contract Alignment, PostgreSQL Cutover & Mongo Removal

#### Goal

Chuyển application runtime một chiều sang PostgreSQL và loại bỏ toàn bộ legacy Mongo/domain path sau khi dependency graph target đã khép kín.

#### Why now

Cutover sớm hơn buộc runtime trộn ObjectId/Mongo entity với UUID/Project target. Phase này diễn ra ngay khi core cùng các capability legacy cần thay thế đã khép kín; các optional module hoàn toàn mới có thể tiếp tục được thêm trên PostgreSQL sau cutover.

#### Scope

- Minimal frontend alignment bắt buộc cho workspace/UUID/Project/status/approval/API target.
- Target AppModule composition; seed/reset hoặc execute Data Migration Strategy đã Accepted.
- Cutover smoke/security test; remove Mongoose/Mongo/plugin/schema/legacy routes and assumptions.
- Documentation/config/seed alignment.

#### Target state

```text
TaskForge runtime
        ↓
PostgreSQL
```

Không còn MongoDB trong target runtime, no dual-write, no Mongoose import, no ObjectId API validator và no legacy role/status authority.

#### Main work

- Frontend active workspace state gửi verified `X-Organization-Id`, reset tenant cache khi switch và dùng Membership/Project role đúng context.
- Cập nhật client contract cho UUID opaque IDs, Participating Teams/Project Members, configured Board status và Approval riêng.
- Chạy full target test composition; backup/checkpoint trước data action.
- Nếu dev/demo: reset PostgreSQL bằng seed target. Nếu production: chỉ thực hiện migration theo strategy riêng đã review.
- Switch composition root/config/containers; remove Mongo/Mongoose, tenant plugin, migration compatibility, Mongo seeder và legacy source paths.
- Không giữ compatibility endpoint nào tái tạo business model cũ; deprecation chỉ áp dụng cho transport shape có thể map đúng semantic.

#### Verification

- Full critical E2E: onboarding, multi-org switch, Team, Project participants/configuration, Task/Checklist, Approval, file và async.
- Tenant/security matrix xanh cho detail/list/search/report/worker.
- Không import/use `mongoose`, `@nestjs/mongoose`, ObjectId validator, `MONGO_URI`, Mongo service/container hoặc legacy collection.
- Frontend không derive authorization từ global `user.role`/`user.organization`, Team Lead hoặc fixed status.
- PostgreSQL seed/migration validation không orphan FK; smoke rollback action được xác định trước cutover.

#### Legacy cleanup

Đây là cleanup phase chính: xóa toàn bộ legacy Mongo persistence và obsolete domain behavior đã được đánh dấu ở Phase 2–9. Không xóa lịch sử planning; các plan cũ được giữ với classification ở Section 8.

#### Dependencies

Phase 1–9 và data disposition gate.

---

### Phase 11 — Optional Modules: Milestones, Documents & Risks

#### Goal

Hoàn thiện ba optional module còn lại theo fixed v1 registry, không dynamic schema/module builder.

#### Why now

Các module cần ProjectModuleSetting, ProjectMembership, Task relations, Audit và Files boundary đã có. Chúng là capability mới, không cần kéo dài Mongo coexistence hoặc chặn core cutover.

#### Scope

- Milestone metadata/lifecycle/progress aggregate và optional Task relation.
- Document content/author/editor/archive.
- Risk owner/state/mitigation và Risk–Task links.
- Module gate cho create/mutation; read/history preservation khi disabled.

#### Target state

- Project chỉ có đúng bốn optional module v1: Milestones, Documents, Files, Risks.
- Disable không hard-delete data/relation/history.
- Optional module state không tự transition Task/Project ngoài rule đã Accepted.

#### Main work

- Module-specific repository/service/API/policy trong domain phù hợp; không tạo module chỉ vì một table nếu ownership không cần.
- Resolve feature-level TBD trước operation tương ứng: Milestone lifecycle, Risk scales/eligibility, module default values và file policy.
- Integration/authorization/E2E tests cho enabled/disabled behavior.

#### Verification

- Disabled module chặn normal create/mutation nhưng dữ liệu cũ vẫn đọc được theo policy.
- Milestone/Risk/Document và Task relation luôn cùng Project/tenant.
- Task completion không tự close Milestone; Risk resolution không tự transition Task.
- Không custom entity/module/dynamic schema path.

#### Legacy cleanup

Không port feature placeholder/path frontend chưa có backend hoặc schema động cũ. Files module đã được hoàn thiện ở Phase 9.

#### Dependencies

Phase 4–5, 8–10.

---

### Phase 12 — CI, Deployment & Operational Hardening

#### Goal

Đưa PostgreSQL-only target vào trạng thái build/test/deploy lặp lại được và vận hành an toàn.

#### Why now

CI/deploy phải kiểm đúng target runtime; làm production manifest trước cutover sẽ phải viết lại cho Mongo/legacy module.

#### Scope

- CI backend/frontend target, migration verification và security tests.
- Production multi-stage image, migration job, PostgreSQL/Redis deployment, health/readiness/graceful shutdown.
- Backup/restore smoke, secrets/config validation, worker/scheduler deployment role.
- Documentation phản ánh source thực tế.

#### Target state

- Clean checkout có thể install/build/test/migrate/start theo documented workflow.
- Production API không tự chạy concurrent migrations; DB/Redis không public.
- Worker/scheduler không duplicate ngoài ý muốn khi scale API.

#### Main work

- CI dùng `npm ci`, non-mutating lint/typecheck, unit, PostgreSQL integration, critical E2E và build.
- Pin runtime images/dependencies; healthchecks và one-shot migration deploy.
- Bootstrap validation fail-fast cho required config; không log secret/connection URI.
- PostgreSQL backup/restore smoke; retry/dead-letter/alert baseline cho jobs.
- Update README/operations docs; benchmark/query tuning chỉ theo measurement.

#### Verification

- CI xanh từ clean environment; migration deploy từ database trống và upgrade path được test.
- API readiness phụ thuộc PostgreSQL/migration hợp lệ; graceful shutdown đóng queue/DB đúng.
- Backup restore vào database mới và critical smoke pass.
- No production port exposure cho PostgreSQL/Redis; secrets không nằm trong repo/log.

#### Legacy cleanup

Loại Mongo references trong deploy/CI/README/env example; archive hoặc gắn superseded note cho operational instructions cũ khi cần, không xóa lịch sử mù quáng.

#### Dependencies

Phase 11.

## 7. Critical invariant ownership

| Invariant | Primary phase | Required verification layer |
|---|---:|---|
| OrganizationMembership là Organization role SoT | 2 | Unit policy + persistence + authorization E2E |
| Exactly one active Owner | 2 | Partial unique DB test + transaction/race test |
| Team không role | 3 | Schema absence + authorization/API tests |
| ProjectTeam và ProjectMembership riêng | 4 | Persistence + API/E2E |
| Active Project có PM | 4 | Domain + transaction/race integration |
| Project Member có qualifying Team | 4 | Domain + DB ingredients + integration |
| Task owning Team thuộc Project | 5 | Composite FK + lifecycle integration |
| Assignee thuộc Project và owning Team | 5 | Domain/transaction + tenant integration |
| ProjectTaskStatus thuộc Project | 4–5 | Composite FK + transition tests |
| Checklist/completion | 5 | Domain + transaction E2E |
| Approval độc lập Task Status | 6 | Domain/state/race + E2E |
| Project complete chỉ khi mọi Task terminal | 5 | Consistent query + transaction/race integration |
| Tenant isolation fail-closed | 2, then every phase | Negative repository/authorization/E2E |
| Module disable giữ data | 4, 9–10 | Persistence + authorization/E2E |
| Activity/Audit/Notification không là SoT | 8 | Failure/retry integration |

Không dồn các test này vào Phase 12. Phase 12 chỉ chạy lại/gate toàn bộ safety net đã được xây cùng capability.

## 8. Existing `.spec-kit` classification

Các tài liệu cũ được giữ làm lịch sử. Business Scope/Architecture/Data Model v0.3 và roadmap này có priority cao hơn khi assumption xung đột.

| Artifact | Classification | Phần còn dùng được | Phần bị thay thế/cần cập nhật |
|---|---|---|---|
| `constitution.md` | Needs update | Tenant isolation, atomic mutation, RBAC intent | Hardcode Mongoose/ALS như correctness/tech stack; thiếu Accepted PostgreSQL/domain boundaries |
| `phase-1-va-loi-backend` | Superseded by v0.3 business model | Conditional atomic transition và assignee validation technique | Team Lead, Team `requireApproval`, fixed approval statuses, self-approval decision cũ |
| `phase-2-multi-org-membership` | Needs update | Header + active Membership, fail-closed guard, workspace/cache intent; một phần đã có trong source | Mongo backfill/cutover, global schema vocabulary và checklist chưa phản ánh target onboarding/lifecycle |
| `phase-2c-postgresql-database-dockerization` | Superseded as schema/phase plan; reusable operational notes | PostgreSQL direction, explicit tenant repository, migration workflow, test/Docker/cutover concepts | TEAM_LEAD, Team approval/invitations, fixed status, old tables, mandatory RLS/outbox, long rollback coexistence, full-DDD folder assumptions |
| `phase-3-audit-sync-route` | Needs update | Route/consumer/header audit | User directory qua Mongoose plugin; API chưa Project-aware/UUID target |
| `phase-4-hoan-thien-frontend` | Needs update | Workspace switch/reset-cache and active Membership role | Team approval toggle, legacy rejected status và global-role dashboards |
| `phase-5-unit-test` | Needs update | Security/race/incremental test priority | Mongo test tooling và legacy approval state/self-approval assumptions |
| `phase-6-benchmark` | Superseded | Chỉ giữ principle “measure actual workload” | Mongo collection/index benchmark; target tuning phải dùng PostgreSQL queries sau Phase 7 |
| `phase-7-ci-docs` | Needs update | CI/docs objective | Mongoose/ALS architecture text và mutating lint script assumption |
| `phase-8-deploy` | Needs update | Multi-stage image, private data services, CORS/seed intent | Mongo deployment/env/backup target |
| `example.plan.md` | Still valid for future Detailed Phase Plan | Checklist template intent | Không dùng nó thay roadmap hoặc tự tạo file-level plan trong task này |
| Root `TASKFORGE_UPGRADE_PLAN*`/`DATABASE_SCHEMA.md` | Superseded reference | Historical context only | Không được ghi đè Accepted v0.3 hoặc roadmap status |

## 9. Legacy deprecation/removal map

| Legacy area | Target action | Built/replaced in | Physically removed in |
|---|---|---:|---:|
| `User.organization`, `User.role`, `User.team` | Remove; global User + Membership | 2 | 10 |
| `Organization.owner`, `members[]`, embedded invitations | Replace with Membership/Invitation | 2 | 10 |
| One-user-one-org registration/invitation | Replace with onboarding/Membership lifecycle | 2 | 10 |
| Implicit/fail-open Mongoose tenant plugin | Replace with explicit repository scoping | 2 onward | 10 |
| Team member roles/`TEAM_LEAD`/lead guard | Remove | 3 | 10 |
| Team invitation authority | Remove from v0.3 | 3 | 10 |
| Team `requireApproval` | Remove | 3, 6 | 10 |
| Team-centric Project assumption | Replace with Project aggregate | 4 | 10 |
| Fixed global Task Status/`PENDING_APPROVAL`/`REJECTED` | Replace with ProjectTaskStatus + Approval state | 4–6 | 10 |
| Task embedded assignee/checklist/attachment URLs | Replace with relations/storage | 5, 9 | 10 |
| Approval `approvedBy`/one rejection reason | Replace with immutable request cycles | 6 | 10 |
| Mongo dashboard/aggregate query | Replace with PostgreSQL query/read DTO | 7 | 10 |
| Notification recipient from global User role | Replace with verified Membership/Project relation | 8 | 10 |
| Mongo seeder/membership migration/replica-set Compose | Replace with PostgreSQL seed/migrations/Compose | 1, 10–12 | 10 |
| ObjectId validators/public assumptions | Replace with opaque UUID contract | 2–10 | 10 |
| Raw Mongoose exports/imports across modules | Replace with public service/query contracts | Each owner phase | 10 |

## 10. Test progression

| Milestone | Test growth required before exit |
|---|---|
| Phase 1 | Migration/schema constraints, transaction rollback, database lifecycle |
| Phase 2 | Identity/Organization policy, Owner race, Membership isolation/RBAC, onboarding E2E |
| Phase 3 | Team tenant/member eligibility and no-role authorization |
| Phase 4 | Participant qualification, last PM, status/module constraints and Project commands |
| Phase 5 | Owning Team, assignee intersection, checklist/completion, archived mutation |
| Phase 6 | Approval separation, completion gate, pending bypass and competing action |
| Phase 7 | Query correctness, API contracts, list/search/report tenant negatives |
| Phase 8 | Worker isolation, idempotency/retry, notification recipient, audit immutability |
| Phase 9 | File relation authorization, orphan/cleanup and module independence |
| Phase 10 | Full critical backend E2E + frontend workspace/contract smoke + no-Mongo scan |
| Phase 11 | Disabled-module mutation/history and cross-Project relation negatives |
| Phase 12 | Clean CI, migration deploy, container readiness, backup/restore smoke |

Test pyramid ưu tiên:

```text
domain/business tests
        ↓
PostgreSQL repository/constraint integration tests
        ↓
authorization + tenant negative tests
        ↓
critical E2E/contract tests
```

Mock ORM không thay thế database-level test cho FK/unique/transaction. E2E scaffold hiện tại chỉ kiểm Hello World và phải được thay bằng target application test harness; không chạy database-stateful test trên environment chưa xác nhận disposable.

## 11. Backend → frontend alignment points

Frontend không cần refactor song song từng internal backend phase. Hai điểm alignment bắt buộc:

1. **Phase 7 — contract freeze:** frontend team/client nhận target resource/action/DTO map, UUID opaque ID, tenant header, active Membership role, Project participants/status/approval semantics.
2. **Phase 10 — implementation + cutover:** workspace selector/header/cache reset, Project-aware navigation/Board, new approval model và removal global role/ObjectId/fixed-status assumptions.

Backend có thể giữ transport compatibility chỉ khi semantic map một-một. Không tạo default Project/Team Lead/approval-status shim để giữ UI cũ vì đó là business rule mới hoặc đưa legacy model quay lại.

## 12. Mapping về Accepted baselines

| Roadmap phases | Business Scope v0.3 | Target Architecture v0.3 | Data Model v0.3 |
|---|---|---|---|
| 1 | Technical boundary | §8 Persistence, §13 testing | §2 conventions, §5–8 constraints/transactions |
| 2 | §3–6, onboarding/invariants 1–5 | Identity/Organization, authorization, onboarding transaction | `users`, `organizations`, Membership, Invitation |
| 3 | §7, Team decisions/invariants | Team ownership/authorization | `teams`, `team_members` |
| 4 | §8–9, §11, Project invariants | Project aggregate, participants/status/modules | Project/participants/status/settings tables |
| 5 | §10–12, §15, §18 | Task/checklist/comment aggregate and transaction policy | Task/assignee/checklist/comment tables |
| 6 | §13 | Approval logical model, commands/history/completion gate | Task approval config + request cycles |
| 7 | §21 and core views | API/read model/projection/cache guidance | Important indexes and transactional SoT |
| 8 | §19–20 | Domain event/async/activity/audit/notification | Activity/Audit/Notification tables |
| 9 | §16 | Files/storage and Task Attachment independence | StoredFile/TaskAttachment/ProjectFile |
| 10 | Accepted core and existing capability cutover | Migration implications/API/frontend contract | Legacy difference/delete/archive policies |
| 11 | §14, §15, §17 and module rules | Optional module boundaries | Milestone/Document/Risk/link tables |
| 12 | Non-business operational boundary | Deployment/testing/technical risks | Executable verification of Accepted schema |

## 13. Phase-level TBD and risk controls

Các TBD dưới đây không mở lại hierarchy/domain model và không chặn bắt đầu roadmap:

| Gate | Must be resolved by | Effect |
|---|---:|---|
| Mongo data disposable hay production cần giữ | Before Phase 10 | Seed/reset hoặc separate Data Migration Strategy |
| Exact ORM version/generator location | Phase 1 Detailed Plan | Tool compatibility; UUID v4 decision không đổi |
| Invitation/Organization exact edge lifecycle còn deferred | Phase 2 affected command | Chỉ block operation tương ứng |
| Project status name uniqueness/module defaults | Phase 4 | Chỉ config policy tương ứng |
| Contributor field/transition permissions | Phase 5 | Command authorization, không đổi role model |
| Self-approval/invalidation/cancel-reassign policy | Phase 6 | Approval operations tương ứng; không pre-model revision |
| Outbox requirement | Phase 8 | Chỉ thêm nếu reliability requirement biện minh |
| Storage provider/upload policy | Phase 9 | Adapter/operational policy, không đổi StoredFile relation |
| Milestone/Risk vocabularies | Phase 11 | Module-specific API/schema code choice |

Rủi ro lớn nhất là trộn source of truth trong giai đoạn chuyển đổi. Control bắt buộc là no dual-write, no public target API trước dependency closure, full tenant/contract tests trước cutover và physical Mongo removal ngay trong bounded Phase 10 thay vì để coexistence vô thời hạn.

## 14. Definition of Done toàn roadmap

Roadmap hoàn thành khi:

- [ ] PostgreSQL là persistence duy nhất của runtime; MongoDB/Mongoose/ObjectId assumptions đã bị loại khỏi source/config/container.
- [ ] Source top-level theo domain; layer nằm trong owning domain; shared không chứa business dumping ground.
- [ ] User là global identity; active OrganizationMembership là Organization role SoT duy nhất.
- [ ] Exactly one active Owner và last Project Manager invariants có transaction/race tests.
- [ ] Team không role; ProjectTeam và ProjectMembership tách riêng.
- [ ] Project status configurable theo Project; Board không dùng fixed global Task Status.
- [ ] Task owning-Team/assignee/checklist/completion invariants được bảo vệ.
- [ ] Approval độc lập Task Status và giữ immutable request history.
- [ ] Optional module disable giữ data; Task Attachment không phụ thuộc Files module.
- [ ] Tenant isolation fail-closed cho request, list/search/report, worker và file access.
- [ ] Activity/Audit/Notification/queue không là business source of truth.
- [ ] Unit, PostgreSQL integration, authorization/tenant negative, contract và critical E2E tests xanh.
- [ ] Frontend không dùng global User role/organization, Team Lead, ObjectId semantics hoặc fixed approval status.
- [ ] Clean CI/deploy/migration/backup-restore workflow phản ánh đúng PostgreSQL target.
- [ ] Legacy planning documents được giữ lịch sử nhưng không còn chi phối implementation mới.

## 15. Readiness decision

**Roadmap Blocking Decision = 0**

Không còn blocker kiến trúc hoặc schema trước khi bắt đầu Detailed Plan cho Phase 1. Các feature/operational TBD đã được gắn đúng phase và chỉ chặn operation tương ứng. Data disposition chỉ phải khóa trước Phase 10, không chặn foundation/core implementation.

Flow tiếp theo:

```text
Refactor Roadmap
        ↓
Select Phase
        ↓
Detailed Phase Plan
        ↓
Implement
        ↓
Test / Review
        ↓
Next Phase
```

**Phase nên triển khai đầu tiên:** Phase 1 — PostgreSQL Foundation & Verification Harness.
