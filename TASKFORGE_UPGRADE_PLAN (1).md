# TaskForge — Implementation Plan (Upgrade Roadmap)

> Mục tiêu: vá lỗ hổng nghiệp vụ, chuyển sang kiến trúc 1 user - n organization (switch workspace qua header), đồng bộ FE↔BE, hoàn thiện FE, thêm test, benchmark thật, CI, và deploy ổn định (không cold start).
> Repo: https://github.com/MinhPham204/TaskForge
> Cách dùng file này: mỗi Phase là 1 đơn vị công việc độc lập, có thể copy nguyên block "Prompt gợi ý cho AI" vào Claude Code / Cursor / công cụ vibe-coding để triển khai. Làm đúng thứ tự — Phase sau phụ thuộc Phase trước, đặc biệt Phase 2 (multi-org) ảnh hưởng dây chuyền tới hầu hết các phase sau.

---

## Tổng quan thứ tự & phụ thuộc

```
Phase 1 (Vá bypass approval — BE)
   │
   ▼
Phase 2 (Chuyển sang kiến trúc 1 user - n org, switch qua header) ★ MỚI, ảnh hưởng lớn
   │
   ▼
Phase 3 (Audit & Sync route FE↔BE — có tính đến header activeOrgId)
   │
   ▼
Phase 4 (Hoàn thiện FE — bao gồm Workspace Switcher UI)
   │
   ├──▼ Phase 5 (Unit test — bao gồm test Membership & switch-org security)
   │
Phase 6 (Benchmark) ──── có thể làm song song sau Phase 3
   │
   ▼
Phase 7 (CI + Docs)
   │
   ▼
Phase 8 (Deploy)
```

| Phase | Model AI gợi ý | Thời gian ước tính |
|---|---|---|
| 1 | Opus 4.8 (reasoning mạnh, rủi ro bảo mật) | 0.5 - 1 ngày |
| 2 | Opus 4.8 (thay đổi kiến trúc lõi, rủi ro cao nhất toàn plan) | 2 - 4 ngày |
| 3 | Sonnet 5 | 1 - 2 ngày |
| 4 | Sonnet 5 | 2 - 4 ngày |
| 5 | Opus 4.8 cho edge case bảo mật, Sonnet cho boilerplate | 1.5 - 2.5 ngày |
| 6 | Sonnet 5 | 0.5 ngày |
| 7 | Sonnet 5 | 0.5 - 1 ngày |
| 8 | Sonnet 5, thao tác thủ công nhiều | 1 ngày |

> **Lưu ý quan trọng:** Phase 2 là thay đổi kiến trúc lớn nhất trong toàn bộ plan — nên dùng model reasoning mạnh nhất bạn có, review kỹ từng bước, và **bắt buộc** có Phase 5 (test) kiểm chứng lại trước khi sang Phase 8 (deploy). Đừng vội deploy ngay sau Phase 2 dù có vẻ "chạy được" — lỗi tenant isolation ở kiến trúc mới rất khó phát hiện bằng mắt thường.

---

## PHASE 1 — Vá lỗ hổng nghiệp vụ Backend

### 1.1. Vấn đề cần sửa

**Bug 1: Bypass approval workflow**
File: `backend/src/modules/task/task.service.ts`, hàm `updateStatus`.
Hiện tại cho phép set `status = COMPLETED` trực tiếp qua `PATCH /tasks/:id/status`, bỏ qua toàn bộ flow `submitForApproval → approveTask`.

**Fix:** Nếu task thuộc 1 team có `requireApproval` (xem 1.2), chặn việc set `COMPLETED` qua endpoint này. Chỉ `approveTask` được phép set `COMPLETED`.

**Bug 2: Self-approval (conflict of interest)**
File: cùng file, hàm `approveTask` và `rejectTask`.
Hiện tại không kiểm tra người duyệt (`currentUser`) có phải chính là `createdBy` hoặc `assignedTo` của task hay không.

**Fix:** Thêm điều kiện chặn: nếu `currentUser._id === task.createdBy` HOẶC `currentUser._id === task.assignedTo`, ném `ForbiddenException` khi họ cố gọi `approveTask`/`rejectTask` cho chính task đó.

**Bug 3: Race condition khi approve/reject**
Hiện tại: đọc task bằng `findById` → sửa field trong JS → gọi `.save()`. Có thể có race condition nếu 2 Team Lead cùng approve/reject gần như đồng thời.

**Fix:** Đổi sang `findOneAndUpdate` atomic với filter bao gồm điều kiện trạng thái hiện tại:
```typescript
const updated = await this.taskModel.findOneAndUpdate(
  { _id: taskId, status: TaskStatus.PENDING_APPROVAL },
  { status: TaskStatus.COMPLETED, approvedBy: currentUser._id, approvedAt: new Date() },
  { new: true }
);
if (!updated) {
  throw new ConflictException('Task không còn ở trạng thái chờ duyệt (có thể đã được xử lý bởi người khác)');
}
```

