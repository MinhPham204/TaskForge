# TaskForge — Implementation Plan (Upgrade Roadmap)

> Mục tiêu: vá lỗ hổng nghiệp vụ, đồng bộ FE↔BE, hoàn thiện FE, thêm test, benchmark thật, CI, và deploy ổn định (không cold start).
> Repo: https://github.com/MinhPham204/TaskForge
> Cách dùng file này: mỗi Phase là 1 đơn vị công việc độc lập, có thể copy nguyên block "Prompt gợi ý cho AI" vào Claude Code / Cursor / công cụ vibe-coding để triển khai. Làm đúng thứ tự — Phase sau phụ thuộc Phase trước.

---

## Tổng quan thứ tự & phụ thuộc

```
Phase 1 (Vá bypass BE)
   │
   ▼
Phase 2 (Audit & Sync route FE↔BE)
   │
   ▼
Phase 3 (Hoàn thiện FE)
   │
   ├──▼ Phase 4 (Unit test)
   │
Phase 5 (Benchmark) ──── có thể làm song song sau Phase 2
   │
   ▼
Phase 6 (CI + Docs)
   │
   ▼
Phase 7 (Deploy)
```


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

### 1.4. Dọn schema tàn dư

Xóa field `team: ObjectId` trong `User` schema (`backend/src/modules/user/schemas/user.schema.ts`) — field này không còn được service nào dùng (đã xác nhận qua grep), là tàn dư từ thiết kế cũ.

### Prompt gợi ý cho AI (Phase 1)

```
Đọc file backend/src/modules/task/task.service.ts, backend/src/modules/team/schemas/team.schema.ts,
backend/src/modules/user/schemas/user.schema.ts.

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

6. Xóa field `team: ObjectId` khỏi User schema (không còn được dùng ở đâu — đã verify bằng grep).
   Kiểm tra lại toàn bộ codebase không còn reference nào tới field này trước khi xóa.

Sau khi sửa xong, liệt kê lại toàn bộ thay đổi đã thực hiện dưới dạng diff summary.
```

### Kết quả kỳ vọng
- [ ] `updateStatus` không bypass được approval khi `requireApproval = true`
- [ ] Không thể self-approve/self-reject
- [ ] Approve/reject atomic, không race condition
- [ ] Assignee luôn thuộc đúng team
- [ ] Schema sạch, không còn field tàn dư

---

## PHASE 2 — Audit & Đồng bộ route FE↔BE

### 2.1. Danh sách lệch đã xác nhận (từ audit thủ công)

| File FE | Vấn đề | Route BE thật |
|---|---|---|
| `userApi.js` (toàn bộ) | Gọi `/api/users*` — **không có UserController nào tồn tại** | Không có |
| `taskApi.js` — dashboard | `dashboard/admin`, `dashboard/user` | `dashboard/organization`, `dashboard/team-lead`, `dashboard/team-member` |
| `authApi.js` — profile | `GET /api/auth/profile` | `GET /api/auth/me`, `PATCH /api/auth/profile` |
| `teamApi.js` — member/invitation | path tĩnh `my-team/...` | `:id/members`, `:id/invitations` (cần ID động) |
| `apiPaths.js` — `IMAGE.UPLOAD_IMAGE` | `/api/auth/upload-image` | Không tồn tại ở BE |
| `apiPaths.js` — `REPORTS.EXPORT_*` | `/api/report/export/...` | Không có module `report` |
| `apiPaths.js` — `BASE_URL` | hardcode `http://localhost:8001` | Cần đổi thành biến môi trường |

### 2.2. Quyết định xử lý từng mục

- **UserController thiếu** → Viết mới: `GET /users`, `GET /users/search?q=`, `GET /users/:id`. Áp dụng đúng `TenantInterceptor` + guard tương tự các module khác (copy pattern từ `team.controller.ts`).
- **Dashboard/profile/team path sai** → Sửa `apiPaths.js` khớp đúng route BE thật.
- **upload-image, report export** → **Xóa khỏi FE** (không code BE mới cho 2 cái này — đúng nguyên tắc không overkill). Ghi vào README mục "Future Improvements".
- **BASE_URL hardcode** → Đổi thành `import.meta.env.VITE_API_URL` (Vite), có giá trị mặc định fallback cho local dev.

### Prompt gợi ý cho AI (Phase 2)

