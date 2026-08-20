# Đánh giá hiện trạng và phương án thay thế MongoDB bằng PostgreSQL

> Ngày đánh giá: 2026-08-10  
> Phạm vi: Backend NestJS, mô hình multi-organization, frontend contract và hạ tầng dữ liệu liên quan.

## 1. Đánh giá hiện trạng dự án

Backend hiện là NestJS modular monolith, gồm các miền chính: Auth, User, Organization, Membership, Team, Task, Automation/BullMQ và Redis.

Hướng thiết kế tổng thể là hợp lý, đặc biệt:

- Đã có mô hình multi-organization thông qua `Membership`.
- Có tenant context bằng `AsyncLocalStorage`.
- Task và Team đã mang `organization`.
- Có Redis/BullMQ cho tác vụ nền.
- MongoDB đang chạy replica set để hỗ trợ transaction.

Tuy nhiên, dự án hiện đang ở trạng thái chuyển đổi tenancy “nửa cũ, nửa mới”:

- `Membership` được định hướng là nguồn xác thực quyền theo organization.
- Nhưng `User` vẫn còn `role`, `organization` và `team`.
- `Organization.members` và `Membership` cùng biểu diễn quan hệ thành viên.
- Một số service, guard, JWT strategy và worker vẫn đọc quyền từ `User`.
- Frontend vẫn xem ID là MongoDB ObjectId và còn phụ thuộc `user.organization`/`user.role`.

Đây là rủi ro lớn hơn bản thân việc chọn MongoDB hay PostgreSQL, vì có thể dẫn tới kiểm tra quyền không nhất quán hoặc truy cập chéo tenant.

Chi tiết hiện trạng kiến trúc đã được ghi nhận trong [`BACKEND_ARCHITECTURE_PHASE_REVIEW.md`](./BACKEND_ARCHITECTURE_PHASE_REVIEW.md).

### 1.1. Mức độ phụ thuộc MongoDB

Khoảng 30 file backend đang phụ thuộc trực tiếp vào Mongoose. Phạm vi không chỉ nằm ở schema:

- Kết nối và global plugin tại `backend/src/app.module.ts`.
- Tenant filtering tại `backend/src/common/plugins/tenant.plugin.ts`.
- `ObjectId`, `.equals()`, `.populate()` và `.lean()` trong service và guard.
- Mongo aggregation trong `TaskService`.
- Array mutation bằng `$pull`, array filter và nested document.
- Mongo session/transaction trong Auth.
- DTO dùng `@IsMongoId`.
- Seeder và script migration phụ thuộc Mongoose.
- Docker Compose và biến môi trường dùng `MONGO_URI`.

Hiện chỉ có hai file test, về cơ bản là test mặc định. Vì vậy backend chưa có đủ safety net để đổi database an toàn.

## 2. Có nên chuyển sang PostgreSQL?

**Có. Với mô hình hiện tại, PostgreSQL phù hợp hơn MongoDB về dài hạn.**

Dữ liệu của TaskForge mang tính quan hệ rõ rệt:

- User ↔ Organization qua Membership.
- Organization → Team.
- Team ↔ User qua Team Member.
- Task → Team.
- Task ↔ User qua Assignee.
- Role và authorization phụ thuộc vào các quan hệ này.
- Dashboard cần join, group, count và filter theo nhiều chiều.

PostgreSQL sẽ đem lại:

- Foreign key bảo vệ tính toàn vẹn dữ liệu.
- Unique/check constraint thể hiện business rule tại database.
- Transaction không cần replica-set setup riêng.
- Query báo cáo và dashboard tự nhiên hơn.
- Có thể sử dụng Row-Level Security làm lớp bảo vệ tenant thứ hai.
- Migration schema có lịch sử rõ ràng.