### 1.2. Bonus improvement (khuyến nghị làm cùng lúc — effort thấp, giá trị thiết kế cao)

Thêm field `requireApproval: boolean` (default `true`) vào `Team` schema (`backend/src/modules/team/schemas/team.schema.ts`). Cho phép Org Admin bật/tắt việc bắt buộc approval theo từng team. Nếu `requireApproval = false`, cho phép `updateStatus` set `COMPLETED` trực tiếp mà không cần qua approval flow.

### 1.3. Validate assignee đúng team (bonus nhỏ)

File: `task.service.ts`, hàm `create` — hiện chỉ check `isActive` + cùng organization. Thêm check: `assignedTo` phải nằm trong `team.members` của team chứa task.

> ⚠️ **Lưu ý:** KHÔNG xóa field `User.team` hay sửa `User.organization` ở Phase này — việc đó sẽ được xử lý triệt để ở Phase 2 (đổi hẳn sang mô hình Membership). Làm ở đây sẽ phải sửa lại 2 lần, lãng phí công sức.

### Prompt gợi ý cho AI (Phase 1)

```
Đọc file backend/src/modules/task/task.service.ts và backend/src/modules/team/schemas/team.schema.ts.

Thực hiện các thay đổi sau, giữ nguyên style code hiện có (comment tiếng Việt giải thích rationale nếu có):

1. Trong hàm `updateStatus`: chặn set status = COMPLETED trực tiếp nếu team.requireApproval = true.
   Task phải qua submitForApproval -> approveTask mới được COMPLETED trong trường hợp đó.

2. Thêm field `requireApproval: { type: Boolean, default: true }` vào Team schema.

3. Trong `approveTask` và `rejectTask`: thêm check chặn self-approval —
   nếu currentUser._id trùng task.createdBy hoặc task.assignedTo, throw ForbiddenException
   với message rõ ràng bằng tiếng Việt.

4. Đổi approveTask/rejectTask từ pattern (findById -> mutate -> save)
   sang atomic findOneAndUpdate với filter { _id: taskId, status: 'PENDING_APPROVAL' }.
   Nếu update trả về null, throw ConflictException.

5. Trong hàm `create` của task.service.ts: thêm validate assignedTo phải nằm trong
   team.members của team chứa task, không chỉ check isActive + cùng organization.

KHÔNG động vào User schema hay field organization ở bước này — việc đó sẽ làm ở phase riêng.

Sau khi sửa xong, liệt kê lại toàn bộ thay đổi đã thực hiện dưới dạng diff summary.
```

### Kết quả kỳ vọng
- [ ] `updateStatus` không bypass được approval khi `requireApproval = true`
- [ ] Không thể self-approve/self-reject
- [ ] Approve/reject atomic, không race condition
- [ ] Assignee luôn thuộc đúng team

---

## PHASE 2 — Chuyển sang kiến trúc 1 User – N Organization (★ Phase mới, quan trọng nhất)

### 2.1. Bối cảnh & quyết định thiết kế đã chốt

- **Trước:** `User.organization` là field đơn — 1 user chỉ thuộc 1 org tại 1 thời điểm.
- **Sau:** 1 user có thể là thành viên của nhiều organization, mỗi lần làm việc chỉ hoạt động trong **1 workspace đang active**, xác định qua **header `X-Organization-Id`** gửi kèm mỗi request (Cách B đã chọn — không nhúng orgId vào JWT, không cần re-issue token khi switch).
- **Lý do chọn Cách B** (nhắc lại để làm căn cứ khi code): hỗ trợ tốt việc mở nhiều tab với nhiều org khác nhau cùng lúc, không cần quản lý vòng đời nhiều access token song song, tận dụng lại được gần nguyên vẹn cấu trúc `TenantInterceptor` đã có — chỉ đổi *nguồn* lấy `orgId`.

### 2.2. Thay đổi Data Model

**Xóa** field `organization: ObjectId` và `team: ObjectId` khỏi `User` schema.

**Thêm collection mới** `Membership`:
```typescript
// backend/src/modules/membership/schemas/membership.schema.ts
@Schema({ timestamps: true })
export class Membership {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organization: Types.ObjectId;

  @Prop({ type: String, enum: ['OWNER', 'ADMIN', 'MEMBER'], required: true })
  role: string; // role trong PHẠM VI org này — không còn là role global trên User

  @Prop({ type: Boolean, default: true })
  isActive: boolean; // dùng khi cần "gỡ" user khỏi org mà không xóa lịch sử

  @Prop({ type: Date, default: Date.now })
  joinedAt: Date;
}

// Compound unique index — 1 user chỉ có đúng 1 membership record với 1 org
MembershipSchema.index({ user: 1, organization: 1 }, { unique: true });
```