```
Bước 1 — Audit đầy đủ:
Liệt kê TOÀN BỘ route thật trong các file:
- backend/src/modules/*/. *.controller.ts (dùng grep tìm @Get/@Post/@Patch/@Put/@Delete)
Sau đó liệt kê TOÀN BỘ endpoint được khai báo trong:
- frontend/src/utils/apiPaths.js
- frontend/src/services/*.js

So sánh 2 danh sách, output ra bảng: [FE path] | [Khớp BE?] | [BE path thật nếu có] | [Đề xuất xử lý]

Bước 2 — Viết UserController mới:
Tạo backend/src/modules/user/user.controller.ts với 3 endpoint:
- GET /users (list, phân trang, chỉ trong organization hiện tại — dựa vào TenantInterceptor)
- GET /users/search?q= (search theo tên/email trong organization)
- GET /users/:id (chi tiết 1 user, check cùng organization)
Copy đúng pattern guard/decorator đang dùng ở team.controller.ts (RolesGuard, GetUser decorator).
Đăng ký UserController vào UserModule, đảm bảo UserModule được import ở app.module.ts.

Bước 3 — Sửa frontend/src/utils/apiPaths.js:
- Sửa GET_DASHBOARD_DATA và GET_USER_DASHBOARD_DATA khớp đúng 3 route thật:
  dashboard/organization, dashboard/team-lead, dashboard/team-member
- Sửa GET_PROFILE thành GET /api/auth/me, UPDATE_PROFILE thành PATCH /api/auth/profile
- Sửa team member/invitation path dùng đúng :id động thay vì "my-team" tĩnh
- Xóa IMAGE.UPLOAD_IMAGE và REPORTS.EXPORT_* khỏi file
- Đổi BASE_URL sang: const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

Bước 4 — Cập nhật mọi component đang gọi các API path đã sửa (grep để tìm hết,
đừng để sót component nào còn gọi path cũ).

Bước 5 — Xóa console.log ở:
- frontend/src/components/layouts/SideMenu.jsx
- frontend/src/pages/Admin/ManageTasks.jsx

Sau khi xong, chạy thử toàn bộ luồng: đăng nhập -> xem dashboard theo role -> xem profile.
Báo cáo lỗi nếu có endpoint nào vẫn 404.
```

### Kết quả kỳ vọng
- [ ] Có bảng audit đầy đủ FE↔BE
- [ ] `UserController` mới hoạt động, có tenant-scope đúng
- [ ] Không còn path FE nào trỏ tới route không tồn tại
- [ ] `BASE_URL` dùng biến môi trường
- [ ] Không còn `console.log` debug

---

## PHASE 3 — Hoàn thiện phần Frontend còn thiếu

### 3.1. Rà soát các tính năng BE đã có nhưng FE chưa khai thác đủ

Dựa trên danh sách ~40 endpoint đã xác nhận, kiểm tra FE đã có UI đầy đủ cho:

- [ ] Progress tracking (`PATCH /tasks/:id/progress`) — thanh progress bar cập nhật real-time trên UI
- [ ] Todo checklist con của task (`POST/PATCH/DELETE /tasks/:id/todos`) — UI thêm/tick/xóa từng đầu việc
- [ ] Workload report (`GET /tasks/reports/workload`) — biểu đồ/bảng hiển thị cho Org Admin
- [ ] 3 dashboard riêng biệt theo đúng role (Organization / Team Lead / Team Member) — UI khác nhau rõ ràng, không dùng chung 1 màn hình generic
- [ ] Invitation flow đầy đủ: mời → pending → accept/cancel, cả ở cấp Organization và Team
- [ ] Reject task kèm lý do — UI hiển thị rõ lý do reject cho Member, không chỉ đổi trạng thái
- [ ] `requireApproval` toggle (nếu đã làm ở Phase 1.2) — UI cho Org Admin bật/tắt theo từng team

### 3.2. Test tay toàn bộ luồng chính (bắt buộc trước khi sang Phase 4)

Kịch bản test thủ công đầy đủ:
```
1. Register → nhận OTP → verify OTP → set password → login
2. Tạo Organization (nếu chưa có) → tạo Team
3. Mời 1 thành viên qua email → accept invitation
4. Tạo Task, gán cho thành viên, set priority
5. Member: cập nhật progress, tick checklist, submit for approval
6. Team Lead: xem task pending approval → reject kèm lý do
7. Member: sửa lại → submit lại
8. Team Lead: approve → task chuyển COMPLETED
9. Org Admin: xem dashboard organization, xem workload report
10. Kiểm tra: user org khác KHÔNG thấy được data của org này (test tenant isolation bằng tay)
```

### Prompt gợi ý cho AI (Phase 3)