PostgreSQL Row-Level Security có cơ chế default-deny khi bật RLS nhưng không có policy phù hợp. Tuy nhiên, user chạy ứng dụng không nên là table owner hoặc có quyền bypass RLS. Tham khảo [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

## 3. Stack đề xuất

Đề xuất sử dụng:

- PostgreSQL.
- Prisma ORM.
- Prisma Migrate.
- Giữ nguyên Redis và BullMQ.
- Repository/use-case boundary để application layer không phụ thuộc trực tiếp Prisma.

Prisma có integration chính thức với NestJS, hỗ trợ PostgreSQL, migration SQL có thể chỉnh sửa và nhiều kiểu transaction:

- [Prisma ORM với NestJS](https://docs.prisma.io/docs/guides/frameworks/nestjs)
- [Prisma Migrate](https://docs.prisma.io/docs/orm/prisma-migrate)
- [Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)

TypeORM cũng dùng được, nhưng với dự án này Prisma có lợi thế về type safety, schema dễ review và migration rõ ràng. Dù chọn Prisma, không nên inject `PrismaService` khắp controller/guard; nên đóng nó sau repository hoặc application service.

## 4. Mô hình PostgreSQL đề xuất

| MongoDB hiện tại | PostgreSQL đề xuất |
|---|---|
| `users` | `users` |
| `organizations.members[]` | Loại bỏ, dùng `memberships` |
| `users.organization`, `users.role` | Loại bỏ |
| `memberships` | `memberships` với unique `(user_id, organization_id)` |
| `teams.members[]` | `team_members` |
| `organizations.pendingInvitations[]` | `organization_invitations` |
| `teams.pendingInvitations[]` | `team_invitations` |
| `tasks.assignedTo[]` | `task_assignees` |
| `tasks.todoCheckList[]` | `task_todos` |
| `tasks.attachments[]` | Có thể giữ `text[]`, hoặc dùng `task_attachments` nếu cần metadata |

Các bảng tenant-scoped như `teams`, `tasks`, `team_members` và `task_assignees` cần có `organization_id`.

Một số constraint nên có:

- Unique membership: `(user_id, organization_id)`.
- Unique team name: `(organization_id, normalized_name)`.
- Unique team member: `(team_id, user_id)`.
- Unique task assignee: `(task_id, user_id)`.
- Foreign key với `ON DELETE` được lựa chọn rõ ràng.
- Check `progress BETWEEN 0 AND 100`.
- Partial unique index nếu mỗi organization chỉ được có một active owner.
- Composite foreign key nếu muốn database đảm bảo Task và Team luôn cùng organization.

ID nên dùng UUID cho hệ thống mới. Nếu phải giữ dữ liệu hiện hữu, thêm `legacy_mongo_id varchar(24) unique` trong giai đoạn migration để đối chiếu và rollback. Frontend vốn nên xem ID là chuỗi opaque, nhưng DTO backend phải đổi từ `@IsMongoId` sang `@IsUUID`.

## 5. Thiết kế multi-tenant sau chuyển đổi

Không nên thay global Mongoose plugin bằng một “global Prisma middleware” tương tự rồi tiếp tục phụ thuộc vào hành vi ngầm.

Nên áp dụng hai lớp:

1. Application/repository luôn nhận `organizationId` tường minh và fail-closed nếu thiếu tenant context.
2. PostgreSQL RLS là lớp phòng vệ bổ sung cho bảng tenant-scoped.

Các bảng global/control-plane:

- `users`
- `organizations`
- `memberships`

không được auto-filter giống Task/Team. Quyền truy cập chúng phải được kiểm tra qua use case cụ thể.

BullMQ worker, cron, migration và seeder chạy ngoài HTTP context nên luôn mang `organizationId` trong job payload hoặc gọi một API repository cross-tenant được đặt tên rõ ràng.

## 6. Những phần phải viết lại

Việc chuyển đổi sẽ tác động đáng kể tới backend:

- 5 Mongoose schema.
- Các module đăng ký `MongooseModule.forFeature`.
- User, Organization, Membership, Team, Task và Auth service.
- Ba nhóm guard.
- JWT strategy.
- Hai automation worker/producer.
- Seeder và migration script.
- Tenant plugin và cấu hình kết nối.
- Docker Compose, `.env` và README.
- DTO chứa `IsMongoId`.
- Mongo aggregation/dashboard.
- Các response hiện đang trả Mongoose document hoặc populated document.

Frontend không cần viết lại lớn, nhưng phải:

- Không giả định ID là ObjectId.
- Dùng active organization và gửi `X-Organization-Id`.
- Đọc role từ active Membership, không phải `User.role`.

## 7. Lộ trình đề xuất

### Giai đoạn 0 — Khóa business contract

Trước khi đổi database:

- Chốt `Membership` là nguồn duy nhất của organization role.
- Chốt `Organization.members` và các field legacy trong `User` sẽ bị loại bỏ.
- Xác định response API ổn định để frontend không phụ thuộc ORM.
- Viết test cho tenant isolation, RBAC và task state transition.

Không cần refactor đẹp toàn bộ Mongoose trước khi bỏ MongoDB, nhưng phải chốt và test hành vi nghiệp vụ.

### Giai đoạn 1 — Dựng PostgreSQL song song

- Thêm PostgreSQL vào Docker Compose.
- Thêm Prisma schema và migration đầu tiên.
- Dựng `PrismaModule`.
- Tạo repository contract theo từng module.
- Chưa xóa MongoDB.

### Giai đoạn 2 — Chuyển từng vertical slice

Thứ tự phù hợp:

1. User.
2. Organization + Membership.
3. Auth/JWT/tenant authorization.
4. Team + team members/invitations.
5. Task + assignees/todos/attachments.
6. Dashboard/aggregation.
7. Automation worker.
8. Seeder và operational scripts.

Sau mỗi slice phải có integration test với PostgreSQL thật hoặc Testcontainers.

### Giai đoạn 3 — Migration dữ liệu

Thứ tự import:

1. Users.
2. Organizations.
3. Memberships.
4. Teams.
5. Team members và invitations.
6. Tasks.
7. Assignees, todos và attachments.

Script migration phải:

- Idempotent.
- Ghi mapping Mongo ObjectId → PostgreSQL UUID.
- Chạy được dry-run.
- Kiểm tra số lượng bản ghi.
- Kiểm tra orphan foreign key.
- So sánh aggregate theo organization.
- Xuất report các bản ghi lỗi.

### Giai đoạn 4 — Cutover

- Freeze write hoặc tạo maintenance window ngắn.
- Chạy incremental/final migration.
- Chạy validation report.
- Chuyển `DATABASE_URL`.
- Smoke test Auth, tenant isolation, Team, Task và worker.
- Giữ MongoDB read-only trong thời gian rollback.
- Chỉ xóa Mongoose sau khi hết rollback window.

Không nên triển khai dual-write MongoDB/PostgreSQL trừ khi hệ thống đang có production traffic thực sự cần gần zero-downtime. Dual-write làm tăng mạnh độ phức tạp và nguy cơ lệch dữ liệu.

## 8. Ước lượng

Với một backend developer:

- Nếu chưa có dữ liệu production quan trọng: khoảng **12–18 ngày làm việc**.
- Nếu cần migrate dữ liệu thật, rollback và downtime thấp: khoảng **20–30 ngày**.
- Nếu vừa chuyển database, vừa hoàn thiện frontend multi-org và bổ sung đầy đủ CI/test: khoảng **4–6 tuần**.

## 9. Kết luận

Khuyến nghị cuối cùng là chuyển sang **PostgreSQL + Prisma**, nhưng coi đây là một migration kiến trúc chứ không phải thay package Mongoose.

Thứ tự ưu tiên nên là:

1. Khóa mô hình Membership và tenant authorization.
2. Bổ sung test security tối thiểu.
3. Dựng PostgreSQL/repository song song.
4. Chuyển theo từng module.
5. Migration có kiểm chứng và rollback.
6. Sau cutover mới gỡ MongoDB/Mongoose.

Nếu dự án chưa có dữ liệu production quan trọng, đây là thời điểm phù hợp để chuyển: chi phí hiện tại vẫn kiểm soát được và sẽ tránh việc tiếp tục xây thêm tính năng trên mô hình MongoDB đang ngày càng mang tính quan hệ.