`Team.members` giữ nguyên (không đổi) — quan hệ Team vẫn nằm trong phạm vi 1 organization, không cần thay đổi.

### 2.3. Migration script (bắt buộc — không được bỏ qua)

Vì hệ thống hiện tại đã có data thật (dù là data demo/dev), cần script chuyển đổi:
```
Với mỗi User hiện có field `organization`:
  → Tạo 1 Membership record: { user: user._id, organization: user.organization, role: user.role, isActive: true }
Sau khi migrate xong toàn bộ, mới được xóa field organization/team khỏi User schema.
```

### 2.4. Thay đổi Backend — API mới

**`GET /auth/my-organizations`** (mới)
Trả về danh sách tất cả organization mà user hiện tại (`req.user` từ JWT, chỉ chứa `sub`/`email`/`role` — không đổi JWT payload) là thành viên, kèm role của họ ở mỗi org. Dùng để FE hiển thị màn hình chọn workspace sau khi login.
```typescript
async getMyOrganizations(userId: string) {
  return this.membershipModel
    .find({ user: userId, isActive: true })
    .populate('organization', 'name slug plan isActive')
    .select('organization role joinedAt');
}
```

### 2.5. Thay đổi `TenantInterceptor` — trung tâm của toàn bộ Phase này

File: `backend/src/common/interceptors/tenant.interceptor.ts`

**Logic mới:**
```
1. Lấy header X-Organization-Id từ request.
2. Nếu không có header -> throw BadRequestException (mọi request cần tenant context đều
   phải có header này, trừ các route public/không cần org như /auth/login, /auth/my-organizations).
3. Query Membership: tìm { user: req.user._id, organization: headerOrgId, isActive: true }.
4. Nếu KHÔNG tìm thấy Membership hợp lệ -> throw ForbiddenException
   ("Bạn không phải thành viên của tổ chức này hoặc đã bị gỡ quyền").
   ĐÂY LÀ BƯỚC BẢO MẬT QUAN TRỌNG NHẤT CỦA TOÀN BỘ PHASE 2 — không được bỏ qua,
   nếu không sẽ cho phép user giả mạo header để truy cập org bất kỳ.
5. Nếu hợp lệ -> set ALS context gồm CẢ organizationId VÀ role của user trong org đó
   (không chỉ orgId như trước — vì role giờ đây phụ thuộc vào org đang active, không còn global).
6. Gắn luôn activeMembership vào request (req.activeMembership) để các Guard phía sau dùng,
   tránh phải query lại Membership nhiều lần trong cùng 1 request.
```

Cập nhật `TenantStore` interface trong `tenant-storage.ts`:
```typescript
export interface TenantStore {
  organizationId: string;
  membershipRole: string; // role của user TRONG org đang active — thay cho user.role cũ
}
```

### 2.6. Thay đổi các Guard phụ thuộc vào role global cũ

**`roles.guard.ts`, `org-admin.guard.ts`** — hiện đang đọc `user.role` (global, gắn liền trên User document). Phải đổi sang đọc `req.activeMembership.role` (role theo đúng org đang active, set bởi `TenantInterceptor` ở bước 2.5).

**`team-lead.guard.ts`** — không đổi nhiều vì role Team Lead/Member vẫn nằm ở `Team.members`, không phụ thuộc trực tiếp vào `User.organization` cũ — nhưng cần double-check logic tìm Team có đang implicit dựa vào `user.organization` cũ hay không (grep lại toàn bộ).

### 2.7. Thay đổi nghiệp vụ mời/tham gia tổ chức

File: `organization.service.ts`, hàm `acceptInvitation`.
**Xóa** đoạn code "STRICT B2B CHECK" (chặn user đã có org không cho join org thứ 2) — đây chính là rule cần bỏ để hiện thực hóa multi-org. Thay bằng: tạo mới 1 `Membership` record khi accept invitation, không còn ghi đè field `organization` trên `User` (vì field đó không còn tồn tại).

### 2.8. Frontend — Workspace Switcher

**Component mới:** `WorkspaceSwitcher` — dropdown ở header, hiển thị danh sách org từ `GET /auth/my-organizations`, org đang active được highlight.

**State quản lý `activeOrgId`:**
- Lưu trong Redux store (không dùng localStorage riêng lẻ — cần đồng bộ với RTK Query base query để tự động gắn header).
- Sau khi login, nếu user thuộc nhiều org → hiển thị màn hình "Chọn Workspace" trước khi vào Dashboard. Nếu chỉ thuộc 1 org → tự động chọn luôn, không cần hỏi.