```
Đọc toàn bộ cấu trúc frontend/src/pages và frontend/src/components hiện có.
Đối chiếu với danh sách endpoint backend sau: [paste danh sách 40 endpoint đã audit ở Phase 2]

Với mỗi endpoint BE đã có nhưng chưa thấy UI tương ứng đầy đủ trong FE, hãy:
1. Liệt kê rõ đang thiếu UI cho endpoint nào
2. Đề xuất component cần tạo/sửa, đặt đúng vị trí theo cấu trúc thư mục hiện có
   (pages/Admin, pages/User, components/...)
3. Dùng đúng RTK Query pattern đã có (providesTags/invalidatesTags) khi tạo mutation/query mới,
   xem file frontend/src/services/taskApi.js làm ví dụ mẫu
4. Dùng đúng design system/Tailwind classes đã dùng trong codebase, không tự ý đổi phong cách

Ưu tiên làm theo thứ tự: progress tracking UI -> todo checklist UI -> reject reason display ->
3 dashboard riêng biệt theo role -> workload report UI -> invitation flow đầy đủ.

Sau mỗi phần, tôi sẽ tự test tay trước khi làm phần tiếp theo.
```

### Kết quả kỳ vọng
- [ ] Mọi tính năng BE có UI tương ứng, không có "API tồn tại nhưng vô hình với người dùng"
- [ ] Test tay 10 bước ở 3.2 chạy trọn vẹn không lỗi
- [ ] Tenant isolation verify được bằng mắt (2 tài khoản 2 org không thấy data của nhau)

---

## PHASE 4 — Unit Test cho phần nhạy cảm

### 4.1. Phạm vi test (không cần coverage 100% toàn repo — tập trung đúng chỗ rủi ro cao)

**Nhóm 1 — Authorization logic** (`task.service.ts`)
- `ensureTaskMutationAccess`: test đủ case — creator được sửa, assignee được sửa, team lead được sửa, người ngoài team bị chặn, Org Admin/Owner KHÔNG bypass được (đúng thiết kế cố ý)
- Self-approval bị chặn (sau khi vá Phase 1): creator/assignee không tự approve được task của mình
- Approve/reject chỉ thành công khi task đang đúng `PENDING_APPROVAL`, thử approve 2 lần liên tiếp lần 2 phải fail

**Nhóm 2 — Multi-tenant isolation** (`tenant.plugin.ts`)
- Setup 2 organization giả (org A, org B), 2 user tương ứng
- Tạo task ở org A, chạy query với ALS context set là org B → phải KHÔNG trả về task đó
- Test cả 3 loại operation: find, update, delete đều bị scope đúng

**Nhóm 3 — Approval state machine**
- Task ở `PENDING` không thể `approve` trực tiếp (phải qua `IN_PROGRESS` → `submit` trước)
- Task `COMPLETED` không thể reject ngược lại

### Prompt gợi ý cho AI (Phase 4)

```
Setup Jest test environment cho NestJS project này nếu chưa có (kiểm tra jest.config.js,
package.json devDependencies đã đủ @nestjs/testing, mongodb-memory-server chưa).

Viết unit test cho 3 nhóm sau, dùng mongodb-memory-server để test thật với MongoDB in-memory
(không mock Mongoose hoàn toàn, vì cần test cả behavior của tenant.plugin.ts):

1. backend/src/modules/task/task.service.spec.ts
   - Test ensureTaskMutationAccess với đủ role: creator, assignee, team lead, người ngoài,
     org admin/owner (xác nhận KHÔNG bypass được — đây là thiết kế cố ý, không phải bug)
   - Test self-approval bị chặn (sau Phase 1 fix)
   - Test approve/reject chỉ thành công đúng 1 lần, lần 2 phải throw ConflictException

2. backend/src/common/plugins/tenant.plugin.spec.ts
   - Tạo 2 organization giả lập trong test DB
   - Set ALS context = org A, query task, xác nhận không thấy task của org B
   - Test cho cả find, updateOne, deleteOne

3. backend/src/modules/task/task-state-machine.spec.ts
   - Test các transition không hợp lệ đều bị chặn (PENDING -> approve trực tiếp phải fail,
     COMPLETED -> reject phải fail)

Sau khi viết xong, chạy `npm run test` và báo cáo coverage report,
đặc biệt coverage % của 2 file task.service.ts và tenant.plugin.ts.
```