**Sửa `axiosInstance.js` / RTK Query `baseQuery`:**
```javascript
// Gắn header X-Organization-Id vào MỌI request, lấy từ Redux store
prepareHeaders: (headers, { getState }) => {
  const activeOrgId = getState().workspace.activeOrgId;
  if (activeOrgId) headers.set('X-Organization-Id', activeOrgId);
  return headers;
}
```

**Khi user switch workspace:** bắt buộc gọi `dispatch(apiSlice.util.resetApiState())` (RTK Query) để xóa sạch toàn bộ cache cũ — đây là bước **bắt buộc, không được bỏ qua**, nếu không sẽ hiện data của org cũ lẫn vào org mới do cache chưa invalidate.

### Prompt gợi ý cho AI (Phase 2)

```
Đây là thay đổi kiến trúc lớn — thực hiện TỪNG BƯỚC, tôi sẽ review sau mỗi bước trước khi sang bước tiếp theo.

BƯỚC 1 — Data model:
1. Tạo backend/src/modules/membership/schemas/membership.schema.ts theo đúng cấu trúc:
   user (ref User), organization (ref Organization), role (enum OWNER/ADMIN/MEMBER),
   isActive (boolean), joinedAt. Thêm compound unique index (user, organization).
2. Tạo MembershipModule, MembershipService (CRUD cơ bản + hàm findByUserAndOrg).
3. Viết migration script backend/scripts/migrate-to-membership.ts: đọc toàn bộ User hiện có,
   với mỗi user có field `organization`, tạo 1 Membership record tương ứng.
   KHÔNG xóa field User.organization/team ở bước này — chỉ tạo Membership song song để review trước.

BƯỚC 2 (chỉ làm sau khi tôi xác nhận migration script chạy đúng ở Bước 1):
1. Xóa field `organization` và `team` khỏi User schema.
2. Sửa backend/src/common/interceptors/tenant.interceptor.ts theo logic:
   - Lấy header X-Organization-Id
   - Query Membership { user: req.user._id, organization: headerOrgId, isActive: true }
   - Nếu không tìm thấy -> ForbiddenException
   - Nếu tìm thấy -> set ALS context { organizationId, membershipRole }, gắn req.activeMembership
3. Sửa backend/src/common/als/tenant-storage.ts: thêm field membershipRole vào TenantStore interface.
4. Sửa backend/src/common/guards/roles.guard.ts và org-admin.guard.ts:
   đổi từ đọc user.role sang đọc req.activeMembership.role (hoặc tenantStorage tương ứng).
5. Grep toàn bộ codebase tìm mọi chỗ còn đọc user.organization hoặc user.role
   theo nghĩa "role toàn cục" — liệt kê ra để tôi review, KHÔNG tự ý sửa hết nếu không chắc chắn
   ý nghĩa của từng chỗ.
6. Thêm endpoint GET /auth/my-organizations trả về danh sách Membership của user hiện tại,
   kèm populate thông tin organization.
7. Sửa organization.service.ts, hàm acceptInvitation: xóa đoạn check "STRICT B2B"
   (chặn user đã có org), thay bằng tạo Membership record mới khi accept.

Sau mỗi bước, chạy thử toàn bộ test hiện có (nếu có) và báo cáo lỗi compile/runtime nếu có,
KHÔNG tự ý fix lỗi phát sinh mà không giải thích rõ nguyên nhân trước.
```

```
(Prompt riêng cho Frontend — chạy sau khi Backend Bước 2 đã ổn định)

1. Tạo component WorkspaceSwitcher (dropdown ở header) hiển thị danh sách organization
   từ GET /auth/my-organizations, cho phép chọn workspace đang active.
2. Thêm slice Redux mới `workspaceSlice` lưu activeOrgId + danh sách organizations.
3. Sau login: nếu user thuộc nhiều org, chuyển hướng tới màn hình chọn workspace trước khi
   vào Dashboard. Nếu chỉ thuộc 1 org, tự động set activeOrgId và vào thẳng Dashboard.
4. Sửa file cấu hình RTK Query base query (thường là apiSlice.js hoặc tương tự):
   thêm prepareHeaders gắn header X-Organization-Id lấy từ workspaceSlice.activeOrgId
   vào MỌI request.
5. Khi user chọn switch sang workspace khác: dispatch action đổi activeOrgId,
   ĐỒNG THỜI gọi apiSlice.util.resetApiState() để xóa sạch cache RTK Query cũ,
   tránh hiện nhầm data giữa 2 org.
6. Hiển thị rõ tên organization đang active ở vị trí dễ thấy trên header/sidebar,
   tránh người dùng nhầm lẫn đang thao tác ở workspace nào.
```

### 2.9. Kiểm tra bảo mật bắt buộc trước khi coi Phase này hoàn thành

- [ ] Thử gửi request với header `X-Organization-Id` là 1 org mà user KHÔNG phải thành viên → phải trả về 403, không được trả data
- [ ] Thử gửi request KHÔNG có header này → phải trả về 400, không được fallback về org nào mặc định
- [ ] User bị `isActive: false` trong Membership (đã bị gỡ khỏi org) → không truy cập được org đó nữa dù JWT còn hạn
- [ ] Switch qua lại giữa 2 org nhiều lần trên FE, kiểm tra không có data cache lẫn lộn

### Kết quả kỳ vọng
- [ ] `Membership` collection thay thế hoàn toàn field `organization`/`team` đơn trên `User`
- [ ] Header `X-Organization-Id` được validate nghiêm ngặt ở `TenantInterceptor`, không thể giả mạo
- [ ] Role được xác định theo đúng org đang active, không còn là role toàn cục
- [ ] FE có Workspace Switcher hoạt động, cache được reset đúng khi switch
- [ ] Có thể accept invitation vào org thứ 2 trở lên (rule STRICT B2B đã gỡ bỏ)

---

## PHASE 3 — Audit & Đồng bộ route FE↔BE

> Sau Phase 2, một số route đã thay đổi thêm yêu cầu header — Phase Audit này cần audit lại từ đầu, không chỉ dùng lại kết quả audit cũ trước khi có multi-org.

### 3.1. Danh sách lệch cần audit lại (kèm các mục cũ đã biết + mục mới phát sinh từ Phase 2)

| File FE | Vấn đề | Ghi chú |
|---|---|---|
| `userApi.js` (toàn bộ) | Gọi `/api/users*` — **không có UserController nào tồn tại** | Cần viết mới, nhớ áp dụng đúng TenantInterceptor mới (đọc header) |
| `taskApi.js` — dashboard | `dashboard/admin`, `dashboard/user` | BE thật: `dashboard/organization`, `dashboard/team-lead`, `dashboard/team-member` |
| `authApi.js` — profile | `GET /api/auth/profile` | BE thật: `GET /api/auth/me`, `PATCH /api/auth/profile` |
| `teamApi.js` — member/invitation | path tĩnh `my-team/...` | BE dùng `:id/members`, `:id/invitations` (ID động) |
| `apiPaths.js` — `IMAGE.UPLOAD_IMAGE`, `REPORTS.EXPORT_*` | Route không tồn tại ở BE | Xóa khỏi FE, ghi Future Improvements |
| `apiPaths.js` — `BASE_URL` | hardcode localhost | Đổi biến môi trường |
| **MỚI:** mọi request cần tenant context | Sau Phase 2, thiếu header `X-Organization-Id` sẽ luôn trả 400 | Kiểm tra `axiosInstance.js`/RTK Query base query đã gắn header đúng theo Phase 2.8 chưa |
| **MỚI:** `GET /organizations/:id`, mọi org-scoped route cũ | Trước đây orgId có thể lấy ngầm từ `user.organization`; giờ phải luôn dựa vào `activeOrgId` phía FE | Rà lại toàn bộ chỗ FE từng dùng `user.organization` cũ (nếu có) |

### Prompt gợi ý cho AI (Phase 3)

```
Bước 1 — Audit đầy đủ:
Liệt kê TOÀN BỘ route thật trong backend/src/modules/*/. *.controller.ts
So sánh với toàn bộ endpoint khai báo trong frontend/src/utils/apiPaths.js và frontend/src/services/*.js
Output bảng: [FE path] | [Khớp BE?] | [BE path thật] | [Có cần header X-Organization-Id không?] | [Đề xuất xử lý]

Bước 2 — Viết UserController mới (backend/src/modules/user/user.controller.ts):
GET /users, GET /users/search?q=, GET /users/:id — đảm bảo tất cả tự động bị scope theo
organization đang active (dựa vào TenantInterceptor mới từ Phase 2, KHÔNG cần tự thêm
filter organization thủ công trong query nếu tenant plugin đã xử lý tự động — kiểm tra
lại cơ chế Mongoose plugin hiện có trước khi viết).

Bước 3 — Sửa frontend/src/utils/apiPaths.js:
- Sửa các path sai đã liệt kê ở bảng trên
- Xóa IMAGE.UPLOAD_IMAGE và REPORTS.EXPORT_*
- Đổi BASE_URL sang biến môi trường VITE_API_URL

Bước 4 — Kiểm tra axiosInstance.js / RTK Query base query: xác nhận header
X-Organization-Id đã được gắn đúng vào MỌI request cần tenant context (theo Phase 2.8).
Nếu chưa có, bổ sung.

Bước 5 — Test tay: login -> chọn workspace -> gọi thử vài API cần tenant context,
xác nhận không bị lỗi 400 (thiếu header) hay 403 (sai membership).
```