### Kết quả kỳ vọng
- [ ] Test chạy pass 100% với `npm run test`
- [ ] Coverage report cho thấy % cụ thể trên `task.service.ts` và `tenant.plugin.ts`
- [ ] Có bằng chứng test thật cho tenant isolation (không chỉ "tin là nó work")

---

## PHASE 5 — Benchmark thật cho Compound Index

### 5.1. Mục tiêu

Thay số liệu "80ms → 2ms" (hiện chưa có script chứng minh) bằng số liệu đo thật, có script tái tạo được.

### Prompt gợi ý cho AI (Phase 5)

```
Viết 1 script Node.js độc lập tại backend/scripts/benchmark-index.ts:

1. Kết nối tới MongoDB (dùng connection string từ .env, hoặc local instance riêng cho benchmark
   — KHÔNG chạy trên database có data thật)
2. Seed 100,000 document Task giả lập, đa dạng organization/team/status/priority/dueDate
   (dùng thư viện faker để sinh dữ liệu ngẫu nhiên hợp lý)
3. Chạy 3 truy vấn thực tế của hệ thống (lấy nguyên query thật từ task.service.ts):
   - List task theo team + sort theo dueDate
   - Dashboard cá nhân (theo assignedTo + status)
   - Report overdue task (theo organization + dueDate range)
4. Đo thời gian thực thi từng query BẰNG explain('executionStats') — lấy executionTimeMillis
   thật, không dùng console.time thủ công (không chính xác bằng)
5. Chạy đo 2 lần: (a) trước khi có compound index, (b) sau khi có compound index
   — mỗi lần chạy lặp lại tối thiểu 5 lần, lấy trung bình để giảm nhiễu
6. In kết quả ra dạng bảng: [Query] | [Thời gian không index (ms)] | [Thời gian có index (ms)] | [% cải thiện]
7. Xóa toàn bộ data seed sau khi benchmark xong (cleanup script riêng)

Ghi kết quả thật vào file backend/BENCHMARK_RESULTS.md để có thể trích dẫn lại,
kèm ngày chạy, cấu hình máy/MongoDB version.
```

### Kết quả kỳ vọng
- [ ] Có script `benchmark-index.ts` chạy lại được bất cứ lúc nào
- [ ] Có file `BENCHMARK_RESULTS.md` ghi số liệu thật, không phải số ước lượng
- [ ] Số liệu trên CV chỉ dùng đúng số đã đo được (nếu khác 80ms→2ms, sửa lại CV cho khớp)

---

## PHASE 6 — CI Pipeline + Documentation

### 6.1. CI (GitHub Actions)

### Prompt gợi ý cho AI (Phase 6a)

```
Tạo file .github/workflows/ci.yml cho repo TaskForge:
- Trigger: push và pull_request vào branch main
- Job 1 (backend): checkout code, setup Node.js 20, cd backend, npm ci,
  chạy npm run lint, chạy npm run test
- Job 2 (frontend): checkout code, setup Node.js 20, cd frontend, npm ci,
  chạy npm run lint (nếu có), chạy npm run build (đảm bảo build không lỗi)
- Cache node_modules để tăng tốc CI (dùng actions/cache hoặc setup-node cache option)
- Thêm badge CI status vào đầu README.md
```

### 6.2. Documentation

### Prompt gợi ý cho AI (Phase 6b)

```
Viết file ARCHITECTURE.md ở root repo, gồm các mục sau (viết bằng tiếng Việt hoặc tiếng Anh,
văn phong kỹ thuật, súc tích, có code snippet minh họa khi cần):

1. Multi-tenancy Strategy
   - Giải thích cơ chế AsyncLocalStorage + Mongoose global plugin
   - Vì sao chọn cách này thay vì filter thủ công ở từng service
   - Lưu ý về việc ALS không tự xuyên qua BullMQ worker boundary, và cách xử lý

2. Authorization Model
   - Giải thích 2 tầng role (Organization: Owner/Admin/Member, Team: Lead/Member)
   - Vì sao Org Admin/Owner KHÔNG bypass được quyền sửa/duyệt task (least privilege)
   - Approval state machine: diagram dạng text hoặc mermaid

3. Design Trade-offs
   - Vì sao chọn model 1-user-1-organization (thay vì multi-org membership kiểu Slack)
   - Trade-off đã cân nhắc, hướng mở rộng nếu cần đổi trong tương lai

4. Async Job Processing
   - BullMQ + Redis cho reminder/notification
   - Cách tenant context được tái tạo lại trong worker process

5. Performance Optimization
   - Compound indexing theo ESR rule, link tới BENCHMARK_RESULTS.md

6. Future Improvements
   - Liệt kê rõ: upload-image, report export, escalation/delegation, audit trail nâng cao,
     multi-org membership — những gì đã cân nhắc nhưng cố tình không làm ở phiên bản này,
     kèm lý do ngắn gọn tại sao.

Dùng đúng thông tin thật từ codebase, không bịa chi tiết không có trong code.
```