### Kết quả kỳ vọng
- [ ] Có bảng audit đầy đủ, bao gồm cột "cần header không"
- [ ] `UserController` mới hoạt động, tự động scope theo org active
- [ ] Header `X-Organization-Id` được gắn đúng ở mọi request FE
- [ ] Không còn path FE nào trỏ tới route không tồn tại

---

## PHASE 4 — Hoàn thiện phần Frontend còn thiếu

### 4.1. Rà soát các tính năng BE đã có nhưng FE chưa khai thác đủ

- [ ] **Workspace Switcher** (đã làm ở Phase 2.8 — kiểm tra lại UX: có rõ ràng, có dễ nhầm lẫn không)
- [ ] Màn hình "Chọn Workspace" sau login khi user thuộc nhiều org
- [ ] Progress tracking (`PATCH /tasks/:id/progress`)
- [ ] Todo checklist con của task
- [ ] Workload report (`GET /tasks/reports/workload`)
- [ ] 3 dashboard riêng biệt theo đúng role (role giờ đây lấy theo Membership của org active, không phải role toàn cục)
- [ ] Invitation flow đầy đủ — bao gồm trường hợp mới: user chấp nhận lời mời vào org thứ 2 trở lên (trước đây bị chặn)
- [ ] Reject task kèm lý do
- [ ] `requireApproval` toggle theo từng team

### 4.2. Test tay toàn bộ luồng chính — bổ sung kịch bản multi-org

```
1. Register → verify OTP → set password → login
2. Nếu user chỉ có 1 org: vào thẳng Dashboard. Nếu nhiều org: chọn Workspace.
3. Tạo Team, mời thành viên A vào Organization X
4. Đăng nhập tài khoản khác (Organization Y), mời CHÍNH thành viên A đó vào Organization Y
5. Thành viên A: đăng nhập, xác nhận thấy MÀN HÌNH CHỌN WORKSPACE (vì giờ thuộc 2 org)
6. Thành viên A: chọn Organization X, tạo/xem task bình thường
7. Thành viên A: switch sang Organization Y qua Workspace Switcher
   → xác nhận KHÔNG còn thấy task/team của Organization X (cache đã reset đúng)
8. Thử sửa header X-Organization-Id bằng tay (qua DevTools/Postman) thành 1 org
   mà tài khoản đang test KHÔNG phải thành viên → xác nhận bị 403
9. Toàn bộ flow approval (submit → reject → sửa → submit lại → approve) test lại
   trong ngữ cảnh 1 org cụ thể, xác nhận không đổi hành vi so với trước Phase 2
```

### Prompt gợi ý cho AI (Phase 4)

```
Đọc toàn bộ cấu trúc frontend/src/pages và frontend/src/components hiện có,
đối chiếu với danh sách endpoint đã audit ở Phase 3.

Hoàn thiện UI cho các phần còn thiếu theo thứ tự ưu tiên:
1. Màn hình chọn Workspace sau login (chỉ hiện khi user thuộc >1 organization)
2. Workspace Switcher rõ ràng trên header, luôn hiển thị tên org đang active
3. Progress tracking UI, Todo checklist UI
4. 3 Dashboard riêng biệt theo role — LƯU Ý: role giờ lấy từ Membership của org đang active,
   không phải field cố định trên user, kiểm tra kỹ component đang lấy role từ đâu
5. Reject reason display, requireApproval toggle cho Org Admin
6. Workload report UI, Invitation flow đầy đủ (bao gồm accept invitation vào org thứ 2)

Dùng đúng RTK Query pattern đã có, đúng Tailwind style hiện tại, không đổi phong cách thiết kế.
Sau mỗi phần tôi sẽ tự test tay theo kịch bản multi-org trước khi làm phần tiếp theo.
```

### Kết quả kỳ vọng
- [ ] Mọi tính năng BE có UI tương ứng
- [ ] Test tay 9 bước ở 4.2 chạy trọn vẹn, đặc biệt bước 7 và 8 (switch không lẫn data, header giả mạo bị chặn)

---

## PHASE 5 — Unit Test cho phần nhạy cảm

### 5.1. Phạm vi test — bổ sung nhóm test mới cho multi-org

**Nhóm 1 — Authorization logic** (giữ nguyên từ plan cũ, cập nhật để dùng Membership)
- `ensureTaskMutationAccess`: test đủ case theo role lấy từ Membership của org active
- Self-approval bị chặn
- Approve/reject atomic, không race condition

**Nhóm 2 — Multi-tenant isolation** (mở rộng đáng kể so với plan cũ)
- Tạo 1 user thuộc 2 Membership (org A và org B)
- Set ALS context = org A → query task → chỉ thấy task org A
- Switch context sang org B (giả lập request khác với header khác) → chỉ thấy task org B
- **Test bảo mật quan trọng nhất của Phase 2:** gửi request với header org mà user KHÔNG có Membership hợp lệ → phải bị chặn ở tầng `TenantInterceptor` (403), không lọt xuống tới Service
- Test user có Membership `isActive: false` ở 1 org → không truy cập được org đó

**Nhóm 3 — Approval state machine** (giữ nguyên từ plan cũ)
- Transition không hợp lệ đều bị chặn

**Nhóm 4 — Role theo Membership (mới)**
- Cùng 1 user, là `ADMIN` ở org A nhưng chỉ là `MEMBER` ở org B → xác nhận quyền hành động khác nhau tương ứng ở mỗi org, không bị lẫn role giữa 2 org

### Prompt gợi ý cho AI (Phase 5)

```
Setup Jest test environment cho NestJS project này nếu chưa có (kiểm tra jest.config.js,
package.json devDependencies đã đủ @nestjs/testing, mongodb-memory-server chưa).

Viết unit test, dùng mongodb-memory-server để test thật với MongoDB in-memory:

1. backend/src/modules/task/task.service.spec.ts
   - Test ensureTaskMutationAccess với role lấy từ Membership (không phải user.role cũ)
   - Test self-approval bị chặn, approve/reject atomic

2. backend/src/common/interceptors/tenant.interceptor.spec.ts
   - Tạo 2 organization, 1 user có Membership hợp lệ ở CẢ HAI org
   - Test: header đúng org A -> chỉ thấy data org A
   - Test: header đúng org B -> chỉ thấy data org B
   - Test QUAN TRỌNG NHẤT: header là 1 org mà user KHÔNG có Membership -> interceptor
     phải throw ForbiddenException, request không được chạm tới Service layer
   - Test: Membership có isActive=false -> bị chặn dù record Membership tồn tại

3. backend/src/modules/task/task-state-machine.spec.ts (giữ nguyên yêu cầu cũ)

4. backend/src/modules/membership/membership.spec.ts (mới)
   - Test cùng 1 user có role khác nhau ở 2 org khác nhau, xác nhận quyền hành động
     tương ứng đúng với org đang active trong từng test case, không bị lẫn.

Sau khi viết xong, chạy npm run test, báo cáo coverage đặc biệt cho
tenant.interceptor.ts và membership module (đây là 2 điểm rủi ro bảo mật cao nhất
sau khi đổi kiến trúc).
```

### Kết quả kỳ vọng
- [ ] Test pass 100%
- [ ] Có test xác nhận rõ ràng: giả mạo header org không có Membership → bị chặn
- [ ] Có test xác nhận role không bị lẫn giữa 2 org của cùng 1 user

---

## PHASE 6 — Benchmark thật cho Compound Index

*(Không đổi so với plan gốc — cập nhật lại nếu index cần thêm field liên quan Membership)*

### Prompt gợi ý cho AI (Phase 6)

```
Viết 1 script Node.js độc lập tại backend/scripts/benchmark-index.ts:
1. Kết nối MongoDB riêng cho benchmark, KHÔNG chạy trên data thật
2. Seed 100,000 document Task giả lập
3. Kiểm tra lại: sau khi đổi sang kiến trúc Membership, các compound index hiện có
   trên Task (theo team/organization/dueDate) còn hợp lý không, hay cần thêm index
   trên Membership collection (user + organization) để query GET /auth/my-organizations
   và validate trong TenantInterceptor chạy nhanh
4. Đo executionTimeMillis qua explain(), có/không index, lặp lại 5 lần lấy trung bình
5. Ghi kết quả vào backend/BENCHMARK_RESULTS.md
```

### Kết quả kỳ vọng
- [ ] Có script + số liệu benchmark thật, bao gồm cả đánh giá index cho Membership collection (vì đây giờ là bảng được query ở MỌI request qua TenantInterceptor — hiệu năng của nó ảnh hưởng toàn hệ thống)

---

## PHASE 7 — CI Pipeline + Documentation

### Prompt gợi ý cho AI (Phase 7a — CI)

```
Tạo file .github/workflows/ci.yml:
- Job backend: checkout, setup Node 20, npm ci, npm run lint, npm run test
- Job frontend: checkout, setup Node 20, npm ci, npm run build
- Cache node_modules
- Thêm badge CI vào README.md
```

### Prompt gợi ý cho AI (Phase 7b — Docs, cập nhật thêm mục Multi-Org)