### Kết quả kỳ vọng
- [ ] CI chạy xanh trên GitHub Actions, có badge trên README
- [ ] `ARCHITECTURE.md` đầy đủ 6 mục, phản ánh đúng code thật

---

## PHASE 7 — Deploy (tránh cold start)

### 7.1. Lựa chọn hạ tầng (đã thống nhất — ưu tiên theo thứ tự)

1. **Oracle Cloud Free Tier (Always Free VM) + Docker Compose** — ổn định nhất, $0 vĩnh viễn, không cold start
2. **Railway** — nhanh hơn để setup, theo dõi credit sử dụng
3. **MongoDB Atlas Free Tier (M0) + Redis Cloud Free Tier** — dùng chung cho cả 2 lựa chọn trên

### 7.2. Việc cần làm trước khi deploy (checklist)

- [ ] `BASE_URL` frontend đã dùng biến môi trường (Phase 2)
- [ ] `.env.example` đầy đủ, không commit `.env` thật
- [ ] Dockerfile production cho backend (multi-stage build, không copy `node_modules` dev dependencies)
- [ ] Seed script tạo data demo (1 organization mẫu, vài user, vài task ở nhiều trạng thái khác nhau) để link demo luôn có nội dung xem ngay

### Prompt gợi ý cho AI (Phase 7)

```
Chuẩn bị deploy production cho TaskForge:

1. Viết Dockerfile multi-stage cho backend/ (build stage dùng node:20, production stage
   chỉ copy dist/ + node_modules production, không copy devDependencies)

2. Kiểm tra docker-compose.yml hiện có, điều chỉnh để phù hợp môi trường production
   (không expose port MongoDB/Redis ra ngoài, chỉ backend API được public)

3. Viết script backend/scripts/seed-demo-data.ts:
   - Tạo 1 Organization mẫu "Demo Agency"
   - 3 Team: Design, Sales, Dev
   - 5-6 User với các role khác nhau (Owner, Admin, 2 Team Lead, vài Member)
   - 10-15 Task ở đủ trạng thái: Pending, In Progress, Pending Approval, Completed, Rejected
   - In ra thông tin đăng nhập demo (email/password) để dùng khi giới thiệu cho nhà tuyển dụng

4. Kiểm tra file .env.example đã liệt kê đủ biến môi trường cần thiết
   (MONGODB_URI, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, EMAIL config, PORT, CORS_ORIGIN)

5. Đảm bảo CORS trong main.ts cho phép đúng domain frontend production
   (không để wildcard * trong production)

Sau khi chuẩn bị xong các file trên, hướng dẫn tôi từng bước deploy lên [Oracle Cloud / Railway
- chọn 1] bao gồm: cách tạo instance, cách set biến môi trường, cách trỏ domain,
cách verify service đang chạy đúng.
```

### Kết quả kỳ vọng
- [ ] Backend + Redis + MongoDB chạy ổn định trên hạ tầng đã chọn, không sleep
- [ ] Frontend deploy lên Vercel/Netlify, trỏ đúng API production
- [ ] Có tài khoản demo sẵn để nhà tuyển dụng đăng nhập thử ngay
- [ ] Link demo đưa vào CV/README hoạt động ổn định khi test nhiều lần trong ngày

---

## Checklist tổng kết trước khi coi là "hoàn thành"

- [ ] Phase 1: Không thể bypass approval, không thể self-approve
- [ ] Phase 2: Không còn API path nào 404 khi FE gọi
- [ ] Phase 3: Mọi tính năng BE có UI tương ứng, test tay 10 bước pass hết
- [ ] Phase 4: Unit test pass, có coverage report cho 2 file nhạy cảm nhất
- [ ] Phase 5: Có script + số liệu benchmark thật
- [ ] Phase 6: CI xanh, có ARCHITECTURE.md
- [ ] Phase 7: Link demo sống, có tài khoản demo, không cold start

Khi tất cả checkbox trên được tick, CV/README có thể cập nhật theo đúng nội dung đã thống nhất trong các phiên bản mô tả trước đó — lúc này mọi bullet point đều có bằng chứng thật đứng sau, không còn là "kế hoạch".