```
Viết/cập nhật file ARCHITECTURE.md, gồm các mục:

1. Multi-Organization Architecture (MỚI — mục quan trọng nhất cần viết kỹ)
   - Giải thích lý do chuyển từ 1-user-1-org sang 1-user-n-org
   - So sánh 2 cách tiếp cận đã cân nhắc: nhúng orgId vào JWT (re-issue token) vs
     header-based switching (đã chọn) — nêu rõ trade-off của từng cách
   - Giải thích cơ chế Membership collection, TenantInterceptor validate header,
     và vì sao bước validate Membership là điểm bảo mật quan trọng nhất
   - Giải thích cách Frontend reset RTK Query cache khi switch workspace

2. Multi-tenancy Strategy (cập nhật lại theo kiến trúc mới)
   - AsyncLocalStorage + Mongoose plugin, giờ lưu thêm membershipRole
   - Lưu ý ALS không tự xuyên qua BullMQ worker boundary

3. Authorization Model (cập nhật)
   - Role giờ đây theo từng Membership (org-scoped), không còn global trên User
   - Approval state machine

4. Design Trade-offs
   - Ghi lại quyết định ban đầu (1-user-1-org) và lý do sau đó đổi sang multi-org
   - Đây là câu chuyện tốt để kể trong phỏng vấn: cho thấy quá trình đánh giá lại
     kiến trúc khi hiểu rõ hơn về use case thực tế

5. Async Job Processing, Performance Optimization, Future Improvements
   (giữ nguyên nội dung cũ, cập nhật nếu có thay đổi liên quan Membership)
```

### Kết quả kỳ vọng
- [ ] CI chạy xanh
- [ ] `ARCHITECTURE.md` có mục Multi-Organization Architecture đầy đủ, phản ánh đúng quyết định thiết kế thật

---

## PHASE 8 — Deploy (tránh cold start)

*(Không đổi nhiều so với plan gốc, chỉ thêm lưu ý về data demo)*

### Việc cần làm trước khi deploy

- [ ] `.env.example` đầy đủ
- [ ] Dockerfile production cho backend
- [ ] Seed script tạo demo data — **cập nhật để phản ánh đúng multi-org:** tạo ít nhất 2 Organization, và 1-2 user demo có Membership ở CẢ HAI org, để khi giới thiệu cho nhà tuyển dụng có thể demo trực tiếp tính năng Workspace Switcher (đây giờ là điểm nhấn kỹ thuật lớn nhất nên show)

### Prompt gợi ý cho AI (Phase 8)

```
1. Dockerfile multi-stage cho backend
2. Kiểm tra/điều chỉnh docker-compose.yml cho production
3. Viết backend/scripts/seed-demo-data.ts:
   - Tạo 2 Organization: "Demo Agency A" và "Demo Agency B"
   - Tạo 1 user demo (email/password in ra rõ ràng) có Membership Ở CẢ HAI organization,
     role khác nhau ở mỗi org (ví dụ: Admin ở A, Member ở B) — để demo được rõ tính năng
     multi-org và phân quyền theo từng workspace
   - Mỗi org có vài Team, vài Task ở đủ trạng thái
4. Kiểm tra .env.example đủ biến môi trường
5. Đảm bảo CORS cho phép đúng domain frontend production
Sau đó hướng dẫn từng bước deploy lên [Oracle Cloud / Railway].
```

### Kết quả kỳ vọng
- [ ] Backend/Redis/MongoDB chạy ổn định, không sleep
- [ ] Có tài khoản demo thuộc 2 org khác nhau — cho phép nhà tuyển dụng tự trải nghiệm tính năng switch workspace, đây là điểm khác biệt lớn nhất so với version cũ
- [ ] Link demo hoạt động ổn định

---

## Checklist tổng kết trước khi coi là "hoàn thành"

- [ ] Phase 1: Không thể bypass approval, không thể self-approve
- [ ] Phase 2: Membership collection thay thế field organization đơn; header `X-Organization-Id` được validate nghiêm ngặt; không thể giả mạo để truy cập org khác
- [ ] Phase 3: Không còn API path nào 404, header được gắn đúng ở mọi request
- [ ] Phase 4: Workspace Switcher hoạt động mượt, không lẫn cache giữa 2 org, mọi tính năng BE có UI
- [ ] Phase 5: Unit test pass, có test riêng xác nhận bảo mật header/Membership
- [ ] Phase 6: Có số liệu benchmark thật
- [ ] Phase 7: CI xanh, ARCHITECTURE.md có mục Multi-Org đầy đủ
- [ ] Phase 8: Link demo sống, có tài khoản demo multi-org để trải nghiệm trực tiếp

Khi tất cả checkbox trên được tick, đây sẽ là phiên bản TaskForge có kiến trúc gần nhất với 1 SaaS multi-tenant thật (không chỉ multi-tenant giữa các organization, mà còn hỗ trợ đúng hành vi người dùng thật: 1 người có thể tham gia nhiều tổ chức) — đồng thời vẫn giữ được toàn bộ chiều sâu kỹ thuật đã có (approval workflow, tenant isolation, async jobs) từ phiên bản trước.
